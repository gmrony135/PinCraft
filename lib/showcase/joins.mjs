// Per-user verified state of the Telegram and YouTube showcase steps.
// Flags are written only by server-side verification (the Telegram and YouTube callbacks).
// Nothing in the browser can set them.
import { AutomationError } from '../automation/errors.mjs';

export const SHOWCASE_COLLECTION = 'showcase_joins';
export const SHOWCASE_FIELDS = { telegram: 'telegramJoined', youtube: 'youtubeSubscribed' };

export function showcaseUid(uid) {
  if (typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/')) {
    throw new AutomationError('sign_in_required', 'Sign in with a verified account to use this.', { status: 401 });
  }
  return uid;
}

export function joinStatus(data) {
  return {
    telegramJoined: data?.telegramJoined === true,
    youtubeSubscribed: data?.youtubeSubscribed === true,
  };
}

export function bothJoined(status) {
  return Boolean(status?.telegramJoined && status?.youtubeSubscribed);
}

export async function readJoinStatus(db, uid) {
  const snapshot = await db.collection(SHOWCASE_COLLECTION).doc(showcaseUid(uid)).get();
  return joinStatus(snapshot.data());
}

// Called only after the server has verified membership or subscription.
// Called only after the server has seen the account leave or get removed from the channel.
export async function markUnverified(db, uid, channel, now = new Date()) {
  const field = SHOWCASE_FIELDS[channel];
  if (!field) throw new Error('unknown_channel');
  await db.collection(SHOWCASE_COLLECTION).doc(showcaseUid(uid)).set(
    { [field]: false, [`${field}LeftAt`]: now, updatedAt: now },
    { merge: true },
  );
  return readJoinStatus(db, uid);
}

export async function markVerified(db, uid, channel, now = new Date()) {
  const field = SHOWCASE_FIELDS[channel];
  if (!field) throw new Error('unknown_channel');
  await db.collection(SHOWCASE_COLLECTION).doc(showcaseUid(uid)).set(
    { [field]: true, [`${field}VerifiedAt`]: now, updatedAt: now },
    { merge: true },
  );
  return readJoinStatus(db, uid);
}
