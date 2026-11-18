import 'server-only';
import {timingSafeEqual} from 'node:crypto';
import {AutomationError} from '../automation/errors.mjs';
import {transaction} from '../automation/db.mjs';
import {encryptSession,decryptSession} from './session-crypto.mjs';
import {PINTEREST_ACCOUNT} from './policy.mjs';
import {dhakaDayStart,nextActionAllowed,validateJobInput,validateStorageState} from './jobs.mjs';

const stateRef = db => db.collection('pinterest_browser').doc('slimglowlifex');
const jobsRef = db => db.collection('pinterest_browser_jobs');
const iso = value => (value?.toDate ? value.toDate().toISOString() : null);

function sessionKey() {
  const key = process.env.PINTEREST_SESSION_KEY || '';
  if (!key) throw new AutomationError('pinterest_setup_required', 'Pinterest session encryption is not configured yet.', {status: 503});
  return key;
}

export function assertOwner(user) {
  const owner = process.env.PINTEREST_OWNER_UID || '';
  if (!owner || !user || user.id !== owner) throw new AutomationError('forbidden', 'Only the site owner can manage the Pinterest session.', {status: 403});
}

export function assertRunner(authorization) {
  const token = process.env.PINTEREST_RUNNER_TOKEN || '';
  const presented = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const a = Buffer.from(presented), b = Buffer.from(token);
  if (token.length < 32 || a.length !== b.length || !timingSafeEqual(a, b)) throw new AutomationError('runner_unauthorized', 'Unauthorized.', {status: 401});
}

const NEXT_STEP = {
  missing: 'Export the session on your own computer (steps below), then upload slimglow-session.json with the Upload button.',
  present: 'Session saved. The runner will verify it on its next run.',
  verified: 'Session verified for @SlimGlowLifex. Queued pins post automatically, at most 6 per day.',
  expired: 'Pinterest signed the session out. Repeat the export steps on your computer and upload the new file.',
  unverified: 'The runner could not confirm the logged-in account. Re-export while signed in as @SlimGlowLifex and upload again.',
  error: 'The last runner check failed. It will retry automatically; if it keeps failing, see the detail below.',
};

export async function getPinterestStatus(db, now = Date.now()) {
  const snap = await stateRef(db).get(), d = snap.exists ? snap.data() : {};
  const status = d.envelope ? (d.status || 'present') : 'missing';
  const dayStart = dhakaDayStart(now);
  const recent = await jobsRef(db).where('postedAt', '>=', new Date(dayStart)).get();
  const postedToday = recent.docs.filter(doc => doc.data().status === 'posted').length;
  return {
    account: '@' + PINTEREST_ACCOUNT.handle,
    status,
    hasSession: Boolean(d.envelope),
    uploadedAt: iso(d.uploadedAt),
    verifiedAt: iso(d.verifiedAt),
    detail: d.statusDetail || null,
    nextStep: NEXT_STEP[status] || NEXT_STEP.error,
    postedToday,
    dailyLimit: 6,
  };
}

export async function saveSession(db, rawState, now = Date.now()) {
  const state = validateStorageState(rawState);
  await stateRef(db).set({envelope: encryptSession(state, sessionKey()), status: 'present', statusDetail: null, uploadedAt: new Date(now)}, {merge: true});
  return {saved: true};
}

// Runner refresh: stores the rotated session without changing when it was uploaded.
export async function refreshSession(db, rawState) {
  const state = validateStorageState(rawState);
  await stateRef(db).set({envelope: encryptSession(state, sessionKey())}, {merge: true});
  return {saved: true};
}

export async function readSession(db) {
  const snap = await stateRef(db).get(), envelope = snap.exists ? snap.data().envelope : null;
  if (!envelope) return null;
  return decryptSession(envelope, sessionKey());
}

export async function recordRunStatus(db, {state, detail = null}, now = Date.now()) {
  if (!['verified', 'expired', 'unverified', 'error'].includes(state)) throw new AutomationError('invalid_request', 'Unknown runner state.', {status: 400});
  const patch = {status: state, statusDetail: detail ? String(detail).slice(0, 300) : null};
  if (state === 'verified') patch.verifiedAt = new Date(now);
  await stateRef(db).set(patch, {merge: true});
  return {recorded: true};
}

export async function queuePin(db, raw, now = Date.now()) {
  const pin = validateJobInput(raw);
  const ref = jobsRef(db).doc();
  await ref.set({...pin, status: 'queued', createdAt: new Date(now)});
  return {id: ref.id, status: 'queued'};
}

// Gives the runner at most one queued pin, after checking the daily ceiling and spacing.
export async function claimNextPin(db, now = Date.now()) {
  const state = (await stateRef(db).get()).data() || {};
  const dayStart = dhakaDayStart(now);
  const recent = await jobsRef(db).where('postedAt', '>=', new Date(dayStart)).get();
  const postedToday = recent.docs.filter(doc => doc.data().status === 'posted').length;
  const gate = nextActionAllowed({postedToday, lastPostAt: state.lastPostAt?.toMillis?.() ?? null, now});
  if (!gate.allowed) return {job: null, ...gate};
  // Sorted in memory so no composite Firestore index is required.
  const queued = (await jobsRef(db).where('status', '==', 'queued').limit(50).get()).docs.sort((a, b) => (a.data().createdAt?.toMillis?.() ?? 0) - (b.data().createdAt?.toMillis?.() ?? 0));
  if (!queued.length) return {job: null, reason: 'empty'};
  const ref = queued[0].ref;
  const job = await transaction(db, async tx => {
    const current = await tx.get(ref);
    if (!current.exists || current.data().status !== 'queued') return null;
    tx.update(ref, {status: 'claimed', claimedAt: new Date(now)});
    return {id: ref.id, ...current.data()};
  });
  return job ? {job, reason: 'ok'} : {job: null, reason: 'raced'};
}

export async function completePin(db, jobId, result, now = Date.now()) {
  if (typeof jobId !== 'string' || !/^[A-Za-z0-9]{10,40}$/.test(jobId)) throw new AutomationError('invalid_request', 'Unknown pin.', {status: 400});
  const ref = jobsRef(db).doc(jobId);
  if (result.state === 'posted') {
    if (typeof result.pinURL !== 'string' || !/^https:\/\/(www\.)?pinterest\.com\/pin\/\d+\/?$/.test(result.pinURL)) throw new AutomationError('invalid_request', 'Pin URL is not a Pinterest pin.', {status: 400});
    await ref.update({status: 'posted', postedAt: new Date(now), pinURL: result.pinURL});
    await stateRef(db).set({lastPostAt: new Date(now)}, {merge: true});
    return {recorded: true};
  }
  await ref.update({status: 'failed', error: String(result.error || 'unknown').slice(0, 300)});
  return {recorded: true};
}
