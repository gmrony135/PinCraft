import 'server-only';
import { randomUUID } from 'node:crypto';
import { AutomationError } from '../automation/errors.mjs';
import { firebaseAuth } from '../firebase/admin.mjs';
import { transaction } from '../automation/db.mjs';
import { accountRef, connectionRef, data, ms, iso, connected } from '../automation/firestore.mjs';
import { entitlements } from '../billing/repository.mjs';
import { oauthConfig } from '../automation/oauth-config.mjs';
import { vaultReady } from '../automation/vault.mjs';
import { reviewedInput, validJobId, fingerprint, redactedError, reportedPinURL, numericId } from './content.mjs';
import { BloggerPublisher, publicationMarker, articleURL } from './blogger.mjs';
import { manualPinterestMode } from './mode.mjs';

export const FLOW = 'blogger_manual_pin', POLL_MS = 10 * 60000, LEASE_MS = 8 * 60000, MAX_ATTEMPTS = 3;
const runnable = new Set(['queued', 'processing', 'scheduled', 'waiting_live', 'retry', 'awaiting_manual_time']);
const views = (db, uid) => accountRef(db, uid).collection('publish_job_views');
const sites = (db, uid) => accountRef(db, uid).collection('websites');
const ref = (db, id) => {
  if (!validJobId(id)) throw new AutomationError('invalid_job', 'Select one of your publishing jobs.');
  return db.collection('publish_jobs').doc(id);
};
function selectedMode() {
  if (!manualPinterestMode()) throw new AutomationError('publishing_mode_changed', 'This reviewed Blogger runner requires Blogger automatic + Pinterest manual mode.', { status: 409 });
}
function own(row, uid = null) {
  if (!row || row.flow !== FLOW || (uid && row.ownerUID !== uid)) throw new AutomationError('not_found', 'This publishing job was not found in your account.', { status: 404 });
  return row;
}
export function publicJob(row) {
  return {
    id: row.id, ownerUID: row.ownerUID, type: row.type,
    title: row.type === 'blogger' ? row.payload.article.title : row.payload.pin.title,
    status: row.status, phase: row.phase, publishAtUTC: iso(row.publishAtUTC), pinReadyAtUTC: iso(row.pinReadyAtUTC), timezone: row.timezone,
    attempts: row.attempts, error: row.error || null, resultURL: row.resultURL || null, reportedPinURL: row.reportedPinURL || null,
    verification: row.type === 'blogger' && row.resultURL ? 'blogger_live_verified' : row.reportedPinURL ? 'user_reported_not_verified' : null,
    remoteId: row.remoteId || null, bloggerJobId: row.bloggerJobId || null, manualTaskId: row.manualTaskId || null,
    nextCheckAtUTC: iso(row.reviewedRunAtUTC), createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt),
    canRetry: ['failed', 'retry'].includes(row.status) && row.attempts < MAX_ATTEMPTS, needsReview: row.status === 'needs_review',
    ...(row.type === 'manual_pin' ? { manualPin: { ...row.payload.pin, articleURL: row.payload.articleURL } } : {}),
  };
}
function put(tx, db, row) {
  const record = { ...row };
  // Terminal records MUST lose their due field, not retain an old indexed time.
  if (record.reviewedRunAtUTC === undefined) delete record.reviewedRunAtUTC;
  tx.set(ref(db, row.id), record);
  tx.set(views(db, row.ownerUID).doc(row.id), publicJob(record));
}
function siteCapacity(access, all, id) {
  const ordered = all.filter(row => !row.removed).sort((a, b) => ms(a.created_at) - ms(b.created_at) || a.id.localeCompare(b.id));
  const index = ordered.findIndex(row => row.id === id);
  if (index < 0 || index >= access.limits.websites) throw new AutomationError('subscription_required', 'Your free workspace includes one Blogger website. An approved, unexpired subscription is required for an additional site.', { status: 402 });
}
function assertDestination(auth, site, uid, payload) {
  if (!connected(auth) || auth.user_id !== uid || auth.provider !== 'blogger' || auth.revision !== payload.bloggerRevision || auth.account_key !== payload.bloggerAccountKey) {
    throw new AutomationError('oauth_changed', 'Blogger was disconnected or reauthorized. Reconnect the original Google account, re-verify the site, then explicitly reconfirm Retry.', { status: 409 });
  }
  if (!site || site.user_id !== uid || site.removed || site.connection_id !== payload.bloggerConnectionId || site.connection_revision !== auth.revision || site.blog_id !== payload.blogId || site.url !== payload.blogURL) {
    throw new AutomationError('website_verification_required', 'The selected website changed or needs re-verification. Restore and verify the same blog before continuing.', { status: 409 });
  }
}
const authorize = async uid => {
  let user;
  try { user = await firebaseAuth().getUser(uid); }
  catch { throw new AutomationError('account_unavailable', 'This account cannot currently authorize scheduled publishing.', { status: 403 }); }
  if (user.disabled || !user.emailVerified || !user.providerData.some(p => ['password', 'google.com'].includes(p.providerId))) throw new AutomationError('account_unavailable', 'This account no longer has verified publishing access.', { status: 403 });
};
async function currentDestination(db, job) {
  const [auth, site] = await db.getAll(connectionRef(db, job.ownerUID, 'blogger', job.payload.bloggerConnectionId), sites(db, job.ownerUID).doc(job.payload.websiteId));
  assertDestination(data(auth), data(site), job.ownerUID, job.payload);
}
function clearLock(tx, snapshot, job) {
  const auth = data(snapshot);
  if (auth?.reviewed_publish_job === job.id && auth.reviewed_publish_lease === job.lease) tx.set(snapshot.ref, { ...auth, reviewed_publish_job: null, reviewed_publish_lease: null, reviewed_publish_until: null });
}

