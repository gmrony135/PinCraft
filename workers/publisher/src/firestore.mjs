import { PublishError, fail, base64url, unbase64, utf8, readBounded } from './security.mjs';
const encode = value => {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number' && Number.isFinite(value)) return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (value && typeof value === 'object') return { mapValue: { fields: fields(value) } };
  fail('invalid_document', 'A publishing record contained an unsupported value.');
};
const decode = value => 'nullValue' in value ? null : 'timestampValue' in value ? new Date(value.timestampValue) : 'integerValue' in value ? Number(value.integerValue) : 'doubleValue' in value ? Number(value.doubleValue) : 'booleanValue' in value ? value.booleanValue : 'stringValue' in value ? value.stringValue : 'arrayValue' in value ? (value.arrayValue.values || []).map(decode) : 'mapValue' in value ? unpack(value.mapValue.fields || {}) : null;
export const fields = value => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([key, v]) => [key, encode(v)]));
export const unpack = value => Object.fromEntries(Object.entries(value).map(([key, v]) => [key, decode(v)]));
let cache = new WeakMap();
export async function serviceAccess(env, send = fetch, now = Date.now()) {
  const found = cache.get(env); if (found?.expires > now + 60000) return found.token;
  const project = env.FIREBASE_PROJECT_ID || '', email = env.FIREBASE_ADMIN_CLIENT_EMAIL || '', pem = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').replaceAll('\\n', '\n');
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project) || !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(email) || !pem.includes('-----BEGIN PRIVATE KEY-----')) fail('publisher_setup_required', 'Firebase server authorization is not configured for publishing.', { status: 503 });
  const header = base64url(utf8(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))), payload = base64url(utf8(JSON.stringify({ iss: email, scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/identitytoolkit', aud: 'https://oauth2.googleapis.com/token', iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 3500 })));
  const key = await crypto.subtle.importKey('pkcs8', unbase64(pem.replace(/-----[^-]+-----|\s/g, '')), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const jwt = `${header}.${payload}.${base64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, utf8(header + '.' + payload))))}`;
  const r = await send('https://oauth2.googleapis.com/token', { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }), signal: AbortSignal.timeout(15000) });
  let body; try { body = JSON.parse(new TextDecoder().decode(await readBounded(r, 24000))); } catch { fail('firebase_unavailable', 'Firebase server authorization is temporarily unavailable.', { status: 503, retryable: true }); }
  if (!r.ok || typeof body.access_token !== 'string' || !Number.isFinite(body.expires_in)) fail('firebase_unavailable', 'Firebase server authorization was not confirmed.', { status: 503, retryable: true });
  cache.set(env, { token: body.access_token, expires: now + Math.min(3600, body.expires_in) * 1000 }); return body.access_token;
}
export class FirestoreStore {
  constructor(env, send = fetch) { this.env = env; this.send = send; this.root = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`; this.base = 'https://firestore.googleapis.com/v1/' + this.root; this.requests = 0; }
  async call(path, { method = 'POST', body, missing = false } = {}) {
    // Keep headroom below the free plan's 50 external subrequests/invocation.
    if (++this.requests > 38) fail('invocation_budget', 'This publishing step will continue on the next background check.', { status: 503, retryable: true });
    let r; try { r = await this.send(this.base + path, { method, redirect: 'error', headers: { Authorization: 'Bearer ' + await serviceAccess(this.env, this.send), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) }); } catch { fail('database_unavailable', 'The private publishing database is temporarily unavailable.', { status: 503, retryable: true }); }
    if (missing && r.status === 404) { await r.body?.cancel(); return null; }
    let data; try { data = JSON.parse(new TextDecoder().decode(await readBounded(r, 850000))); } catch { fail('database_unavailable', 'The publishing database response could not be read.', { status: 503, retryable: true }); }
    if (!r.ok) throw new PublishError(r.status === 409 || data?.error?.status === 'ABORTED' ? 'transaction_conflict' : 'database_unavailable', 'The private publishing change could not be confirmed. No success was assumed.', { status: 503, retryable: true, upstreamStatus: r.status });
    return data;
  }
  async get(path, transaction = null) { const d = await this.call('/' + path + (transaction ? '?transaction=' + encodeURIComponent(transaction) : ''), { method: 'GET', missing: true }); return d ? unpack(d.fields || {}) : null; }
  async list(parent, collection, { field = null, op = 'EQUAL', value = null, order = null, direction = 'ASCENDING', limit = 50, transaction = null } = {}) {
    const query = { from: [{ collectionId: collection }], limit, ...(field ? { where: { fieldFilter: { field: { fieldPath: field }, op, value: encode(value) } } } : {}), ...(order ? { orderBy: [{ field: { fieldPath: order }, direction }] } : {}) };
    const result = await this.call((parent ? '/' + parent : '') + ':runQuery', { body: { structuredQuery: query, ...(transaction ? { transaction } : {}) } });
    return result.filter(row => row.document).map(row => ({ path: row.document.name.slice(this.root.length + 1), value: unpack(row.document.fields || {}) }));
  }
  async transaction(task) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { transaction } = await this.call(':beginTransaction', { body: { options: { readWrite: {} } } }), writes = []; let dirty = false;
      const tx = { get: path => { if (dirty) fail('transaction_order', 'A publishing transaction must read before writing.'); return this.get(path, transaction); }, list: (parent, collection, options = {}) => { if (dirty) fail('transaction_order', 'A publishing transaction must read before writing.'); return this.list(parent, collection, { ...options, transaction }); }, set: (path, value) => { dirty = true; const f = fields(value); if (utf8(JSON.stringify(f)).length > 800000) fail('document_too_large', 'The publishing record is too large. Images must be referenced, not stored as Base64 in Firestore.'); writes.push({ update: { name: this.root + '/' + path, fields: f } }); }, delete: path => { dirty = true; writes.push({ delete: this.root + '/' + path }); } };
      try { const result = await task(tx); if (writes.length) await this.call(':commit', { body: { transaction, writes } }); else await this.call(':rollback', { body: { transaction } }); return result; }
      catch (error) { try { await this.call(':rollback', { body: { transaction } }); } catch {} if (error.code !== 'transaction_conflict' || attempt === 2) throw error; }
    }
  }
  async set(path, value) { return this.transaction(async tx => tx.set(path, value)); }
  async managedUser(uid) {
    let r; try { r = await this.send(`https://identitytoolkit.googleapis.com/v1/projects/${this.env.FIREBASE_PROJECT_ID}/accounts:lookup`, { method: 'POST', redirect: 'error', headers: { Authorization: 'Bearer ' + await serviceAccess(this.env, this.send), 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: [uid] }), signal: AbortSignal.timeout(15000) }); } catch { fail('identity_unavailable', 'Account access could not be checked. Nothing was published.', { status: 503, retryable: true }); }
    let data; try { data = JSON.parse(new TextDecoder().decode(await readBounded(r, 24000))); } catch { fail('identity_unavailable', 'Account access could not be checked.', { status: 503, retryable: true }); }
    const user = data.users?.find(row => row.localId === uid);
    if (!r.ok || !user || user.disabled || user.emailVerified !== true || !(user.providerUserInfo || []).some(row => ['password', 'google.com'].includes(row.providerId))) fail('identity_unavailable', 'This account no longer has verified publishing access.', { status: 403 });
    return true;
  }
}
