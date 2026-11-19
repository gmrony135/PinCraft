// Per-user record of the Telegram / YouTube confirmations shown in the post-entry popup.
// These flags are the user's own confirmation ("I joined"). No server-side check of
// Telegram membership or YouTube subscription is performed here.
import { AutomationError } from '../automation/errors.mjs';

export const SHOWCASE_COLLECTION = 'showcase_joins';
export const SHOWCASE_FIELDS = { telegram: 'telegramJoined', youtube: 'youtubeSubscribed' };

export function showcaseChannel(value) {
  if (typeof value !== 'string' || !Object.hasOwn(SHOWCASE_FIELDS, value)) {
    throw new AutomationError('invalid_request', 'Choose the Telegram or YouTube confirmation.', { status: 400 });
  }
  return value;
}

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

export async function confirmJoin(db, uid, channel, now = new Date()) {
  const field = SHOWCASE_FIELDS[showcaseChannel(channel)];
  await db.collection(SHOWCASE_COLLECTION).doc(showcaseUid(uid)).set(
    { [field]: true, [`${field}At`]: now, updatedAt: now },
    { merge: true },
  );
  return readJoinStatus(db, uid);
}
