import {FREE_PIN_PACKS_PER_DAY,freeUsageDay,nextFreeReset} from '../free-plan.mjs';
import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { AutomationError } from '../automation/errors.mjs';
import { accountRef, data, ownerKey, ms } from '../automation/firestore.mjs';
import { transaction } from '../automation/db.mjs';
import { validJobId } from '../automation/images.mjs';
import { aiLimits } from './config.mjs';

const requestRef = (db, uid, requestKey) => accountRef(db, uid).collection('aiRequests').doc(requestKey);
const dayRef = (db, uid, day) => accountRef(db, uid).collection('aiUsage').doc(day);
const active = (value, now) => Array.isArray(value) ? value.filter(item => typeof item?.id === 'string' && ms(item.until) > now) : [];
export const requestFingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unavailable = () => new AutomationError('ai_usage_unavailable', 'Your account usage and safety limits could not be checked or saved. No new provider request is allowed until this is available. Please retry later.', { status: 503, retryable: true });
export async function reserveAIRequest(db, uid, { requestKey, fingerprint, task, kind = 'text' }, { now = Date.now(), limits = aiLimits() } = {}) {
  ownerKey(uid);
  if (!validJobId(requestKey) || !/^[a-f0-9]{64}$/.test(fingerprint) || !['text', 'image'].includes(kind)) throw new AutomationError('invalid_ai_request', 'A valid private AI request is required.');
  const day = freeUsageDay(now), ref = requestRef(db, uid, requestKey), userRef = dayRef(db, uid, day);
  const lease = randomUUID(), leaseId = `${ownerKey(uid)}:${requestKey}`;
  try {
    return await transaction(db, async tx => {
      const [previousSnap, userSnap] = await tx.getAll(ref, userRef);
      const previous = data(previousSnap), user = data(userSnap) || {};
      if (previous) {
        if (previous.user_id !== uid || previous.fingerprint !== fingerprint || previous.task !== task) throw new AutomationError('request_key_reused', 'This request key belongs to different content. Start a new explicit request.', { status: 409 });
        if (previous.state === 'completed' && previous.result && ms(previous.expires_at) > now) return { cached: previous.result };
        if (previous.state === 'pending' && ms(previous.lease_until) > now) throw new AutomationError('ai_request_pending', 'This generation is already in progress. Wait before starting another request.', { status: 409 });
        const completedImage = previous.state === 'completed' && previous.kind === 'image';
        throw new AutomationError(completedImage ? 'ai_already_generated' : 'ai_request_finished', completedImage ? 'This image was already generated. Images are not cached; download it from the original result or start a new request, which uses quota.' : 'This request has finished, its private result expired or its result could not be confirmed. A deliberate new request is required; retries never silently repeat provider calls.', { status: 409 });
      }
      const userActive = active(user.active, now);
      if (task === "pin" && (Number(user.pin_packs)||0) + userActive.filter(item=>item.task === "pin").length >= FREE_PIN_PACKS_PER_DAY) throw new AutomationError("pin_daily_limit", "Your 20 daily Pin idea packs have been used or reserved by running requests. Resets at midnight Bangladesh time.", {status:429});
      if ((Number(user[kind]) || 0) >= (limits.user || aiLimits().user)[kind]) throw new AutomationError('ai_daily_limit', `Your account’s daily ${kind} request limit has been reached. It resets at midnight Bangladesh time. Other accounts are unaffected.`, { status: 429 });
      if (userActive.length >= 2) throw new AutomationError('ai_busy', 'Too many AI requests are running. Wait for an existing request to finish.', { status: 429, retryable: true });
      const cooldown = kind === 'image' ? 15000 : 4000;
      if (ms(user[`last_${kind}_at`]) > now - cooldown) throw new AutomationError('ai_slow_down', `Please wait ${kind === 'image' ? '15' : '4'} seconds between ${kind} requests.`, { status: 429, retryable: true });
      const until = new Date(now + 180000);
      tx.set(userRef, { ...user, user_id: uid, day, text: Number(user.text) || 0, image: Number(user.image) || 0, [kind]: (Number(user[kind]) || 0) + 1, [`last_${kind}_at`]: new Date(now), active: [...userActive, { id: leaseId, until, task }] });
      tx.create(ref, { user_id: uid, task, kind, day, fingerprint, state: 'pending', lease, lease_until: until, created_at: new Date(now), expires_at: new Date(now + 86400000) });
      return { requestKey, lease, day, leaseId };
    });
  } catch (error) { if (error instanceof AutomationError) throw error; throw unavailable(); }
}
export async function finishAIRequest(db, uid, reservation, { result = null, error = null, uniqueDocs = [] } = {}) {
  if (!Array.isArray(uniqueDocs) || uniqueDocs.length > 10 || uniqueDocs.some(item => !item?.ref?.path || !item?.data || typeof item.data !== 'object')) throw new AutomationError('invalid_ai_request', 'A valid private AI result is required.');
  if (error && uniqueDocs.length) throw new AutomationError('invalid_ai_request', 'A failed AI result cannot reserve global fingerprints.');
  const ref = requestRef(db, uid, reservation.requestKey), userRef = dayRef(db, uid, reservation.day);
  try {
    await transaction(db, async tx => {
      const snapshots = await tx.getAll(ref, userRef, ...uniqueDocs.map(item => item.ref));
      const [requestSnap, userSnap, ...uniqueSnapshots] = snapshots;
      const previous = data(requestSnap), user = data(userSnap), now = Date.now();
      if (!previous || previous.user_id !== uid || previous.lease !== reservation.lease || previous.state !== 'pending') throw new AutomationError('ai_request_changed', 'This AI request is no longer active. No repeated provider request was started.', { status: 409 });
      if (!error && previous.task === "pin" && (Number(user?.pin_packs)||0) >= FREE_PIN_PACKS_PER_DAY) throw new AutomationError("pin_daily_limit", "Your daily Pin idea-pack allowance is complete. Resets at midnight Bangladesh time.", {status:429});
      const duplicate = uniqueDocs.find((item, index) => {
        const snapshot = uniqueSnapshots[index];
        if (!snapshot?.exists) return false;
        return !(item.allowExistingOwner && snapshot.data()?.owner_hash === item.allowExistingOwner);
      });
      if (duplicate) throw new AutomationError(duplicate.duplicateCode || 'ai_duplicate_result', duplicate.duplicateMessage || 'This AI result is too similar to an earlier result. Generate a new variation.', { status: 409 });
      // Fingerprint reservations, the private receipt and quota release commit
      // atomically. Global docs contain only keyed hashes and small metadata;
      // image bytes, prompts and generated copy are never stored here.
      uniqueDocs.forEach((item, index) => { if (!uniqueSnapshots[index]?.exists) tx.create(item.ref, item.data); });
      // Text results and durable article-image references are private idempotency
      // receipts. Transient image bytes and prompts never enter this document.
      const cacheableImage = previous.kind === 'image' && result?.task === 'image' && typeof result?.result?.assetId === 'string' && result.result.storage === 'firestore';
      const cached = (previous.kind === 'text' || cacheableImage) && result && Buffer.byteLength(JSON.stringify(result), 'utf8') <= 100000 ? result : null;
      tx.update(ref, { state: error ? 'failed' : 'completed', result: cached, error_code: error?.code && /^[a-z_]{1,60}$/.test(error.code) ? error.code : error ? 'ai_unavailable' : null, lease_until: null, completed_at: new Date(now) });
      if (user) tx.update(userRef, { ...(!error && previous.task === 'pin' ? {pin_packs:(Number(user.pin_packs)||0)+1} : {}), active: active(user.active, now).filter(item => item.id !== reservation.leaseId) });
    });
  } catch (error) { if (error instanceof AutomationError) throw error; throw unavailable(); }
}
export async function aiUsage(db, uid, now = Date.now()) {
  try {
    const day = freeUsageDay(now), user = data(await dayRef(db, uid, day).get()) || {};
    return { day, resetAt: nextFreeReset(now), pinPackLimit: FREE_PIN_PACKS_PER_DAY, limits:aiLimits().user, resetTimezone:"Asia/Dhaka", used: { pinPacks:Number(user.pin_packs)||0, text: Number(user.text) || 0, image: Number(user.image) || 0 } };
  } catch { throw unavailable(); }
}
