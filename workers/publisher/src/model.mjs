import { digest, fail, validUid, connectionId, validId, publicHttps, publicOrigin, utf8 } from './security.mjs';
import { milliseconds as ms, subscriptionState, reserveQuota, finishQuota } from '../../../lib/publishing/policy.mjs';
export { ms, subscriptionState, reserveQuota, finishQuota };
export const TICK_MS = 10 * 60000, LEASE_MS = 8 * 60000, MAX_ATTEMPTS = 3;
export const providers = ['pinterest', 'blogger'];
export const scopes = { pinterest: ['pins:read', 'pins:write', 'boards:read', 'boards:write', 'user_accounts:read'], blogger: ['https://www.googleapis.com/auth/blogger'] };
export const ownerPath = async uid => { if (!validUid(uid)) fail('unauthorized', 'A verified account is required.', { status: 401 }); return 'pincraft_accounts/' + await digest(uid); };
export const connPath = async (uid, provider, id = provider) => { if (!providers.includes(provider) || !connectionId(id)) fail('invalid_connection', 'Choose one of your own connected accounts.'); return await ownerPath(uid) + '/connections/' + id; };
export const jobPath = id => { if (!validId(id)) fail('invalid_job', 'Select one of your publishing jobs.'); return 'publish_jobs/' + id; };
export const quotaPath = key => { if (!/^[a-f0-9]{64}$/.test(key || '')) fail('pinterest_identity_required', 'Reconnect Pinterest so it can confirm its permanent account identity.', { status: 409 }); return 'pincraft_pin_limits/' + key; };
export const accountKey = async (provider, id) => digest((provider === 'pinterest' ? 'pinterest-account:' : 'blogger-account:') + id);
export const connected = row => row?.status === 'connected' && Boolean(row.encrypted_tokens);
export function owned(row, uid, provider) { if (!row || row.user_id !== uid || row.provider !== provider || !connected(row)) fail('reconnect_required', `Connect ${provider === 'pinterest' ? 'Pinterest' : 'Blogger'} with its own publishing consent before continuing.`, { status: 409 }); return row; }
export function emptyConnection(uid, provider, id = provider) { return { user_id: uid, provider, connection_id: id, account_key: null, account_name: null, encrypted_tokens: null, status: 'disconnected', scopes: [], expires_at: null, refresh_expires_at: null, maintenance_at: null, revision: 1, token_version: 1, refresh_lease: null, refresh_lease_until: null, last_refreshed_at: null, last_error: null, revocation_status: 'not_requested', created_at: new Date(), updated_at: new Date() }; }
export const maintenanceAt = (expires, refreshExpires) => new Date(Math.min(expires ? ms(expires) - 5 * 60000 : Date.now() + 86400000, refreshExpires ? ms(refreshExpires) - 7 * 86400000 : Infinity));
export function config(env, provider) {
  if (!providers.includes(provider)) fail('invalid_provider', 'Choose Pinterest or Blogger.', { status: 404 });
  const origin = publicOrigin(env.APP_URL), prefix = provider === 'pinterest' ? 'PINTEREST' : 'GOOGLE', clientId = env[prefix + '_CLIENT_ID'] || '', clientSecret = env[prefix + '_CLIENT_SECRET'] || '', redirectUri = env[prefix + '_REDIRECT_URI'] || '';
  const configured = /^[A-Za-z0-9._-]{3,220}$/.test(clientId) && clientSecret.length >= 8 && clientSecret.length <= 6000 && !/[\u0000-\u001f\u007f]/.test(clientSecret) && redirectUri === `${origin}/api/${provider}/callback`;
  return { provider, origin, clientId, clientSecret, redirectUri, configured };
}
export function requireConfig(env, provider) { const c = config(env, provider); if (!c.configured) fail('publisher_setup_required', `${provider === 'pinterest' ? 'Pinterest' : 'Blogger'} publishing needs its app credentials and exact registered callback. No connection was simulated.`, { status: 503 }); return c; }
export function tier(env, consent = false) { if (env.PINTEREST_ACCESS_TIER === 'standard') return 'standard'; if (env.PINTEREST_ACCESS_TIER === 'trial' && consent === true) return 'trial'; fail('pinterest_access_tier', 'Public publishing requires approved Standard access. A configured Trial app can test only with explicit creator-only sandbox consent.', { status: 409 }); }
export const publicConnection = (row, id = row.connection_id) => ({ id, provider: row.provider, name: row.account_name || null, connected: connected(row), status: row.status, lastError: row.last_error || null, accessExpiresAt: iso(row.expires_at), refreshedAt: iso(row.last_refreshed_at), revocationStatus: row.revocation_status || null });
export const iso = value => value && Number.isFinite(ms(value)) ? new Date(ms(value)).toISOString() : null;
export function publicJob(row) { return { id: row.id, ownerUID: row.ownerUID, type: row.type, title: row.type === 'blogger' ? row.payload.article.title : row.payload.pin.title, status: row.status, phase: row.phase, publishAtUTC: iso(row.publishAtUTC), pinPublishAtUTC: iso(row.pinPublishAtUTC), timezone: row.timezone, attempts: row.attempts, error: row.error || null, resultURL: row.resultURL || null, remoteId: row.remoteId || null, draftURL: row.draftURL || null, bloggerJobId: row.bloggerJobId || null, dependentPinId: row.dependentPinId || null, visibility: row.visibility, httpStatus: row.httpStatus || null, nextCheckAtUTC: iso(row.runAtUTC), createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt), canRetry: ['failed', 'retry'].includes(row.status) && row.attempts < MAX_ATTEMPTS, needsReview: row.status === 'needs_review', boardId: row.payload.pin?.boardId || row.payload.plannedPin?.boardId || null, pinterestConnectionId: row.payload.pin?.connectionId || row.payload.plannedPin?.connectionId || null }; }
export async function saveJob(tx, row) { tx.set(jobPath(row.id), row); tx.set(await ownerPath(row.ownerUID) + '/publish_job_views/' + row.id, publicJob(row)); }
export function requireCapacity(access, profiles, websites, pId, siteId = null) {
  const ordered = profiles.filter(connected).sort((a, b) => ms(a.created_at) - ms(b.created_at) || a.connection_id.localeCompare(b.connection_id));
  if (pId) { const index = ordered.filter(row => row.provider === 'pinterest').findIndex(row => row.connection_id === pId); if (index < 0 || index >= access.limits.pinterest) fail('subscription_required', 'An active, approved subscription is required for additional Pinterest accounts.', { status: 402 }); }
  if (siteId) { const index = websites.filter(row => !row.removed).sort((a, b) => ms(a.created_at) - ms(b.created_at) || a.id.localeCompare(b.id)).findIndex(row => row.id === siteId); if (index < 0 || index >= access.limits.websites) fail('subscription_required', 'An active, approved subscription is required for additional websites.', { status: 402 }); }
}
export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function validateHTML(value) {
  if (typeof value !== 'string' || utf8(value).length < 50 || utf8(value).length > 100000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail('invalid_article', 'Review an article between 50 bytes and 100 KB. Images are stored as references, not embedded data.');
  let at = 0; const stack = [], tokens = value.matchAll(/<[^>]*>/g), allowed = new Set(['p','h2','h3','ul','ol','li','strong','em','blockquote']);
  for (const token of tokens) {
    if (value.slice(at, token.index).includes('<')) fail('invalid_html', 'Use simple article formatting, not scripts, attributes, embedded images or widgets.');
    const match = /^<(\/?)([a-z0-9]+)>$/.exec(token[0]);
    if (token[0] !== '<br>' && (!match || !allowed.has(match[2]))) fail('invalid_html', 'Allowed article HTML: p, h2, h3, ul, ol, li, strong, em, blockquote and br, without attributes. Add a hosted featured image separately.');
    if (match && allowed.has(match[2])) { if (match[1]) { if (stack.pop() !== match[2]) fail('invalid_html', 'Close the article formatting tags in their original order.'); } else stack.push(match[2]); }
    at = token.index + token[0].length;
  }
  if (stack.length || value.slice(at).includes('<') || !value.replace(/<[^>]*>/g, '').trim()) fail('invalid_html', 'The article HTML is incomplete. Check the preview and close its formatting tags.');
  return value;
}
const text = (value, max, name) => { if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[<>\u0000-\u001f\u007f]/.test(value)) fail('invalid_content', `Review ${name} and keep it within ${max} characters, without markup.`); return value.trim(); };
export function reviewPayload(raw, now = Date.now()) {
  const allowed = ['requestId','article','pin','bloggerConnectionId','websiteId','blogPublishAtUTC','pinPublishAtUTC','timezone','reviewed','trialConsent'];
  if (!raw || Object.keys(raw).some(k => !allowed.includes(k)) || raw.reviewed !== true || !validId(raw.requestId) || !connectionId(raw.bloggerConnectionId) || !/^blogger_\d{3,40}$/.test(raw.websiteId || '')) fail('review_required', 'Review this article and this specific Pin, then select your own blog and board.');
  if (!raw.article || Object.keys(raw.article).some(k => !['title','html','featuredImageUrl'].includes(k)) || !raw.pin || Object.keys(raw.pin).some(k => !['title','description','hashtags','imageUrl','altText','boardId','connectionId'].includes(k))) fail('invalid_content', 'Send only the reviewed article, Pin and destination fields.');
  if (!connectionId(raw.pin.connectionId) || !/^\d{3,40}$/.test(raw.pin.boardId || '')) fail('invalid_destination', 'Select an owned Pinterest board.');
  const tags = Array.isArray(raw.pin.hashtags) ? [...new Set(raw.pin.hashtags)] : [];
  if (tags.length > 10 || tags.some(t => typeof t !== 'string' || !/^#[A-Za-z0-9_]{1,30}$/.test(t))) fail('invalid_hashtags', 'Use at most ten hashtags, with letters, numbers and underscores.');
  const description = text(raw.pin.description, 500, 'the Pin description'); if ((description + (tags.length ? '\n' + tags.join(' ') : '')).length > 500) fail('invalid_description', 'The description and hashtags together must be at most 500 characters.');
  const times = [raw.blogPublishAtUTC, raw.pinPublishAtUTC].map(value => { if (value === 'now') return now; if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) fail('invalid_schedule', 'Send an explicit UTC schedule or choose Publish now.'); return Date.parse(value); });
  if (times.some(t => t < now - 60000 || t > now + 366 * 86400000) || times[1] < times[0]) fail('invalid_schedule', 'Choose dates within one year. The Pin cannot precede the article; it waits for a genuinely live URL.');
  try { new Intl.DateTimeFormat('en', { timeZone: raw.timezone }).format(); if (typeof raw.timezone !== 'string' || raw.timezone.length > 100) throw new Error(); } catch { fail('invalid_timezone', 'Choose a valid IANA timezone.'); }
  return { article: { title: text(raw.article.title, 200, 'the article title'), html: validateHTML(raw.article.html), featuredImageUrl: raw.article.featuredImageUrl ? publicHttps(raw.article.featuredImageUrl).href : null }, pin: { title: text(raw.pin.title, 100, 'the Pin title'), description, hashtags: tags, imageUrl: publicHttps(raw.pin.imageUrl).href, altText: raw.pin.altText ? text(raw.pin.altText, 450, 'the image description') : text(raw.pin.title, 100, 'the Pin title'), boardId: raw.pin.boardId, connectionId: raw.pin.connectionId }, blogAt: new Date(times[0]), pinAt: new Date(times[1]), timezone: raw.timezone };
}
