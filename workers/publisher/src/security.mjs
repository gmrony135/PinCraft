// Web-standard primitives only: usable in workerd, without Node/Firebase Admin.
export class PublishError extends Error {
  constructor(code, message, { status = 400, retryable = false, uncertain = false, upstreamStatus = null, retryAfter = null } = {}) { super(message); Object.assign(this, { code, status, retryable, uncertain, upstreamStatus, retryAfter }); }
}
export const fail = (code, message, options) => { throw new PublishError(code, message, options); };
const enc = new TextEncoder(), dec = new TextDecoder();
export const utf8 = value => enc.encode(value);
export function base64(bytes) { let text = ''; for (let n = 0; n < bytes.length; n += 8192) text += String.fromCharCode(...bytes.subarray(n, n + 8192)); return btoa(text); }
export function unbase64(value) { try { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); } catch { fail('invalid_encoding', 'The secure value could not be decoded.'); } }
export const base64url = bytes => base64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
export const fromBase64url = value => unbase64(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4));
export const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
export const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
export const validUid = value => typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\u0000-\u001f\u007f/]/.test(value);
export const validId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export const numericId = value => typeof value === 'string' && /^\d{3,40}$/.test(value);
export const connectionId = value => ['pinterest', 'blogger'].includes(value) || validId(value);
export function publicHttps(value) {
  let url; try { url = new URL(value); } catch { fail('invalid_url', 'Use a valid public HTTPS URL.'); }
  const h = url.hostname.toLowerCase();
  if (typeof value !== 'string' || value.length > 3000 || url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || url.hash || !h.includes('.') || h.endsWith('.') || /[^a-z0-9.-]/.test(h) || /^\d/.test(h) && /^\d+(?:\.\d+){3}$/.test(h) || /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/.test(h) || h === 'metadata.google.internal') fail('invalid_url', 'Only public HTTPS URLs without credentials or fragments are allowed.');
  return url;
}
export function publicOrigin(value) { const url = publicHttps(value); if (url.pathname !== '/' || url.search) fail('invalid_origin', 'Configure an exact HTTPS origin without a path or query.'); return url.origin; }
export function keyBytes(env) { const value = env.TOKEN_ENCRYPTION_KEY || ''; if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) fail('publisher_setup_required', 'Secure publishing storage is not configured.', { status: 503 }); const key = unbase64(value); if (key.length !== 32) fail('publisher_setup_required', 'Secure publishing storage is not configured.', { status: 503 }); return key; }
// Exact AES-GCM envelope/AAD compatibility with the existing PinCraft vault.
export async function seal(env, audience, value) {
  const key = await crypto.subtle.importKey('raw', keyBytes(env), 'AES-GCM', false, ['encrypt']), iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8('pincraft-auto:v1:' + audience), tagLength: 128 }, key, utf8(JSON.stringify(value))));
  return ['v1', base64(iv), base64(bytes.subarray(bytes.length - 16)), base64(bytes.subarray(0, bytes.length - 16))].join(':');
}
export async function open(env, audience, envelope) {
  try { const [version, iv, tag, body, extra] = String(envelope).split(':'); if (version !== 'v1' || extra || !iv || !tag || !body) throw new Error(); const data = unbase64(body), auth = unbase64(tag), bytes = new Uint8Array(data.length + auth.length); bytes.set(data); bytes.set(auth, data.length); const key = await crypto.subtle.importKey('raw', keyBytes(env), 'AES-GCM', false, ['decrypt']); return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(iv), additionalData: utf8('pincraft-auto:v1:' + audience), tagLength: 128 }, key, bytes))); }
  catch { fail('reconnect_required', 'Saved authorization could not be opened. Reconnect the affected account.', { status: 409 }); }
}
export const tokenAudience = (uid, provider, id = provider) => `oauth:v1:${provider}:${uid}${id === provider ? '' : ':' + id}`;
export const cookieName = provider => `pincraft.publish.oauth.${provider}.v1`;
export function oauthCookie(provider, value) { return `${cookieName(provider)}=${value}; Path=/api/${provider}/callback; Max-Age=${value ? 600 : 0}; HttpOnly; Secure; SameSite=Lax`; }
export function cookieValue(header, name) { const raw = String(header || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '=')); return raw ? raw.slice(name.length + 1) : ''; }
export async function verifyBridge(request, env, raw, now = Date.now()) {
  try {
    const secret = env.PINCRAFT_PUBLISH_BRIDGE_SECRET || ''; if (secret.length < 32 || secret.length > 256) throw new Error();
    const value = request.headers.get('x-pincraft-publish-authorization') || ''; if (value.length > 4000) throw new Error(); const [payload, signature, extra] = value.split('.'); if (!payload || !signature || extra) throw new Error();
    const key = await crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']); if (!await crypto.subtle.verify('HMAC', key, fromBase64url(signature), utf8(payload))) throw new Error();
    const claims = JSON.parse(dec.decode(fromBase64url(payload))), url = new URL(request.url);
    if (!validUid(claims.uid) || claims.method !== request.method || claims.path !== url.pathname + url.search || claims.bodyHash !== await digest(raw) || claims.cookieHash !== await digest(request.headers.get('x-pincraft-oauth-browser') || '') || claims.audience !== publicOrigin(env.APP_URL) || !Number.isFinite(claims.exp) || !Number.isFinite(claims.iat) || claims.iat > now + 5000 || now - claims.iat > 30000 || claims.exp < now || claims.exp - claims.iat !== 30000 || !validId(claims.jti)) throw new Error();
    return claims;
  } catch { fail('unauthorized', 'A verified PinCraft session is required.', { status: 401 }); }
}
export async function readBounded(response, max = 160000) {
  if (Number(response.headers.get('content-length') || 0) > max) { await response.body?.cancel(); fail('response_too_large', 'The remote response exceeded its safe size limit.'); }
  const reader = response.body?.getReader(); if (!reader) return new Uint8Array(); const chunks = []; let length = 0;
  for (;;) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > max) { await reader.cancel(); fail('response_too_large', 'The remote response exceeded its safe size limit.'); } chunks.push(value); }
  const result = new Uint8Array(length); let at = 0; for (const chunk of chunks) { result.set(chunk, at); at += chunk.length; } return result;
}
// Never return raw upstream bodies: even a useful error may reflect a token,
// authorization code, email, arbitrary markup or a provider-side diagnostic.
export function safeUpstreamMessage(value, fallback) {
  if (typeof value !== 'string' || value.length > 300 || /[<>\u0000-\u001f\u007f]|bearer|pina_|pinr_|ya29\.|access_token|refresh_token|client_secret|authorization|api.?key|password|[A-Za-z0-9_+/=-]{28,}|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(value)) return fallback;
  return value.replace(/https?:\/\/\S+/g, '[link omitted]').slice(0, 300);
}
export const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...headers } });
