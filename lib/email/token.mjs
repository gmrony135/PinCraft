import { createHmac, timingSafeEqual } from 'node:crypto';
import { SITE_URL } from './config.mjs';

// Unsubscribe links carry an HMAC over "uid|kind". Nothing else is needed to unsubscribe,
// and a forged or edited link fails verification.
export const UNSUBSCRIBE_KINDS = ['weekly', 'reengage', 'all'];

export function unsubscribeToken(uid, kind, secret) {
  return createHmac('sha256', secret).update(`${uid}|${kind}`).digest('base64url');
}

export function verifyUnsubscribeToken(uid, kind, token, secret) {
  if (!secret || !UNSUBSCRIBE_KINDS.includes(kind) || typeof uid !== 'string' || !uid) return false;
  const expected = Buffer.from(unsubscribeToken(uid, kind, secret));
  const actual = Buffer.from(String(token || ''));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function unsubscribeUrl(uid, kind, secret) {
  const params = new URLSearchParams({ u: uid, k: kind, t: unsubscribeToken(uid, kind, secret) });
  return `${SITE_URL}/api/email/unsubscribe?${params.toString()}`;
}
