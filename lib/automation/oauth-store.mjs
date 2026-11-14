import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { transaction } from './db.mjs';
import { AutomationError } from './errors.mjs';
import { encryptCredentials, decryptCredentials } from './vault.mjs';
import { addLog, ensureSettings } from './repository.mjs';
import { entitlements } from '../billing/repository.mjs';
import { pinterestAccountKey } from './pin-quota.mjs';
import { authorizationURL, digest, OAUTH_TTL_SECONDS, tokenAudience, validProvider } from './oauth-config.mjs';
import { accountRef, connectionRef, attemptRef, jobRef, data, ms, readAccount, writeAccount, maintenanceAt, validConnectionId } from './firestore.mjs';
export const attemptAudience = (userId, provider, stateHash) => `oauth-attempt:v1:${provider}:${userId}:${stateHash}`;
const checkProvider = provider => { if (!validProvider(provider)) throw new AutomationError('invalid_provider', 'Choose Pinterest or Blogger.'); };
export function emptyConnection(userId, provider, connectionId = provider) { return { user_id: userId, provider, connection_id: connectionId, account_key: null, account_name: null, encrypted_tokens: null, status: 'disconnected', scopes: [], expires_at: null, refresh_expires_at: null, maintenance_at: null, revision: 1, token_version: 1, refresh_lease: null, refresh_lease_until: null, last_refreshed_at: null, last_error: null, revocation_status: 'not_requested', created_at: new Date(), updated_at: new Date() }; }
async function linkedAccounts(tx, db, userId, provider, connectionId) {
  const all = await tx.get(db.collection('pincraft_accounts').where('user_id', '==', userId));
  return all.docs.map(data).filter(row => (row[`${provider}_connection_id`] || provider) === connectionId);
}
async function requireIdle(tx, db, rows) {
  const jobs = await Promise.all(rows.filter(row => row.active_job_id).map(row => tx.get(jobRef(db, row.active_job_id))));
  if (jobs.some(snapshot => ms(data(snapshot)?.lease_until) > Date.now())) throw new AutomationError('worker_busy', 'Pause automation and let its in-flight request finish before replacing account authorization.', { status: 409 });
}
function pauseLinked(tx, db, rows, provider, clear = false) {
  for (const row of rows) {
    row.enabled = false;
    if (clear) {
      if (provider === 'pinterest') { row.pinterest_board_id = null; row.pinterest_board_name = null; row.pinterest_account_key = null; row.pinterest_revision = null; }
      else { row.blogger_blog_id = null; row.blogger_blog_name = null; row.blogger_blog_url = null; row.blogger_revision = null; }
      row.connection_version++; row.last_error = null;
    }
    writeAccount(tx, db, row);
  }
}
function capacity(provider, rows, target, access) {
  const count = rows.filter(row => row.provider === provider && row.connection_id !== target && row.status !== 'disconnected' && row.encrypted_tokens).length;
  const max = access.limits[provider === 'pinterest' ? 'pinterest' : 'websites'];
  if (count >= max) throw new AutomationError('subscription_required', 'Your plan includes one Pinterest account and one website for free. An approved subscription is required to add more.', { status: 402 });
}
export async function startOAuth(db, userId, provider, { connectionId = provider, addNew = false } = {}) {
  checkProvider(provider); if (addNew) connectionId = randomUUID();
  if (!validConnectionId(connectionId)) throw new AutomationError('invalid_connection', 'Choose one of your saved connections.');
  await ensureSettings(db, userId);
  const state = randomBytes(32).toString('base64url'), browser = randomBytes(32).toString('base64url'), verifier = provider === 'blogger' ? randomBytes(48).toString('base64url') : null, stateHash = digest(state);
  const authorizationUrl = authorizationURL(provider, state, verifier ? Buffer.from(digest(verifier), 'hex').toString('base64url') : null);
  await transaction(db, async tx => {
    const [attempt, connection, all, access, linked] = await Promise.all([tx.get(attemptRef(db, userId, provider)), tx.get(connectionRef(db, userId, provider, connectionId)), tx.get(accountRef(db, userId).collection('connections')), entitlements(db, userId, tx), linkedAccounts(tx, db, userId, provider, connectionId)]);
    await requireIdle(tx, db, linked);
    const old = data(attempt), row = data(connection) || emptyConnection(userId, provider, connectionId);
    if(row.user_id !== userId || row.provider !== provider) throw new AutomationError('invalid_connection', 'This saved connection belongs to a different service.', { status: 403 });
    if (old && ms(old.created_at) > Date.now() - 30000) throw new AutomationError('rate_limited', 'Wait 30 seconds before starting authorization again.', { status: 429 });
    capacity(provider, all.docs.map(doc => ({ ...data(doc), connection_id: doc.id })), connectionId, access);
    if (!connection.exists) tx.create(connection.ref, row);
    tx.set(attemptRef(db, userId, provider), { state_hash: stateHash, user_id: userId, provider, connection_id: connectionId, browser_hash: digest(browser), connection_revision: row.revision, pkce_envelope: verifier ? encryptCredentials(attemptAudience(userId, provider, stateHash), { verifier }) : null, created_at: new Date(), expires_at: new Date(Date.now() + OAUTH_TTL_SECONDS * 1000) });
    pauseLinked(tx, db, linked, provider);
    addLog(db, userId, null, 'oauth_started', 'info', `${provider === 'pinterest' ? 'Pinterest' : 'Blogger'} authorization started. Related automations are paused until authorization and destinations are verified.`, tx);
  }); return { authorizationUrl, browser, connectionId };
}
export async function consumeOAuth(db, userId, provider, state, browser) {
  checkProvider(provider);
  if (!/^[A-Za-z0-9_-]{43}$/.test(state || '') || !/^[A-Za-z0-9_-]{43}$/.test(browser || '')) throw new AutomationError('oauth_state_invalid', 'The authorization request expired or could not be verified.', { status: 403 });
  const row = await transaction(db, async tx => {
    const ref = attemptRef(db, userId, provider), saved = data(await tx.get(ref));
    if (!saved || saved.user_id !== userId || saved.provider !== provider || saved.state_hash !== digest(state) || saved.browser_hash !== digest(browser) || ms(saved.expires_at) <= Date.now()) throw new AutomationError('oauth_state_invalid', 'The authorization request expired or has already been used.', { status: 403 });
    tx.delete(ref); return saved;
  }); return { ...row, verifier: row.pkce_envelope ? decryptCredentials(attemptAudience(userId, provider, row.state_hash), row.pkce_envelope).verifier : null };
}
export async function saveOAuthGrant(db, userId, provider, grant, expectedRevision, connectionId = provider) {
  checkProvider(provider);
  const secret = provider === 'blogger' ? { refreshToken: grant.refreshToken } : { accessToken: grant.accessToken, refreshToken: grant.refreshToken };
  if (typeof secret.refreshToken !== 'string' || !secret.refreshToken || (provider === 'pinterest' && (!secret.accessToken || !grant.expiresAt))) throw new AutomationError('oauth_offline_required', 'Offline publishing permission is required. Reconnect and allow the requested access.');
  const encrypted = encryptCredentials(tokenAudience(userId, provider, connectionId), secret);
  if (!grant.identity || (provider === 'blogger' && (typeof grant.identity.id !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(grant.identity.id)))) throw new AutomationError('oauth_identity_required', 'The service must confirm the authorized account before a connection can be saved.', { status: 409 });
  const accountKey = provider === 'pinterest' ? pinterestAccountKey(grant.identity) : digest(`blogger-account:${grant.identity.id}`);
  await transaction(db, async tx => {
    const ref = connectionRef(db, userId, provider, connectionId);
    const [snapshot, all, access, linked] = await Promise.all([tx.get(ref), tx.get(accountRef(db, userId).collection('connections')), entitlements(db, userId, tx), linkedAccounts(tx, db, userId, provider, connectionId)]);
    await requireIdle(tx, db, linked);
    const row = data(snapshot);
    if (!row || row.provider !== provider || row.user_id !== userId || row.revision !== expectedRevision) throw new AutomationError('oauth_changed', 'This connection changed during authorization. Start Connect again.', { status: 409 });
    const rows = all.docs.map(doc => ({ ...data(doc), connection_id: doc.id }));
    capacity(provider, rows, connectionId, access);
    if (accountKey && rows.some(other => other.connection_id !== connectionId && other.account_key === accountKey && other.status !== 'disconnected' && other.encrypted_tokens)) throw new AutomationError('connection_exists', 'This account is already connected. Reconnect the existing account rather than adding a duplicate.', { status: 409 });
    const expires = provider === 'pinterest' ? grant.expiresAt : null, refreshExpires = grant.refreshExpiresAt || null;
    tx.set(ref, { ...row, connection_id: connectionId, account_key: accountKey, account_name: typeof grant.identity?.name === 'string' ? grant.identity.name.slice(0, 160) : typeof grant.identity?.username === 'string' ? grant.identity.username.slice(0, 160) : null, encrypted_tokens: encrypted, status: 'connected', scopes: grant.scopes, expires_at: expires, refresh_expires_at: refreshExpires, maintenance_at: maintenanceAt(provider, expires, refreshExpires), revision: row.revision + 1, token_version: row.token_version + 1, refresh_lease: null, refresh_lease_until: null, last_error: null, revocation_status: 'not_requested', updated_at: new Date() });
    pauseLinked(tx, db, linked, provider, true);
    addLog(db, userId, null, 'oauth_connected', 'success', `${provider === 'pinterest' ? 'Pinterest' : 'Blogger'} confirmed authorization. Select and verify an owned destination before enabling automation.`, tx);
  });
}
export async function removeOAuthLocally(db, userId, provider, connectionId = provider) {
  checkProvider(provider); await ensureSettings(db, userId);
  return transaction(db, async tx => {
    const ref = connectionRef(db, userId, provider, connectionId), [snapshot, linked] = await Promise.all([tx.get(ref), linkedAccounts(tx, db, userId, provider, connectionId)]), row = data(snapshot) || emptyConnection(userId, provider, connectionId), revision = row.revision + 1;
    if (row.provider !== provider || row.user_id !== userId) throw new AutomationError('invalid_connection', 'This connection does not belong to your account.', { status: 403 });
    tx.set(ref, { ...emptyConnection(userId, provider, connectionId), revision, token_version: row.token_version + 1, revocation_status: provider === 'pinterest' ? 'manual_required' : 'unconfirmed' }); tx.delete(attemptRef(db, userId, provider));
    pauseLinked(tx, db, linked, provider, true);
    addLog(db, userId, null, 'oauth_disconnected', 'info', `${provider === 'pinterest' ? 'Pinterest' : 'Blogger'} disconnected. Related automations stopped and stored authorization was deleted. A request already sent may finish.`, tx);
    return { encrypted: row.encrypted_tokens, revision, connectionId };
  });
}
