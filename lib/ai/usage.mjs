import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { AutomationError } from '../automation/errors.mjs';
import { accountRef, data, ownerKey, ms } from '../automation/firestore.mjs';
import { transaction } from '../automation/db.mjs';
import { validJobId } from '../automation/images.mjs';
import { aiLimits } from './config.mjs';

const requestRef = (db, uid, requestKey) => accountRef(db, uid).collection('aiRequests').doc(requestKey);
const dayRef = (db, uid, day) => accountRef(db, uid).collection('aiUsage').doc(day);
const globalRef = (db, day) => db.doc(`pincraft_system/ai-${day}`);
const active = (value, now) => Array.isArray(value) ? value.filter(item => typeof item?.id === 'string' && ms(item.until) > now) : [];
export const requestFingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unavailable = () => new AutomationError('ai_usage_unavailable', 'Private AI usage limits could not be checked or saved. No new provider request is allowed until Firestore is available. Please retry later.', { status: 503, retryable: true });
export async function reserveAIRequest(db, uid, { requestKey, fingerprint, task, kind = 'text' }, { now = Date.now(), limits = aiLimits() } = {}) {
  ownerKey(uid);
  if (!validJobId(requestKey) || !/^[a-f0-9]{64}$/.test(fingerprint) || !['text', 'image'].includes(kind)) throw new AutomationError('invalid_ai_request', 'A valid private AI request is required.');
  const day = new Date(now).toISOString().slice(0, 10), ref = requestRef(db, uid, requestKey), userRef = dayRef(db, uid, day), allRef = globalRef(db, day);
  const lease = randomUUID(), leaseId = `${ownerKey(uid)}:${requestKey}`;
  try {
    return await transaction(db, async tx => {
      const [previousSnap, userSnap, globalSnap] = await tx.getAll(ref, userRef, allRef);
      const previous = data(previousSnap), user = data(userSnap) || {}, all = data(globalSnap) || {};
      if (previous) {
        if (previous.user_id !== uid || previous.fingerprint !== fingerprint || previous.task !== task) throw new AutomationError('request_key_reused', 'This request key belongs to different content. Start a new explicit request.', { status: 409 });
        if (previous.state === 'completed' && previous.result && ms(previous.expires_at) > now) return { cached: previous.result };
        if (previous.state === 'pending' && ms(previous.lease_until) > now) throw new AutomationError('ai_request_pending', 'This generation is already in progress. Wait before starting another request.', { status: 409 });
        const completedImage = previous.state === 'completed' && previous.kind === 'image';
        throw new AutomationError(completedImage ? 'ai_already_generated' : 'ai_request_finished', completedImage ? 'This image was already generated. Images are not cached; download it from the original result or start a new request, which uses quota.' : 'This request has finished, its private result expired or its result could not be confirmed. A deliberate new request is required; retries never silently repeat provider calls.', { status: 409 });
      }
      const userActive = active(user.active, now), globalActive = active(all.active, now);
      if ((Number(user[kind]) || 0) >= limits.user[kind] || (Number(all[kind]) || 0) >= limits.global[kind]) throw new AutomationError('ai_daily_limit', 'The daily AI request limit has been reached for this account or website. It resets at 00:00 UTC. Provider limits may apply earlier.', { status: 429 });
      if (userActive.length >= 2 || globalActive.length >= 8) throw new AutomationError('ai_busy', 'Too many AI requests are running. Wait for an existing request to finish.', { status: 429, retryable: true });
      const cooldown = kind === 'image' ? 15000 : 4000;
      if (ms(user[`last_${kind}_at`]) > now - cooldown) throw new AutomationError('ai_slow_down', `Please wait ${kind === 'image' ? '15' : '4'} seconds between ${kind} requests.`, { status: 429, retryable: true });
      const until = new Date(now + 120000);
      tx.set(userRef, { ...user, user_id: uid, day, text: Number(user.text) || 0, image: Number(user.image) || 0, [kind]: (Number(user[kind]) || 0) + 1, [`last_${kind}_at`]: new Date(now), active: [...userActive, { id: leaseId, until }] });
      tx.set(allRef, { ...all, day, text: Number(all.text) || 0, image: Number(all.image) || 0, [kind]: (Number(all[kind]) || 0) + 1, active: [...globalActive, { id: leaseId, until }] });
      tx.create(ref, { user_id: uid, task, kind, day, fingerprint, state: 'pending', lease, lease_until: until, created_at: new Date(now), expires_at: new Date(now + 86400000) });
      return { requestKey, lease, day, leaseId };
    });
  } catch (error) { if (error instanceof AutomationError) throw error; throw unavailable(); }
}
export async function finishAIRequest(db, uid, reservation, { result = null, error = null } = {}) {
  const ref = requestRef(db, uid, reservation.requestKey), userRef = dayRef(db, uid, reservation.day), allRef = globalRef(db, reservation.day);
  try {
    await transaction(db, async tx => {
      const [requestSnap, userSnap, allSnap] = await tx.getAll(ref, userRef, allRef);
      const previous = data(requestSnap), user = data(userSnap), all = data(allSnap), now = Date.now();
      if (!previous || previous.user_id !== uid || previous.lease !== reservation.lease || previous.state !== 'pending') throw new AutomationError('ai_request_changed', 'This AI request is no longer active. No repeated provider request was started.', { status: 409 });
      // Text results are private idempotency receipts. Image bytes and prompts
      // are never persisted here; the image is delivered for download only.
      const cached = previous.kind === 'text' && result && Buffer.byteLength(JSON.stringify(result), 'utf8') <= 100000 ? result : null;
      tx.update(ref, { state: error ? 'failed' : 'completed', result: cached, error_code: error?.code && /^[a-z_]{1,60}$/.test(error.code) ? error.code : error ? 'ai_unavailable' : null, lease_until: null, completed_at: new Date(now) });
      if (user) tx.update(userRef, { active: active(user.active, now).filter(item => item.id !== reservation.leaseId) });
      if (all) tx.update(allRef, { active: active(all.active, now).filter(item => item.id !== reservation.leaseId) });
    });
  } catch (error) { if (error instanceof AutomationError) throw error; throw unavailable(); }
}
export async function aiUsage(db, uid, now = Date.now()) {
  try {
    const day = new Date(now).toISOString().slice(0, 10), user = data(await dayRef(db, uid, day).get()) || {};
    return { day, resetAt: new Date(new Date(`${day}T00:00:00Z`).getTime() + 86400000).toISOString(), used: { text: Number(user.text) || 0, image: Number(user.image) || 0 }, limits: aiLimits().user };
  } catch { throw unavailable(); }
}
