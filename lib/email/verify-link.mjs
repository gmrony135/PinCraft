// The verification mail's continue link. Firebase applies the verification code on its own handler, then sends
// the browser to this PinCraft route. The route's token proves that PinCraft issued this link, for this user,
// in a mail sent to that user's address. It has no secret beyond the server's AUTH_SESSION_SECRET.
// This module has no server-only or Firebase imports, so the tests can run it directly.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const VERIFY_LINK_PATH = '/api/auth/verify-link';
export const VERIFY_LINK_TTL_MS = 60 * 60 * 1000; // Firebase email action links expire after one hour.
const UID = /^[A-Za-z0-9_-]{1,128}$/;

function sign(uid, expSeconds, secret) {
  return createHmac('sha256', secret).update(`verify-link|${uid}|${expSeconds}`).digest('base64url');
}

export function verifyLinkToken({ uid, now = Date.now(), secret }) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('verify_link_unconfigured');
  if (!UID.test(uid)) throw new Error('invalid_uid');
  const exp = Math.floor((now + VERIFY_LINK_TTL_MS) / 1000);
  return `${uid}.${exp}.${sign(uid, exp, secret)}`;
}

export function verifyLinkUrl(origin, token) {
  return `${origin}${VERIFY_LINK_PATH}?t=${encodeURIComponent(token)}`;
}

function parseToken(token, secret) {
  if (typeof token !== 'string' || token.length > 300 || typeof secret !== 'string' || secret.length < 32) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [uid, expText, sig] = parts;
  if (!UID.test(uid) || !/^\d{9,12}$/.test(expText)) return null;
  const expected = Buffer.from(sign(uid, Number(expText), secret));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return { uid, exp: Number(expText) };
}

const displayName = name => {
  const clean = typeof name === 'string' ? name.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80) : '';
  return clean || 'Creator';
};

// Decides what the link does. It never creates a session itself; the route does that after this returns.
//   { action: 'session', uid, name }  the email is verified: the route signs this browser in
//   { action: 'login', reason }       the route sends the browser to /login with a notice
// The Firebase account must be verified, so a token alone is never enough.
export async function completeVerifyLink({ token, secret, auth, now = Date.now(), existingUid = null }) {
  const parsed = parseToken(token, secret);
  if (!parsed) return { action: 'login', reason: 'invalid_link' };
  let user;
  try { user = await auth.getUser(parsed.uid); } catch { return { action: 'login', reason: 'invalid_link' }; }
  if (!user || user.disabled) return { action: 'login', reason: 'invalid_link' };
  if (user.emailVerified !== true) return { action: 'login', reason: 'not_verified' };
  // A browser already signed in as someone else keeps that session. Nothing is switched silently.
  if (existingUid && existingUid !== parsed.uid) return { action: 'login', reason: 'other_session' };
  // The email is verified, so an expired token still gets the plain "please sign in" landing.
  if (now > parsed.exp * 1000) return { action: 'login', reason: 'expired' };
  return { action: 'session', uid: parsed.uid, name: displayName(user.displayName) };
}
