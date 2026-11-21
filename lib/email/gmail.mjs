// Gmail API sending as the Dream Boost account, using OAuth with the gmail.send scope only.
// No token or password lives in the repo. The refresh token is kept encrypted in Firestore (see gmail-store.mjs).
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { GMAIL_REDIRECT_URI, GMAIL_SCOPE, SENDER_EMAIL, SENDER_NAME, gmailOAuthClient } from './config.mjs';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const CONSENT_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const ADDRESS = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// Access tokens are cached per process only, until shortly before they expire.
const cache = new Map();

export class GmailError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const headerValue = text => {
  const value = String(text ?? '');
  if (/[\r\n]/.test(value)) throw new GmailError('header_injection');
  return value;
};

// RFC 2047 encoding for non-ASCII subjects (Bengali).
export function encodeHeader(text) {
  const value = headerValue(text);
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function foldBase64(text) {
  return text.match(/.{1,76}/g)?.join('\r\n') || '';
}

// Builds the RFC 2822 message for the Gmail API. The From address is always the sender constant.
export function buildRawMessage({ to, subject, html, text }) {
  const recipient = headerValue(to).trim();
  if (!ADDRESS.test(recipient) || recipient.length > 254) throw new GmailError('invalid_recipient');
  const head = [
    `From: ${SENDER_NAME} <${SENDER_EMAIL}>`,
    `To: ${recipient}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
  ];
  if (typeof text !== 'string' || !text) {
    const lines = [
      ...head,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      foldBase64(Buffer.from(String(html ?? ''), 'utf8').toString('base64')),
    ];
    return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
  }
  // multipart/alternative: the plain-text part first, then the HTML part (RFC 2046 order, richest last).
  const boundary = `pincraft-${randomBytes(12).toString('hex')}`;
  const lines = [
    ...head,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    foldBase64(Buffer.from(text, 'utf8').toString('base64')),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    foldBase64(Buffer.from(String(html ?? ''), 'utf8').toString('base64')),
    `--${boundary}--`,
    '',
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}

export async function accessToken({ refreshToken, fetchImpl = fetch, env = process.env, now = Date.now() }) {
  const cached = cache.get(refreshToken);
  if (cached && cached.expiresAt - 60000 > now) return cached.token;
  const { clientId, clientSecret } = gmailOAuthClient(env);
  if (!clientId || !clientSecret) throw new GmailError('oauth_client_missing');
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' });
  const response = await fetchImpl(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    // invalid_grant means the grant was revoked or expired: the owner must reconnect.
    throw new GmailError(data.error === 'invalid_grant' ? 'reauth_required' : `token_status_${response.status}`);
  }
  cache.set(refreshToken, { token: data.access_token, expiresAt: now + Number(data.expires_in || 3600) * 1000 });
  return data.access_token;
}

// Sends one message. Returns the Gmail message id. Error text never includes the response body.
export async function sendGmail({ refreshToken, to, subject, html, text, fetchImpl = fetch, env = process.env, now = Date.now() }) {
  const raw = buildRawMessage({ to, subject, html, text });
  const token = await accessToken({ refreshToken, fetchImpl, env, now });
  const response = await fetchImpl(SEND_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw }),
    cache: 'no-store',
  });
  if (response.status === 401) { cache.delete(refreshToken); throw new GmailError('reauth_required'); }
  if (!response.ok) throw new GmailError(`send_status_${response.status}`);
  const data = await response.json().catch(() => ({}));
  return typeof data.id === 'string' ? data.id : null;
}

// ---- One-time connection (owner approves as the Dream Boost account) ----

export function newState() {
  return randomBytes(24).toString('base64url');
}

// The browser receives an HMAC of the state in a cookie. The callback must present both.
export function stateTag(state, secret) {
  if (!secret) throw new GmailError('state_secret_missing');
  return createHmac('sha256', secret).update(`gmail-oauth-state|${state}`).digest('base64url');
}

export function stateMatches(state, cookieValue, secret) {
  if (typeof state !== 'string' || !state || typeof cookieValue !== 'string' || !secret) return false;
  const expected = Buffer.from(stateTag(state, secret));
  const actual = Buffer.from(cookieValue);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function consentUrl({ state, env = process.env }) {
  const { clientId } = gmailOAuthClient(env);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: GMAIL_REDIRECT_URI,
    response_type: 'code',
    scope: `${GMAIL_SCOPE} openid email`,
    access_type: 'offline',
    prompt: 'consent',
    login_hint: SENDER_EMAIL,
    include_granted_scopes: 'false',
    state,
  });
  return `${CONSENT_URL}?${params.toString()}`;
}

export async function exchangeCode({ code, fetchImpl = fetch, env = process.env }) {
  const { clientId, clientSecret } = gmailOAuthClient(env);
  if (!clientId || !clientSecret) throw new GmailError('oauth_client_missing');
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: GMAIL_REDIRECT_URI, grant_type: 'authorization_code' });
  const response = await fetchImpl(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new GmailError(`exchange_status_${response.status}`);
  return data;
}

// Checks the grant before anything is stored: it must be the Dream Boost account, verified,
// with the gmail.send scope, and must include a refresh token. The id_token comes directly from Google's
// token endpoint over TLS, authenticated with the client secret, so its claims are read here.
export function verifyGrant(tokens, { env = process.env, now = Date.now() } = {}) {
  if (typeof tokens?.refresh_token !== 'string' || !tokens.refresh_token) return { ok: false, reason: 'no_refresh_token' };
  const granted = String(tokens.scope || '').split(/\s+/);
  if (!granted.includes(GMAIL_SCOPE)) return { ok: false, reason: 'scope_missing' };
  const parts = String(tokens.id_token || '').split('.');
  if (parts.length !== 3) return { ok: false, reason: 'no_identity' };
  let claims;
  try { claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return { ok: false, reason: 'no_identity' }; }
  const { clientId } = gmailOAuthClient(env);
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)) return { ok: false, reason: 'bad_issuer' };
  if (!clientId || claims.aud !== clientId) return { ok: false, reason: 'bad_audience' };
  if (!(Number(claims.exp) * 1000 > now)) return { ok: false, reason: 'expired' };
  if (String(claims.email || '').toLowerCase() !== SENDER_EMAIL || claims.email_verified !== true) return { ok: false, reason: 'wrong_account' };
  return { ok: true, account: SENDER_EMAIL, refreshToken: tokens.refresh_token };
}

export function refreshTokenFingerprint(token) {
  return createHash('sha256').update(String(token)).digest('hex').slice(0, 12);
}
