// Firestore-backed sign-in limiter: shared across serverless instances. Hashed client keys only.
import { createHash } from 'node:crypto';
import { db } from './firebase.mjs';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export function clientKey(request) {
  const forwarded = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return forwarded || request.headers.get('x-real-ip') || 'unknown';
}

// Returns true if this attempt is allowed. Throws if storage is unavailable (caller fails closed).
export async function takeAttempt(key) {
  const database = db();
  const ref = database.collection('pincraft_admin_signin_limits').doc(createHash('sha256').update(`signin:${key}`).digest('hex'));
  return database.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const row = snap.exists ? snap.data() : null;
    if (!row || now - row.windowStart > WINDOW_MS) {
      tx.set(ref, { windowStart: now, count: 1 });
      return true;
    }
    if (row.count >= MAX_ATTEMPTS) return false;
    tx.update(ref, { count: row.count + 1 });
    return true;
  });
}
