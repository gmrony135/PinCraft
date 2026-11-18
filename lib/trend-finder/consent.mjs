// Per-account AI-use consent for Trend Finder idea generation. Stored server-side,
// keyed by the signed-in account, so it survives page reloads and devices.
import { AutomationError } from '../automation/errors.mjs';
import { TREND_AI_NOTICE_VERSION } from './notice.mjs';

export const TREND_CONSENT_COLLECTION = 'pincraft_trend_ai_consent';

const iso = value => {
  const date = value && typeof value.toDate === 'function' ? value.toDate() : value instanceof Date ? value : new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

export async function readTrendConsent(db, uid) {
  if (!db?.collection) throw new AutomationError('setup_required', 'Trend consent storage is not available yet.', { status: 503 });
  const snapshot = await db.collection(TREND_CONSENT_COLLECTION).doc(uid).get();
  const row = snapshot.exists ? snapshot.data() : null;
  const current = row?.noticeVersion === TREND_AI_NOTICE_VERSION;
  return {
    accepted: row?.accepted === true && current,
    noticeVersion: TREND_AI_NOTICE_VERSION,
    acceptedAt: row?.accepted === true && current ? iso(row.acceptedAt) : null,
  };
}

export async function writeTrendConsent(db, uid, accepted, now = new Date()) {
  if (!db?.collection) throw new AutomationError('setup_required', 'Trend consent storage is not available yet.', { status: 503 });
  await db.collection(TREND_CONSENT_COLLECTION).doc(uid).set({
    accepted: accepted === true,
    noticeVersion: TREND_AI_NOTICE_VERSION,
    acceptedAt: accepted === true ? now : null,
    updatedAt: now,
  });
  return readTrendConsent(db, uid);
}
