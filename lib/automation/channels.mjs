import 'server-only';
import { randomUUID } from 'node:crypto';
import { CATEGORIES, categoryLabel } from '../product.mjs';
import { transaction } from './db.mjs';
import { AutomationError, publicMessage } from './errors.mjs';
import { encryptCredentials } from './vault.mjs';
import { normalizeAutomationSchedule, nextScheduledAt } from './schedule.mjs';
import { getStatus, ensureSettings, setMode, addLog } from './repository.mjs';
import { verifyDestination } from './oauth-resources.mjs';
import { requireOAuthConfig } from './oauth-config.mjs';
import { billingStatus, entitlements } from '../billing/repository.mjs';
import { accountRef, connectionRef, jobRef, jobsFor, data, ms, iso, defaultSettings, readAccount, writeAccount, connected, ACTIVE, validChannelId, validConnectionId } from './firestore.mjs';
const sitesRef = (db, uid) => accountRef(db, uid).collection('websites');
const accountsQuery = (db, uid) => db.collection('pincraft_accounts').where('user_id', '==', uid);
const plainName = value => typeof value === 'string' && value.trim().length >= 3 && value.trim().length <= 70 && !/[\u0000-\u001f<>]/.test(value) ? value.trim() : null;
const planRequired = () => new AutomationError('subscription_required', 'Your free workspace includes one Pinterest account and one website. An approved, unexpired subscription is required for additional connections.', { status: 402 });
function capacityCheck(access, profiles, sites, pinterestId, siteId) {
  const orderedProfiles = profiles.filter(row => row.provider === 'pinterest' && connected(row)).sort((a, b) => ms(a.created_at) - ms(b.created_at));
  const orderedSites = sites.filter(row => !row.removed).sort((a, b) => ms(a.created_at) - ms(b.created_at));
  const pIndex = orderedProfiles.findIndex(row => row.connection_id === pinterestId), sIndex = orderedSites.findIndex(row => row.id === siteId);
  if (pIndex < 0 || sIndex < 0) throw new AutomationError('connections_required', 'Connect your Pinterest account and add an owned Blogger website in Connector first.', { status: 409 });
  if (pIndex >= access.limits.pinterest || sIndex >= access.limits.websites) throw planRequired();
  return pIndex > 0 || sIndex > 0;
}
export async function addWebsite(db, uid, raw, { send } = {}) {
  if (Object.keys(raw).some(key => !['action', 'connectionId', 'blogId'].includes(key)) || !validConnectionId(raw.connectionId)) throw new AutomationError('invalid_destination', 'Choose a blog from one of your connected Blogger accounts.');
  const verified = await verifyDestination(db, uid, 'blogger', raw.blogId, send, raw.connectionId), id = `blogger_${verified.id}`, ref = sitesRef(db, uid).doc(id);
  await transaction(db, async tx => {
    const [existing, all, auth, access] = await Promise.all([tx.get(ref), tx.get(sitesRef(db, uid)), tx.get(connectionRef(db, uid, 'blogger', raw.connectionId)), entitlements(db, uid, tx)]);
    if (!connected(data(auth)) || data(auth).revision !== verified.revision) throw new AutomationError('oauth_changed', 'Blogger authorization changed. Reload your websites and try again.', { status: 409 });
    const other = all.docs.map(data).filter(row => row.id !== id && !row.removed);
    if (other.length >= access.limits.websites) throw planRequired();
    tx.set(ref, { id, user_id: uid, provider: 'blogger', blog_id: verified.id, name: verified.name, url: verified.url, connection_id: raw.connectionId, connection_revision: verified.revision, removed: false, created_at: data(existing)?.created_at || new Date(), updated_at: new Date() });
    addLog(db, uid, null, 'website_verified', 'success', 'An owned Blogger website was verified and added to Connector. No article was published.', tx);
  }); return { id };
}
export async function removeWebsite(db, uid, raw) {
  if (raw.confirm !== true || !/^blogger_\d{3,40}$/.test(raw.id || '')) throw new AutomationError('confirmation_required', 'Confirm website removal.');
  await transaction(db, async tx => {
    const ref = sitesRef(db, uid).doc(raw.id), [site, all] = await Promise.all([tx.get(ref), tx.get(accountsQuery(db, uid))]);
    if (!site.exists || data(site).user_id !== uid) throw new AutomationError('not_found', 'This website was not found.', { status: 404 });
    const linked = all.docs.map(data).filter(row => row.website_id === raw.id && !row.archived), jobs = await Promise.all(linked.filter(row => row.active_job_id).map(row => tx.get(jobRef(db, row.active_job_id))));
    if (jobs.some(snapshot => ms(data(snapshot)?.lease_until) > Date.now())) throw new AutomationError('worker_busy', 'An in-flight publication may finish. Pause the automation and wait before removing this website.', { status: 409 });
    tx.update(ref, { removed: true, updated_at: new Date() });
    for (const row of linked) { row.enabled = false; row.last_error = 'Your selected website was removed. Select an authorized website before resuming.'; row.connection_version++; writeAccount(tx, db, row); }
    addLog(db, uid, null, 'website_removed', 'info', 'Website removed from Connector. Related automations are paused; existing published articles were not deleted.', tx);
  });
}
export async function saveAutomation(db, uid, raw, { send } = {}) {
  const allowed = ['action', 'id', 'name', 'pinterestConnectionId', 'boardId', 'websiteId', 'categoryIds', 'dailyLimit', 'postingTimes', 'timezone', 'language', 'processingConsent'];
  if (Object.keys(raw).some(key => !allowed.includes(key)) || (raw.id && !validChannelId(raw.id)) || !validConnectionId(raw.pinterestConnectionId) || !/^blogger_\d{3,40}$/.test(raw.websiteId || '') || raw.processingConsent !== true) throw new AutomationError('invalid_automation', 'Choose your connected Pinterest account, owned website and content categories, and allow automated AI processing.');
  let schedule; try { schedule = normalizeAutomationSchedule(raw); } catch (issue) { throw new AutomationError('invalid_schedule', issue.message); }
  const name = plainName(raw.name); if (!name) throw new AutomationError('invalid_automation', 'Give this automation a 3–70 character name.');
  const site = data(await sitesRef(db, uid).doc(raw.websiteId).get());
  if (!site || site.user_id !== uid || site.removed) throw new AutomationError('connections_required', 'Add your own Blogger website in Connector first.', { status: 409 });
  const [pinterest, blogger] = await Promise.all([verifyDestination(db, uid, 'pinterest', raw.boardId, send, raw.pinterestConnectionId), verifyDestination(db, uid, 'blogger', site.blog_id, send, site.connection_id)]);
  await ensureSettings(db, uid);
  const id = raw.id || randomUUID();
  await transaction(db, async tx => {
    const [existing, root, p, b, allProfiles, allSites, allAccounts, access] = await Promise.all([tx.get(accountRef(db, uid, id)), tx.get(accountRef(db, uid)), tx.get(connectionRef(db, uid, 'pinterest', raw.pinterestConnectionId)), tx.get(connectionRef(db, uid, 'blogger', site.connection_id)), tx.get(accountRef(db, uid).collection('connections')), tx.get(sitesRef(db, uid)), tx.get(accountsQuery(db, uid)), entitlements(db, uid, tx)]);
    const profiles = allProfiles.docs.map(doc => ({ ...data(doc), connection_id: doc.id })), sites = allSites.docs.map(data), current = data(existing), legacy = data(root), savedSite = sites.find(row => row.id === site.id);
    if (!savedSite || savedSite.removed || savedSite.connection_id !== site.connection_id) throw new AutomationError('destination_changed', 'The website connection changed. Reload before saving.', { status: 409 });
    const needsPaid = capacityCheck(access, profiles, sites, raw.pinterestConnectionId, site.id);
    if (!connected(data(p)) || !connected(data(b)) || data(p).revision !== pinterest.revision || data(b).revision !== blogger.revision || data(p).account_key !== pinterest.accountKey) throw new AutomationError('oauth_changed', 'Account authorization changed during verification. Reload and try again.', { status: 409 });
    if (current && (current.user_id !== uid || current.channel_id !== id || current.archived)) throw new AutomationError('not_found', 'This automation was not found.', { status: 404 });
    if (allAccounts.docs.map(data).some(row => row.channel_id && row.channel_id !== id && !row.archived && row.pinterest_account_key === pinterest.accountKey)) throw new AutomationError('automation_exists', 'This Pinterest account already has an automation. Edit that automation to change its categories or website instead of creating overlapping schedules.', { status: 409 });
    const relevant = [current, legacy].filter(Boolean), jobs = await Promise.all(relevant.filter(row => row.active_job_id).map(row => tx.get(jobRef(db, row.active_job_id))));
    if (jobs.some(snapshot => { const job = data(snapshot); return job && (ACTIVE.includes(job.state) || job.state === 'attention'); })) throw new AutomationError('saved_job_pending', 'Finish or explicitly review the saved publication before changing its destinations.', { status: 409 });
    const row = current || defaultSettings(uid, id);
    Object.assign(row, { name, channel_id: id, enabled: false, archived: false, category_ids: schedule.categoryIds, topics: schedule.categoryIds.map(categoryLabel), topic_source: 'categories', topic_index: 0, language: schedule.language, timezone: schedule.timezone, daily_limit: schedule.dailyLimit, posting_times: schedule.postingTimes, schedule_mode: 'slots', posting_mode: 'generated', interval_minutes: 60, next_run_at: nextScheduledAt(new Date(), schedule.timezone, schedule.postingTimes), pinterest_connection_id: raw.pinterestConnectionId, pinterest_board_id: pinterest.id, pinterest_board_name: pinterest.name, pinterest_account_key: pinterest.accountKey, pinterest_revision: pinterest.revision, blogger_connection_id: site.connection_id, blogger_blog_id: blogger.id, blogger_blog_name: blogger.name, blogger_blog_url: blogger.url, blogger_revision: blogger.revision, website_id: site.id, subscription_required: needsPaid, credentials: encryptCredentials(uid, { aiProvider: 'managed', model: 'automatic' }), connection_summary: { consentAt: new Date().toISOString() }, connection_version: row.connection_version + 1, last_error: null });
    if (legacy?.enabled) { legacy.enabled = false; writeAccount(tx, db, legacy); }
    tx.update(sitesRef(db, uid).doc(site.id), { connection_revision: blogger.revision, updated_at: new Date() });
    writeAccount(tx, db, row);
    addLog(db, uid, null, 'automation_saved', 'success', `Automation “${name}” saved with ${schedule.dailyLimit} daily Pin${schedule.dailyLimit === 1 ? '' : 's'} and ${schedule.categoryIds.length} categor${schedule.categoryIds.length === 1 ? 'y' : 'ies'}. It remains paused until publishing is authorized.`, tx);
  }); return { id, enabled: false };
}
export async function toggleAutomation(db, uid, raw, infrastructure) {
  if (!validChannelId(raw.id) || typeof raw.enabled !== 'boolean' || (raw.enabled && raw.publishingConsent !== true)) throw new AutomationError('consent_required', 'Select your saved automation and explicitly authorize real scheduled publishing.');
  const row = data(await accountRef(db, uid, raw.id).get());
  if (!row || row.user_id !== uid || row.archived) throw new AutomationError('not_found', 'This automation was not found.', { status: 404 });
  if (raw.enabled) {
    if (!infrastructure.ready) throw new AutomationError('setup_required', 'Your automation is saved, but background publishing is not available yet. It has not been activated.', { status: 503 });
    requireOAuthConfig('pinterest'); requireOAuthConfig('blogger');
  }
  await setMode(db, uid, raw.enabled, raw.id); return { id: raw.id, enabled: raw.enabled };
}
export async function archiveAutomation(db, uid, raw) {
  if (!validChannelId(raw.id) || raw.confirm !== true) throw new AutomationError('confirmation_required', 'Confirm automation removal.');
  await transaction(db, async tx => {
    const row = await readAccount(tx, db, uid, raw.id), active = row.active_job_id ? data(await tx.get(jobRef(db, row.active_job_id))) : null;
    if (!row.name || row.archived) throw new AutomationError('not_found', 'This automation was not found.', { status: 404 });
    if (row.attention_count || (active && ACTIVE.includes(active.state))) throw new AutomationError('saved_job_pending', 'Review or finish the saved publication before removing this automation.', { status: 409 });
    row.enabled = false; row.archived = true; writeAccount(tx, db, row); addLog(db, uid, null, 'automation_archived', 'info', 'Automation removed. Published posts and private Library content were not deleted.', tx);
  });
}
export async function workspaceStatus(db, user, infrastructure) {
  if (!user) return { authenticated: false, accountId: null, profiles: [], websites: [], automations: [], metrics: null, recent: [], reviews: [], logs: [], infrastructure, categories: CATEGORIES, billing: null, serverTime: new Date().toISOString() };
  const [status, accounts, profilesSnap, websitesSnap, billing, reviewsSnap] = await Promise.all([getStatus(db, user.id), accountsQuery(db, user.id).get(), accountRef(db, user.id).collection('connections').get(), sitesRef(db, user.id).get(), billingStatus(db, user), jobsFor(db, user.id).where('state', 'in', ['attention', 'failed']).orderBy('created_at', 'desc').limit(100).get()]);
  const accountRows = accounts.docs.map(data), profiles = profilesSnap.docs.map(doc => ({ ...data(doc), connection_id: doc.id }));
  const realProfiles = profiles.filter(row => row.encrypted_tokens || row.status === 'reconnect_required');
  const profilePublic = row => ({ id: row.connection_id, provider: row.provider, name: row.account_name || null, connected: connected(row), status: row.status, lastError: publicMessage(row.last_error), refreshedAt: iso(row.last_refreshed_at), accessExpiresAt: iso(row.expires_at), revocationStatus: row.revocation_status || null });
  const websites = websitesSnap.docs.map(data).filter(row => !row.removed).map(row => { const auth = profiles.find(profile => profile.connection_id === row.connection_id && profile.provider === 'blogger'); return { id: row.id, provider: row.provider, name: row.name, url: row.url, connectionId: row.connection_id, blogId: row.blog_id, connected: connected(auth), authorizationChanged: auth?.revision !== row.connection_revision }; });
  const automations = accountRows.filter(row => row.channel_id && !row.archived).map(row => ({ id: row.channel_id, name: row.name, enabled: row.enabled, categoryIds: row.category_ids || [], dailyLimit: Math.min(6, row.daily_limit), postingTimes: row.posting_times || [], timezone: row.timezone, language: row.language || 'en', pinterestConnectionId: row.pinterest_connection_id, pinterestName: profiles.find(profile => profile.connection_id === row.pinterest_connection_id)?.account_name || null, boardId: row.pinterest_board_id, boardName: row.pinterest_board_name, websiteId: row.website_id, websiteName: row.blogger_blog_name, websiteUrl: row.blogger_blog_url, nextRunAt: row.enabled ? iso(row.active_due_at || row.next_run_at) : null, lastSuccessAt: iso(row.last_success_at), lastError: publicMessage(row.last_error), requiresSubscription: Boolean(row.subscription_required), totalPublished: row.total_success, totalArticles: row.total_articles, failedPosts: row.failed_count }));
  return { authenticated: true, accountId: user.id, profiles: realProfiles.map(profilePublic), websites, automations, metrics: { totalPublished: accountRows.reduce((total, row) => total + (row.total_success || 0), 0), articlesPublished: accountRows.reduce((total, row) => total + (row.total_articles || 0), 0), failedPosts: accountRows.reduce((total, row) => total + (row.failed_count || 0), 0), publishedToday: status.todayCount, activeAutomations: automations.filter(row => row.enabled).length }, reviews: reviewsSnap.docs.map(doc => { const row = data(doc); return { id: row.id, kind: row.kind, topic: row.topic, title: row.content?.title || null, state: row.state, uncertain_step: row.uncertain_step, blog_url: row.blog_url || null }; }), recent: status.recent, logs: status.logs, heartbeat: status.heartbeat, infrastructure, categories: CATEGORIES, billing, serverTime: new Date().toISOString() };
}
