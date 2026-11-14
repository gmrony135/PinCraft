import 'server-only';
import { createHash } from 'node:crypto';
import { AutomationError } from './errors.mjs';
import { data } from './firestore.mjs';
import { reserveQuota, finishQuota } from '../publishing/policy.mjs';
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
function policyError(error) {
  return Object.assign(new AutomationError(error.code, error.message, { status: error.status, retryable: error.retryable }), error.resumeAt ? { resumeAt: error.resumeAt } : {});
}
export async function reservePinSlot(tx, db, job, now = Date.now()) {
  const ref = quotaRef(db, job.pinterest_account_key), row = data(await tx.get(ref));
  let updated; try { updated = reserveQuota(row, job.id, now); } catch (error) { throw policyError(error); }
  if (updated) tx.set(ref, updated);
}
export async function finishPinSlot(tx, db, job, options = {}) {
  const ref = quotaRef(db, job.pinterest_account_key), row = data(await tx.get(ref));
  try { tx.set(ref, finishQuota(row, job.id, options)); } catch (error) { throw policyError(error); }
}
