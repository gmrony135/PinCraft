// Owner session cookie: HMAC-signed, httpOnly, 8 hours. Verified on every metrics request.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { OWNER_EMAIL } from './config.mjs';

export const COOKIE = 'pcadmin_session';
export const SESSION_SECONDS = 8 * 60 * 60;

function secret() {
  const value = process.env.ADMIN_SESSION_SECRET || '';
  if (value.length < 32) throw new Error('ADMIN_SESSION_SECRET is missing or too short.');
  return value;
}

const sign = payload => createHmac('sha256', secret()).update(payload).digest('base64url');

export function signSession(email, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ email, exp: now + SESSION_SECONDS * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readSession(value, now = Date.now()) {
  if (typeof value !== 'string' || value.length > 1000) return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const a = Buffer.from(signature), b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
  if (!data || data.exp <= now || data.email !== OWNER_EMAIL) return null;
  return data;
}