export async function publishingStatus(db, uid) {
  const [all, websites, access, heartbeat] = await Promise.all([accountRef(db, uid).collection('connections').get(), sites(db, uid).get(), entitlements(db, uid), db.doc('publisher_system/reviewed_blogger').get()]);
  const blog = oauthConfig('blogger'), savedProfiles = all.docs.map(doc => ({ ...data(doc), connection_id: doc.id }));
  return {
    accountId: uid, mode: FLOW, configured: manualPinterestMode(),
    providers: { blogger: { configured: blog.configured && vaultReady(), redirectUri: blog.redirectUri }, pinterest: { configured: false, mode: 'manual' } },
    profiles: savedProfiles.filter(row => row.provider === 'blogger' && (row.encrypted_tokens || row.status === 'reconnect_required')).map(row => ({ id: row.connection_id, provider: 'blogger', name: row.account_name || null, connected: connected(row), status: row.status, lastError: row.last_error || null })),
    websites: websites.docs.map(data).filter(row => !row.removed).map(row => { const auth = savedProfiles.find(p => p.provider === 'blogger' && p.connection_id === row.connection_id); return { id: row.id, name: row.name, url: row.url, blogId: row.blog_id, connectionId: row.connection_id, connectionRevision: row.connection_revision, connected: connected(auth), authorizationChanged: !auth || auth.revision !== row.connection_revision }; }),
    subscription: access, cron: { expression: '7,17,27,37,47,57 * * * *', pollMinutes: 10, lastSeenAt: iso(data(heartbeat)?.lastSeenAt), lastOutcome: data(heartbeat)?.outcome || null }, serverTime: new Date().toISOString(),
  };
}
export async function listPublishingJobs(db, uid) {
  const result = await views(db, uid).orderBy('createdAt', 'desc').limit(100).get();
  return { accountId: uid, mode: FLOW, jobs: result.docs.map(data).filter(row => row.ownerUID === uid), limit: 100 };
}
export async function createPublishingJob(db, uid, raw, { now = Date.now() } = {}) {
  selectedMode();
  const hash = fingerprint(raw ?? null), existing = validJobId(raw?.requestId) ? data(await ref(db, raw.requestId).get()) : null;
  // Replays remain possible after time has passed or a connection has changed.
  if (existing) {
    own(existing, uid);
    if (existing.requestFingerprint !== hash) throw new AutomationError('request_changed', 'This submission ID already refers to different reviewed content. Inspect Jobs instead of replacing it.', { status: 409 });
    return { job: publicJob(existing), replayed: true };
  }
  if (!oauthConfig('blogger').configured || !vaultReady()) throw new AutomationError('oauth_setup_required', 'Blogger OAuth app credentials and encrypted server storage need configuration. No publishing was simulated.', { status: 503 });
  const value = reviewedInput(raw, now), auth = data(await connectionRef(db, uid, 'blogger', value.bloggerConnectionId).get()), site = data(await sites(db, uid).doc(value.websiteId).get());
  if (!connected(auth) || auth.user_id !== uid || auth.provider !== 'blogger') throw new AutomationError('oauth_reconnect_required', 'Connect Blogger through its separate publishing consent before scheduling.', { status: 409 });
  const payload = { article: value.article, plannedManualPin: value.pin, bloggerConnectionId: value.bloggerConnectionId, bloggerRevision: auth.revision, bloggerAccountKey: auth.account_key, blogId: site?.blog_id, blogURL: site?.url, websiteId: value.websiteId };
  assertDestination(auth, site, uid, payload);
  if (!numericId(payload.blogId) || !auth.account_key) throw new AutomationError('website_verification_required', 'Re-verify the owned Blogger website and its Google account first.', { status: 409 });
  const row = {
    id: value.requestId, flow: FLOW, ownerUID: uid, type: 'blogger', status: 'queued', phase: 'draft', publishAtUTC: value.blogAt, pinReadyAtUTC: value.pinAt, timezone: value.timezone, payload,
    attempts: 0, attemptOpen: false, error: null, resultURL: null, remoteId: null, draftURL: null, manualTaskId: randomUUID(),
    reviewedAt: new Date(now), createdAt: new Date(now), updatedAt: new Date(now), reviewedRunAtUTC: new Date(now), lease: null, leaseUntilUTC: null, mutationPending: null, requestFingerprint: hash,
  };
  let replayed = false;
  await transaction(db, async tx => {
    const [old, saved, all, access] = await Promise.all([tx.get(ref(db, row.id)), tx.get(connectionRef(db, uid, 'blogger', value.bloggerConnectionId)), tx.get(sites(db, uid)), entitlements(db, uid, tx)]);
    if (old.exists) {
      const previous = own(data(old), uid);
      if (previous.requestFingerprint !== hash) throw new AutomationError('request_changed', 'Review this changed submission again.', { status: 409 });
      replayed = true; return;
    }
    const allSites = all.docs.map(data);
    assertDestination(data(saved), allSites.find(s => s.id === value.websiteId), uid, payload);
    siteCapacity(access, allSites, value.websiteId);
    put(tx, db, row);
  });
  return { job: publicJob(own(data(await ref(db, row.id).get()), uid)), replayed };
}
async function claim(db, id, uid, now) {
  return transaction(db, async tx => {
    const row = own(data(await tx.get(ref(db, id))), uid);
    if (!runnable.has(row.status) || !row.reviewedRunAtUTC || ms(row.reviewedRunAtUTC) > now) return null;
    if (row.type === 'manual_pin') {
      if (row.status === 'awaiting_manual_time') put(tx, db, { ...row, status: 'ready_for_manual', reviewedRunAtUTC: undefined, updatedAt: new Date(now) });
      return null; // This is a reminder transition, NEVER a Pinterest mutation.
    }
    if (row.status === 'processing') {
      if (ms(row.leaseUntilUTC) > now) return null;
      const auth = await tx.get(connectionRef(db, row.ownerUID, 'blogger', row.payload.bloggerConnectionId));
      const uncertain = Boolean(row.mutationPending), exhausted = row.attempts >= MAX_ATTEMPTS;
      clearLock(tx, auth, row);
      put(tx, db, { ...row, status: uncertain ? 'needs_review' : exhausted ? 'failed' : 'retry', attemptOpen: false, reviewedRunAtUTC: uncertain || exhausted ? undefined : new Date(now + POLL_MS), lease: null, leaseUntilUTC: null,
        error: { code: uncertain ? 'publication_uncertain' : 'interrupted', message: uncertain ? 'The runner stopped during a remote mutation. Inspect the blog and verify its post ID. Automatic reposting is blocked.' : 'The runner stopped before sending the next mutation. Its saved checkpoint can be resumed within the attempt limit.', upstreamStatus: null }, updatedAt: new Date(now) });
      return null;
    }
    const attempts = row.attempts + ((row.status === 'retry' || !row.attemptOpen) ? 1 : 0);
    if (attempts > MAX_ATTEMPTS) {
      put(tx, db, { ...row, status: 'failed', reviewedRunAtUTC: undefined, error: { code: 'attempt_limit', message: 'Three attempts have been used. Retry does not reset the counter.', upstreamStatus: null }, updatedAt: new Date(now) });
      return null;
    }
    const next = { ...row, status: 'processing', attempts, attemptOpen: true, lease: randomUUID(), leaseUntilUTC: new Date(now + LEASE_MS), reviewedRunAtUTC: new Date(now + LEASE_MS), updatedAt: new Date(now) };
    put(tx, db, next); return next;
  });
}
async function beforeMutation(db, job, now) {
  return transaction(db, async tx => {
    const [rowSnap, authSnap, all, access] = await Promise.all([tx.get(ref(db, job.id)), tx.get(connectionRef(db, job.ownerUID, 'blogger', job.payload.bloggerConnectionId)), tx.get(sites(db, job.ownerUID)), entitlements(db, job.ownerUID, tx)]);
    const row = own(data(rowSnap), job.ownerUID), auth = data(authSnap), allSites = all.docs.map(data);
    if (row.status !== 'processing' || row.lease !== job.lease || ms(row.leaseUntilUTC) <= now) throw new AutomationError('job_changed', 'The runner lost its lease. No further mutation was started.', { status: 409 });
    assertDestination(auth, allSites.find(s => s.id === row.payload.websiteId), row.ownerUID, row.payload);
    siteCapacity(access, allSites, row.payload.websiteId);
    if (ms(auth.reviewed_publish_until) > now && (auth.reviewed_publish_job !== row.id || auth.reviewed_publish_lease !== row.lease)) throw new AutomationError('connection_busy', 'Another reviewed publication is using this Google connection. Its checkpoint will finish before this job retries.', { status: 409, retryable: true });
    // The SAME connection document is read by OAuth start/save/disconnect and
    // token rotation. Firestore serializes authorization replacement vs send.
    tx.set(authSnap.ref, { ...auth, reviewed_publish_job: row.id, reviewed_publish_lease: row.lease, reviewed_publish_until: row.leaseUntilUTC });
    const next = { ...row, mutationPending: row.phase === 'draft' ? 'blogger_draft' : 'blogger_publish', mutationStartedAtUTC: new Date(now), updatedAt: new Date(now) };
    put(tx, db, next); return next;
  });
}
async function checkpoint(db, job, change, now) {
  return transaction(db, async tx => {
    const [rowSnap, authSnap] = await Promise.all([tx.get(ref(db, job.id)), tx.get(connectionRef(db, job.ownerUID, 'blogger', job.payload.bloggerConnectionId))]);
    const row = own(data(rowSnap));
    if (row.status !== 'processing' || row.lease !== job.lease) throw new AutomationError('job_changed', 'The saved job changed. No result was overwritten.', { status: 409 });
    const next = { ...row, ...change, lease: null, leaseUntilUTC: null, updatedAt: new Date(now) };
    clearLock(tx, authSnap, job); put(tx, db, next); return next;
  });
}
async function completeArticle(db, job, url, now) {
  return transaction(db, async tx => {
    const row = own(data(await tx.get(ref(db, job.id))), job.ownerUID), old = data(await tx.get(ref(db, row.manualTaskId)));
    if (row.status !== 'processing' || row.lease !== job.lease) throw new AutomationError('job_changed', 'The saved job changed during public verification.', { status: 409 });
    if (old && (old.ownerUID !== row.ownerUID || old.bloggerJobId !== row.id || old.flow !== FLOW)) throw new AutomationError('job_changed', 'The manual Pin task needs inspection.', { status: 409 });
    const ready = ms(row.pinReadyAtUTC) <= now;
    const child = old || { id: row.manualTaskId, flow: FLOW, ownerUID: row.ownerUID, type: 'manual_pin', bloggerJobId: row.id, status: ready ? 'ready_for_manual' : 'awaiting_manual_time', phase: 'manual', publishAtUTC: row.pinReadyAtUTC, pinReadyAtUTC: row.pinReadyAtUTC, timezone: row.timezone, payload: { pin: row.payload.plannedManualPin, articleURL: url }, attempts: 0, resultURL: null, reportedPinURL: null, error: null, createdAt: new Date(now), updatedAt: new Date(now), ...(ready ? {} : { reviewedRunAtUTC: new Date(ms(row.pinReadyAtUTC)) }) };
    const next = { ...row, status: 'completed', phase: 'live', resultURL: url, liveCheckedAtUTC: new Date(now), completedAt: new Date(now), reviewedRunAtUTC: undefined, mutationPending: null, lease: null, leaseUntilUTC: null, error: null, updatedAt: new Date(now) };
    put(tx, db, next); if (!old) put(tx, db, child); return next;
  });
}
async function failure(db, job, error, accepted, now) {
  return transaction(db, async tx => {
    const [rowSnap, authSnap] = await Promise.all([tx.get(ref(db, job.id)), tx.get(connectionRef(db, job.ownerUID, 'blogger', job.payload.bloggerConnectionId))]);
    const row = own(data(rowSnap));
    if (row.status !== 'processing' || row.lease !== job.lease) return row;
    const uncertain = Boolean(accepted || error.uncertain || (row.mutationPending && !(error instanceof AutomationError)));
    const retry = !uncertain && error.retryable && row.attempts < MAX_ATTEMPTS;
    const delay = Math.max(POLL_MS, (error.retryAfterSeconds || 0) * 1000, POLL_MS * 2 ** Math.max(0, row.attempts - 1));
    const details = uncertain ? { code: 'publication_uncertain', message: 'The remote result is uncertain. Inspect the blog and verify its existing post ID; automatic reposting is blocked.', upstreamStatus: Number.isInteger(error.upstreamStatus) ? error.upstreamStatus : null } : redactedError(error);
    // Keep a valid accepted ID even if writing its successful checkpoint failed.
    // If Firestore is wholly unavailable, the durable pre-send marker still
    // forces lease recovery into inspection rather than creating another draft.
    const knownRemoteId = numericId(error.acceptedRemoteId) ? error.acceptedRemoteId : accepted?.remoteId;
    const next = { ...row, ...(numericId(knownRemoteId) ? { remoteId: knownRemoteId } : {}), status: uncertain ? 'needs_review' : retry ? 'retry' : 'failed', attemptOpen: false, error: details, reviewedRunAtUTC: retry ? new Date(now + delay) : undefined, lease: null, leaseUntilUTC: null, mutationPending: uncertain ? row.mutationPending : null, updatedAt: new Date(now) };
    clearLock(tx, authSnap, job); put(tx, db, next); return next;
  });
}
export async function processPublishingJob(db, id, { uid = null, send, now = () => Date.now(), authorizeOwner = authorize, publisher = new BloggerPublisher(db, { send, now }) } = {}) {
  selectedMode();
  let job = await claim(db, id, uid, now());
  if (!job) return { job: publicJob(own(data(await ref(db, id).get()), uid)), processed: false };
  let accepted = null;
  try {
    await authorizeOwner(job.ownerUID);
    if (job.type !== 'blogger') throw new AutomationError('invalid_job', 'Only Blogger is automatically published in this mode.');
    await currentDestination(db, job);
    if (job.phase === 'draft') {
      await publisher.verifyBlog(job);
      job = await beforeMutation(db, job, now());
      const result = await publisher.draft(job); accepted = { remoteId: result.remoteId };
      job = await checkpoint(db, job, { ...result, status: 'queued', phase: 'publish', mutationPending: null, reviewedRunAtUTC: new Date(now()), error: null }, now());
    } else if (job.phase === 'publish') {
      await publisher.access(job.ownerUID, job.payload.bloggerConnectionId);
      job = await beforeMutation(db, job, now());
      const result = await publisher.publish(job); accepted = { remoteId: job.remoteId };
      job = await checkpoint(db, job, { draftURL: result.draftURL, status: result.future ? 'scheduled' : 'waiting_live', phase: 'verify_live', mutationPending: null, reviewedRunAtUTC: new Date(Math.max(now(), ms(job.publishAtUTC))), error: null }, now());
    } else if (job.phase === 'verify_live') {
      const url = await publisher.live(job);
      if (url) job = await completeArticle(db, job, url, now());
      else if (now() > ms(job.publishAtUTC) + 48 * 3600000) throw new AutomationError('article_not_live', 'The post was not confirmed public within 48 hours of its due time. Inspect Blogger.', { status: 409 });
      else job = await checkpoint(db, job, { status: 'waiting_live', reviewedRunAtUTC: new Date(now() + POLL_MS), error: null }, now());
    } else throw new AutomationError('invalid_checkpoint', 'The saved Blogger checkpoint needs inspection.', { status: 409 });
    return { job: publicJob(job), processed: true, stopRun: false };
  } catch (error) {
    const row = await failure(db, job, error, accepted, now());
    return { job: publicJob(row), processed: true, stopRun: error.upstreamStatus === 429 };
  }
}
export async function retryPublishingJob(db, uid, id, body, { now = Date.now() } = {}) {
  selectedMode();
  if (Object.keys(body).some(k => k !== 'reconfirmConnection') || (body.reconfirmConnection !== undefined && typeof body.reconfirmConnection !== 'boolean')) throw new AutomationError('invalid_retry', 'Only explicit reconfirmation can be included with Retry.');
  await transaction(db, async tx => {
    const row = own(data(await tx.get(ref(db, id))), uid);
    if (row.type !== 'blogger' || !['failed', 'retry'].includes(row.status) || row.mutationPending) throw new AutomationError('review_required', 'Inspect uncertain results rather than retrying them blindly.', { status: 409 });
    if (row.attempts >= MAX_ATTEMPTS) throw new AutomationError('attempt_limit', 'Three attempts have been used; Retry cannot reset that counter.', { status: 409 });
    if (row.error?.upstreamStatus === 429 && ms(row.reviewedRunAtUTC) > now) throw new AutomationError('rate_limited', 'Wait for the rate-limit backoff before retrying.', { status: 429 });
    const [authSnap, all, access] = await Promise.all([tx.get(connectionRef(db, uid, 'blogger', row.payload.bloggerConnectionId)), tx.get(sites(db, uid)), entitlements(db, uid, tx)]);
    const auth = data(authSnap), allSites = all.docs.map(data), payload = { ...row.payload, bloggerRevision: auth?.revision };
    assertDestination(auth, allSites.find(s => s.id === row.payload.websiteId), uid, payload);
    if (auth.revision !== row.payload.bloggerRevision && body.reconfirmConnection !== true) throw new AutomationError('reconfirmation_required', 'Explicitly reconfirm using this reconnected account for this saved content.', { status: 409 });
    if (row.phase !== 'verify_live') siteCapacity(access, allSites, row.payload.websiteId);
    put(tx, db, { ...row, payload, status: 'retry', attemptOpen: false, error: null, reviewedRunAtUTC: new Date(now), updatedAt: new Date(now) });
  });
  return { job: publicJob(own(data(await ref(db, id).get()), uid)) };
}
export async function reviewPublishingJob(db, uid, id, body, { send, now = Date.now(), publisher = new BloggerPublisher(db, { send, now: () => now }) } = {}) {
  selectedMode();
  if (Object.keys(body).some(k => !['action', 'remoteId', 'inspected', 'reconfirmConnection'].includes(k)) || body.inspected !== true || !['verify', 'abandon'].includes(body.action)) throw new AutomationError('inspection_required', 'Inspect the actual Blogger post before resolving uncertainty.');
  const job = own(data(await ref(db, id).get()), uid);
  if (job.type !== 'blogger' || job.status !== 'needs_review') throw new AutomationError('review_not_required', 'This job is not awaiting remote inspection.', { status: 409 });
  let change = { status: 'cancelled', phase: job.phase, reviewedRunAtUTC: undefined, error: { code: 'owner_abandoned', message: 'Stopped after owner inspection. No remote post was deleted and no publication success was invented.', upstreamStatus: null } };
  let verifiedPayload = job.payload;
  if (body.action === 'verify') {
    // Reconnection during a crash must not make an uncertain job impossible to
    // inspect, but the original Google identity/site and explicit consent remain.
    const [authSnap, siteSnap] = await db.getAll(connectionRef(db, uid, 'blogger', job.payload.bloggerConnectionId), sites(db, uid).doc(job.payload.websiteId));
    const auth = data(authSnap);
    verifiedPayload = { ...job.payload, bloggerRevision: auth?.revision };
    assertDestination(auth, data(siteSnap), uid, verifiedPayload);
    if (auth.revision !== job.payload.bloggerRevision && body.reconfirmConnection !== true) throw new AutomationError('reconfirmation_required', 'Reconfirm inspection using the original reconnected Google account after re-verifying its blog.', { status: 409 });
    if (!numericId(body.remoteId)) throw new AutomationError('invalid_remote_id', 'Enter the actual Blogger post ID.');
    const post = await publisher.get({ ...job, payload: verifiedPayload }, body.remoteId, { content: true });
    if (typeof post.content !== 'string' || !post.content.includes(publicationMarker(job.id))) throw new AutomationError('verification_failed', 'That post did not contain this job’s publication marker in the selected blog.', { status: 409 });
    if (!['DRAFT', 'SCHEDULED', 'LIVE'].includes(post.status)) throw new AutomationError('verification_failed', 'Blogger did not confirm a recognized post status.', { status: 409 });
    change = { payload: verifiedPayload, remoteId: body.remoteId, draftURL: post.url ? articleURL(post, job.payload.blogURL) : null, status: post.status === 'DRAFT' ? 'queued' : post.status === 'SCHEDULED' ? 'scheduled' : 'waiting_live', phase: post.status === 'DRAFT' ? 'publish' : 'verify_live', attemptOpen: true, reviewedRunAtUTC: new Date(Math.max(now, post.status === 'SCHEDULED' ? ms(job.publishAtUTC) : now)), error: null };
  }
  await transaction(db, async tx => {
    const row = own(data(await tx.get(ref(db, id))), uid);
    if (row.status !== 'needs_review' || row.updatedAt.getTime() !== job.updatedAt.getTime()) throw new AutomationError('job_changed', 'The remote review state changed.', { status: 409 });
    if (body.action === 'verify') {
      const [auth, site] = await Promise.all([tx.get(connectionRef(db, uid, 'blogger', job.payload.bloggerConnectionId)), tx.get(sites(db, uid).doc(job.payload.websiteId))]);
      assertDestination(data(auth), data(site), uid, verifiedPayload);
    }
    put(tx, db, { ...row, ...change, mutationPending: null, lease: null, leaseUntilUTC: null, updatedAt: new Date(now) });
  });
  return { job: publicJob(own(data(await ref(db, id).get()), uid)) };
}
export async function markManualPin(db, uid, id, body, { now = Date.now() } = {}) {
  if (Object.keys(body).some(k => !['pinURL', 'confirmedManual'].includes(k)) || body.confirmedManual !== true) throw new AutomationError('manual_confirmation_required', 'Confirm that you personally published this Pin in Pinterest.');
  const url = reportedPinURL(body.pinURL);
  await transaction(db, async tx => {
    const row = own(data(await tx.get(ref(db, id))), uid);
    if (row.type !== 'manual_pin' || !['awaiting_manual_time', 'ready_for_manual', 'manually_marked_done'].includes(row.status) || ms(row.pinReadyAtUTC) > now) throw new AutomationError('not_ready', 'The verified article and manual target time must be ready first.', { status: 409 });
    put(tx, db, { ...row, status: 'manually_marked_done', reportedPinURL: url, resultURL: null, reviewedRunAtUTC: undefined, reportedAt: new Date(now), updatedAt: new Date(now) });
  });
  return { job: publicJob(own(data(await ref(db, id).get()), uid)) };
}
export async function runReviewedPublisher(db, { limit = 4, maxSteps = 12, send, now = () => Date.now(), authorizeOwner = authorize, deadlineMs = 240000 } = {}) {
  selectedMode();
  const started = Date.now(), candidates = await db.collection('publish_jobs').where('reviewedRunAtUTC', '<=', new Date(now())).orderBy('reviewedRunAtUTC').limit(Math.min(8, Math.max(1, limit))).get();
  let processed = 0, steps = 0, stopRun = false, failed = 0;
  const publisher = new BloggerPublisher(db, { send, now });
  for (const snapshot of candidates.docs) {
    if (Date.now() - started > deadlineMs || steps >= maxSteps || stopRun) break;
    let job = data(snapshot);
    if (job?.flow !== FLOW) continue;
    for (let phase = 0; phase < 3; phase++) {
      if (Date.now() - started > deadlineMs || steps >= maxSteps) break;
      const result = await processPublishingJob(db, job.id, { send, now, authorizeOwner, publisher });
      steps++; job = result.job;
      if (result.processed) processed++;
      if (['failed', 'needs_review'].includes(job.status)) failed++;
      if (result.stopRun) { stopRun = true; break; }
      if (!result.processed || !['queued', 'waiting_live'].includes(job.status) || Date.parse(job.nextCheckAtUTC) > now()) break;
    }
  }
  const receipt = { lastSeenAt: new Date(now()), outcome: stopRun ? 'rate_limited' : failed ? 'needs_attention' : 'ok', dueCandidates: candidates.size, steps, processed, failed };
  await db.doc('publisher_system/reviewed_blogger').set(receipt);
  return { ...receipt, lastSeenAt: receipt.lastSeenAt.toISOString() };
}
