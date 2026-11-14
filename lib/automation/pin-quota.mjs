import 'server-only';
import { createHash } from 'node:crypto';
import { AutomationError } from './errors.mjs';
import { data, ms } from './firestore.mjs';
import { MAX_PINS_PER_DAY } from '../product.mjs';
const windowMs = 24 * 60 * 60 * 1000;
export const validPinterestAccountKey = key => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key);
export const pinterestAccountKey = identity => {
  // Usernames can be changed. Only the provider-confirmed immutable account ID
  // identifies the global ledger across users, boards, grants and reconnects.
  const id = identity?.id;
  if (typeof id !== 'string' || !/^\d{3,40}$/.test(id)) throw new AutomationError('pinterest_identity_required', 'Pinterest must confirm its permanent account ID. Reconnect Pinterest and verify an owned board before scheduling this account.', { status: 409 });
  return createHash('sha256').update(`pinterest-account:${id}`).digest('hex');
};
const quotaRef = (db, key) => {
  if (!validPinterestAccountKey(key)) throw new AutomationError('pinterest_identity_required', 'Verify your Pinterest account and board before publishing.', { status: 409 });
  return db.collection('pincraft_pin_limits').doc(key);
};
function entriesFor(row, now) {
  if (row?.entries !== undefined && !Array.isArray(row.entries)) throw new AutomationError('pin_limit_unavailable', 'The Pinterest safety ledger needs inspection. Publishing is paused rather than bypassing its limit.', { status: 503 });
  return (row?.entries || []).filter(entry => {
    if (!entry || typeof entry.jobId !== 'string' || !Number.isFinite(ms(entry.at)) || !['reserved', 'confirmed'].includes(entry.status)) throw new AutomationError('pin_limit_unavailable', 'The Pinterest safety ledger needs inspection. No Pin was sent.', { status: 503 });
    // An unconfirmed mutation must never free itself merely because a day has
    // passed. It remains held until confirmed, definitely rejected, or explicitly
    // abandoned after remote inspection. Confirmed results expire after 24h.
    return entry.status === 'reserved' || ms(entry.at) > now - windowMs;
  });
}
export async function reservePinSlot(tx, db, job, now = Date.now()) {
  const ref = quotaRef(db, job.pinterest_account_key), row = data(await tx.get(ref)), entries = entriesFor(row, now);
  if (entries.some(entry => entry.jobId === job.id)) return;
  if (entries.length >= MAX_PINS_PER_DAY) {
    const confirmedExpiries = entries.filter(entry => entry.status === 'confirmed').map(entry => ms(entry.at) + windowMs + 1000);
    const resumeAt = new Date(confirmedExpiries.length ? Math.min(...confirmedExpiries) : now + 30 * 60000);
    throw Object.assign(new AutomationError('pinterest_daily_limit', 'This Pinterest account has reached its six-Pin safety limit. Confirmed Pins and unresolved publishing attempts share the same limit across boards, users and subscriptions. Due work will wait for a safe slot.', { status: 429, retryable: true }), { resumeAt });
  }
  tx.set(ref, { entries: [...entries, { jobId: job.id, at: new Date(now), status: 'reserved' }], updated_at: new Date(now) });
}
export async function finishPinSlot(tx, db, job, { release = false, now = Date.now() } = {}) {
  const ref = quotaRef(db, job.pinterest_account_key), row = data(await tx.get(ref)), entries = entriesFor(row, now).filter(entry => entry.jobId !== job.id);
  // Confirmation is recorded at the persisted response/review time, never the
  // earlier reservation time. An explicitly abandoned ambiguous attempt also
  // remains counted conservatively for another 24h instead of being freed.
  if (!release) entries.push({ jobId: job.id, at: new Date(now), status: 'confirmed' });
  tx.set(ref, { entries, updated_at: new Date(now) });
}
