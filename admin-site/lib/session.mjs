// Owner session cookie: HMAC-signed, httpOnly, Secure, SameSite=Strict, short-lived.
// The owner is re-checked against Firebase Auth on every protected request (currentOwner).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { OWNER_EMAIL } from './config.mjs';
import { auth } from './firebase.mjs';

// __Host- prefix: must be Secure, Path=/, and no Domain attribute.
export const COOKIE = '__Host-pcadmin';
export const SESSION_SECONDS = 2 * 60 * 60;
export const cookieOptions = maxAge => ({ httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge });

function secret() {
  const value = process.env.ADMIN_SESSION_SECRET || '';
  if (value.length < 32) throw new Error('ADMIN_SESSION_SECRET is missing or too short.');
  return value;
}

const sign = payload => createHmac('sha256', secret()).update(payload).digest('base64url');

export function signSession(email, uid, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ email, uid, iat: now, exp: now + SESSION_SECONDS * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readSession(value, now = Date.now()) {
  if (typeof value !== 'string' || value.length > 1000) return null;
  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const a = Buffer.from(signature), b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
  if (!data || typeof data.uid !== 'string' || !data.uid || !(data.exp > now) || data.email !== OWNER_EMAIL) return null;
  return data;
}

// Returns the session only if the cookie is valid AND the Firebase account is still the verified owner.
// Any failure returns null (fail closed) and never reveals why.
export async function currentOwner(value) {
  try {
    const session = readSession(value);
    if (!session) return null;
    const owner = await auth().getUserByEmail(OWNER_EMAIL);
    if (owner.uid !== session.uid || owner.emailVerified !== true || owner.disabled) return null;
    return session;
  } catch {
    return null;
  }
}
