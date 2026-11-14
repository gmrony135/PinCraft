import { PublishError, fail, random, digest, base64, base64url, utf8, seal, open, tokenAudience, connectionId, numericId, publicHttps, validId } from './security.mjs';
import { providers, scopes, ownerPath, connPath, emptyConnection, owned, connected, accountKey, config, requireConfig, ms, maintenanceAt, subscriptionState } from './model.mjs';
const secretToken = value => typeof value === 'string' && value.length > 0 && value.length <= 10000 && !/[\u0000-\u0020\u007f]/.test(value);
const grantExpiry = (value, now) => Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 366 * 86400 ? new Date(now + Number(value) * 1000) : null;
export function parseGrant(provider, value, previous = null, now = Date.now()) {
  const expiresAt = grantExpiry(value?.expires_in, now), required = scopes[provider], granted = typeof value?.scope === 'string' ? value.scope.split(/[ ,]+/).filter(Boolean) : previous ? required : [];
  if (!secretToken(value?.access_token) || String(value.token_type).toLowerCase() !== 'bearer' || !expiresAt) fail('oauth_invalid_response', 'The service did not confirm a valid expiring OAuth token. Reconnect the account.', { status: 409 });
  if (required.some(scope => !granted.includes(scope))) fail('oauth_scope_missing', 'Required publishing permissions were not granted. Connect again and allow the requested permissions.', { status: 409 });
  const refreshToken = secretToken(value.refresh_token) ? value.refresh_token : previous?.refreshToken;
  if (!refreshToken) fail('oauth_offline_required', 'Offline publishing permission was not returned. Connect again and allow offline access.', { status: 409 });
  const absolute = Number(value.refresh_token_expires_at), refreshExpiresAt = grantExpiry(value.refresh_token_expires_in, now) || (Number.isFinite(absolute) && absolute > now / 1000 ? new Date(absolute * 1000) : null) || previous?.refreshExpiresAt || null;
  return { accessToken: value.access_token, refreshToken, expiresAt, refreshExpiresAt, scopes: required };
}
const attemptPath = async (uid, provider) => await ownerPath(uid) + '/publisherOAuthAttempts/' + provider;
const attemptAudience = (uid, provider, stateHash) => `publisher-oauth-attempt:v1:${provider}:${uid}:${stateHash}`;
const bearer = token => ({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' });
const name = (value, fallback) => typeof value === 'string' && !/[<>\u0000-\u001f\u007f]/.test(value) ? value.slice(0, 160) : fallback;
function requireCapacity(provider, rows, target, access) { if (rows.filter(row => row.provider === provider && row.connection_id !== target && row.status !== 'disconnected' && row.encrypted_tokens).length >= access.limits[provider === 'pinterest' ? 'pinterest' : 'websites']) fail('subscription_required', 'Your free plan includes one Pinterest account and one website. An approved subscription is required for additional accounts.', { status: 402 }); }
export class OAuth {
  constructor(env, db, http) { this.env = env; this.db = db; this.http = http; }
  async linked(tx, uid) {
    const accounts = await tx.list('', 'pincraft_accounts', { field: 'user_id', value: uid, limit: 31 });
    if (accounts.length > 30) fail('workspace_attention', 'Your saved automations need an account review before authorization can change.', { status: 409 });
    return accounts;
  }
  async pause(tx, accounts, provider, id, { requireIdle = false, clear = false } = {}) {
    const relevant = accounts.filter(({ value: row }) => (row[provider + '_connection_id'] || provider) === id), active = requireIdle ? await Promise.all(relevant.filter(({ value: row }) => row.active_job_id).map(({ value: row }) => tx.get('pincraft_jobs/' + row.active_job_id))) : [];
    if (active.some(job => ms(job?.lease_until) > Date.now())) fail('worker_busy', 'Pause automation and wait for its in-flight request before replacing authorization.', { status: 409 });
    // Return writes; callers perform every read before calling this closure.
    return () => { for (const { path, value: row } of relevant) { const next = { ...row, enabled: false, worker_due_at: null, updated_at: new Date() }; if (clear) { next.connection_version = (row.connection_version || 0) + 1; for (const key of provider === 'pinterest' ? ['pinterest_board_id','pinterest_board_name','pinterest_account_key','pinterest_revision'] : ['blogger_blog_id','blogger_blog_name','blogger_blog_url','blogger_revision']) next[key] = null; } tx.set(path, next); } };
  }
  async start(uid, provider, body) {
    const c = requireConfig(this.env, provider); if (Object.keys(body).some(k => !['connectionId','addNew'].includes(k)) || body.addNew !== undefined && typeof body.addNew !== 'boolean') fail('invalid_connection', 'Choose one of your connected accounts.');
    const id = body.addNew ? crypto.randomUUID() : body.connectionId || provider; if (!connectionId(id)) fail('invalid_connection', 'Select a valid connection.');
    const root = await ownerPath(uid), path = await connPath(uid, provider, id), attempt = await attemptPath(uid, provider), state = random(), browser = random(), verifier = provider === 'blogger' ? random() + random().slice(0, 21) : null, stateHash = await digest(state), browserHash = await digest(browser), pkce = verifier ? await seal(this.env, attemptAudience(uid, provider, stateHash), { verifier }) : null;
    await this.db.transaction(async tx => {
      const [row, old, all, sub, accounts] = await Promise.all([tx.get(path), tx.get(attempt), tx.list(root, 'connections', { limit: 10 }), tx.get('pincraft_subscriptions/' + root.split('/')[1]), this.linked(tx, uid)]);
      const current = row || emptyConnection(uid, provider, id); if (current.user_id !== uid || current.provider !== provider) fail('invalid_connection', 'This connection belongs to a different service.', { status: 403 });
      if (ms(current.publisher_mutation_until) > Date.now()) fail('worker_busy', 'An already-sent publishing request must finish before replacing this connection.', { status: 409 });
      if (old && ms(old.created_at) > Date.now() - 30000) fail('rate_limited', 'Wait thirty seconds before starting Connect again.', { status: 429 });
      if (all.length >= 10) fail('workspace_attention', 'Review your saved connections before adding another account.', { status: 409 });
      requireCapacity(provider, all.map(row => row.value), id, subscriptionState(sub));
      const pause = await this.pause(tx, accounts, provider, id, { requireIdle: true });
      if (!row) tx.set(path, current);
      tx.set(attempt, { user_id: uid, provider, connection_id: id, state_hash: stateHash, browser_hash: browserHash, connection_revision: current.revision, pkce_envelope: pkce, created_at: new Date(), expires_at: new Date(Date.now() + 600000) }); pause();
    });
    const url = new URL(provider === 'pinterest' ? 'https://www.pinterest.com/oauth/' : 'https://accounts.google.com/o/oauth2/v2/auth');
    for (const [key, value] of Object.entries({ client_id: c.clientId, redirect_uri: c.redirectUri, response_type: 'code', scope: scopes[provider].join(provider === 'pinterest' ? ',' : ' '), state, ...(provider === 'blogger' ? { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', code_challenge_method: 'S256', code_challenge: base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(verifier)))) } : {}) })) url.searchParams.set(key, value);
    return { authorizationUrl: url.href, browser };
  }
  async token(provider, fields) {
    const c = requireConfig(this.env, provider), pinterest = provider === 'pinterest';
    return this.http.request(pinterest ? 'https://api.pinterest.com/v5/oauth/token' : 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(pinterest ? { Authorization: 'Basic ' + base64(utf8(c.clientId + ':' + c.clientSecret)) } : {}) }, body: new URLSearchParams({ ...fields, ...(pinterest ? { continuous_refresh: 'true' } : { client_id: c.clientId, client_secret: c.clientSecret }) }).toString() });
  }
  async identity(provider, token) {
    const result = await this.http.request(provider === 'pinterest' ? 'https://api.pinterest.com/v5/user_account' : 'https://www.googleapis.com/blogger/v3/users/self', { headers: bearer(token) });
    if (provider === 'pinterest' ? !numericId(result?.id) || typeof result.username !== 'string' || !result.username : typeof result?.id !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(result.id)) fail('oauth_identity_required', 'The service did not confirm the authorized account. Connect again.', { status: 409 });
    return { id: result.id, username: result.username || null, name: name(provider === 'pinterest' ? result.username : result.displayName, 'Blogger account') };
  }
  async callback(uid, provider, query, browser) {
    requireConfig(this.env, provider); const state = query.get('state');
    if (query.getAll('state').length !== 1 || query.getAll('code').length > 1 || query.getAll('error').length > 1 || !/^[A-Za-z0-9_-]{43}$/.test(state || '') || !/^[A-Za-z0-9_-]{43}$/.test(browser || '')) fail('oauth_state_invalid', 'Authorization expired or could not be verified.', { status: 403 });
    const stateHash = await digest(state), browserHash = await digest(browser), path = await attemptPath(uid, provider);
    const attempt = await this.db.transaction(async tx => { const row = await tx.get(path); if (!row || row.user_id !== uid || row.provider !== provider || row.state_hash !== stateHash || row.browser_hash !== browserHash || ms(row.expires_at) <= Date.now()) fail('oauth_state_invalid', 'Authorization expired or has already been used.', { status: 403 }); tx.delete(path); return row; });
    if (query.has('error')) return { result: 'denied' };
    const code = query.get('code'); if (!secretToken(code) || code.length > 6000) fail('oauth_code_invalid', 'The authorization response was not valid.', { status: 409 });
    const verifier = attempt.pkce_envelope ? (await open(this.env, attemptAudience(uid, provider, stateHash), attempt.pkce_envelope)).verifier : null;
    const grant = parseGrant(provider, await this.token(provider, { grant_type: 'authorization_code', code, redirect_uri: config(this.env, provider).redirectUri, ...(provider === 'blogger' ? { code_verifier: verifier } : {}) })), identity = await this.identity(provider, grant.accessToken), key = await accountKey(provider, identity.id), secret = await seal(this.env, tokenAudience(uid, provider, attempt.connection_id), { accessToken: grant.accessToken, refreshToken: grant.refreshToken });
    const root = await ownerPath(uid), conn = await connPath(uid, provider, attempt.connection_id);
    await this.db.transaction(async tx => {
      const [row, all, sub, accounts] = await Promise.all([tx.get(conn), tx.list(root, 'connections', { limit: 10 }), tx.get('pincraft_subscriptions/' + root.split('/')[1]), this.linked(tx, uid)]);
      if (!row || row.user_id !== uid || row.provider !== provider || row.revision !== attempt.connection_revision) fail('oauth_changed', 'The connection changed during authorization. Start Connect again.', { status: 409 });
      if (ms(row.publisher_mutation_until) > Date.now()) fail('worker_busy', 'A publishing request is in flight. Reconnect after it finishes.', { status: 409 });
      requireCapacity(provider, all.map(r => r.value), attempt.connection_id, subscriptionState(sub));
      if (all.some(({ value: other }) => other.connection_id !== attempt.connection_id && other.account_key === key && connected(other))) fail('connection_exists', 'This account is already connected. Reconnect its existing connection.', { status: 409 });
      const pause = await this.pause(tx, accounts, provider, attempt.connection_id, { requireIdle: true, clear: true });
      tx.set(conn, { ...row, account_key: key, account_name: identity.name, encrypted_tokens: secret, status: 'connected', scopes: grant.scopes, expires_at: grant.expiresAt, refresh_expires_at: grant.refreshExpiresAt, maintenance_at: maintenanceAt(grant.expiresAt, grant.refreshExpiresAt), revision: row.revision + 1, token_version: row.token_version + 1, refresh_lease: null, refresh_lease_until: null, last_error: null, revocation_status: 'not_requested', updated_at: new Date() }); pause();
    }); return { result: 'connected' };
  }
  async reject(uid, provider, id, previous) {
    const path = await connPath(uid, provider, id);
    await this.db.transaction(async tx => { const row = await tx.get(path); if (row && row.status === 'connected' && row.revision === previous.revision && row.token_version === previous.token_version) tx.set(path, { ...row, status: 'reconnect_required', last_error: 'Offline publishing authorization could not be renewed. Reconnect this account.', refresh_lease: null, refresh_lease_until: null, maintenance_at: null, updated_at: new Date() }); });
  }
  async access(uid, provider, id = provider, force = false) {
    requireConfig(this.env, provider); const path = await connPath(uid, provider, id), row = owned(await this.db.get(path), uid, provider), now = Date.now(), secret = await open(this.env, tokenAudience(uid, provider, id), row.encrypted_tokens);
    if (row.refresh_expires_at && ms(row.refresh_expires_at) <= now) { await this.reject(uid, provider, id, row); fail('reconnect_required', 'Offline authorization expired. Reconnect this account.', { status: 409 }); }
    if (!force && secretToken(secret.accessToken) && ms(row.expires_at) > now + 300000 && (provider !== 'pinterest' || !row.refresh_expires_at || ms(row.refresh_expires_at) > now + 7 * 86400000)) return { token: secret.accessToken, row, id };
    const lease = crypto.randomUUID();
    await this.db.transaction(async tx => { const current = owned(await tx.get(path), uid, provider); if (current.revision !== row.revision || current.token_version !== row.token_version || ms(current.refresh_lease_until) > Date.now()) fail('oauth_refresh_busy', 'This account is already renewing its authorization. Try again shortly.', { status: 409, retryable: true }); tx.set(path, { ...current, refresh_lease: lease, refresh_lease_until: new Date(Date.now() + 90000) }); });
    try {
      const grant = parseGrant(provider, await this.token(provider, { grant_type: 'refresh_token', refresh_token: secret.refreshToken }), { ...secret, refreshExpiresAt: row.refresh_expires_at }), encrypted = await seal(this.env, tokenAudience(uid, provider, id), { accessToken: grant.accessToken, refreshToken: grant.refreshToken });
      const saved = await this.db.transaction(async tx => { const current = await tx.get(path); if (!current || current.status !== 'connected' || current.revision !== row.revision || current.token_version !== row.token_version || current.refresh_lease !== lease) fail('oauth_changed', 'Authorization changed while renewing. No credentials were restored.', { status: 409 }); const updated = { ...current, encrypted_tokens: encrypted, expires_at: grant.expiresAt, refresh_expires_at: grant.refreshExpiresAt, maintenance_at: maintenanceAt(grant.expiresAt, grant.refreshExpiresAt), token_version: current.token_version + 1, refresh_lease: null, refresh_lease_until: null, last_refreshed_at: new Date(), last_error: null, updated_at: new Date() }; tx.set(path, updated); return updated; });
      return { token: grant.accessToken, row: saved, id };
    } catch (error) {
      // A rejected/uncertain rotation must not cause a loop with a possibly
      // consumed refresh token. Save failure also requires reconnection.
      if (error.upstreamStatus === 429) { await this.db.transaction(async tx => { const current = await tx.get(path); if (current?.refresh_lease === lease) tx.set(path, { ...current, refresh_lease: null, refresh_lease_until: null }); }); throw error; }
      await this.reject(uid, provider, id, row); fail('reconnect_required', 'Offline authorization could not be renewed safely. Reconnect this account.', { status: 409 });
    }
  }
  async authorized(uid, provider, id, url, options = {}, existing = null) {
    let access = existing || await this.access(uid, provider, id);
    try { return { data: await this.http.request(url, { ...options, headers: { ...bearer(access.token), ...options.headers } }), access }; }
    catch (error) { if (error.code !== 'provider_unauthorized') throw error; access = await this.access(uid, provider, id, true); try { return { data: await this.http.request(url, { ...options, headers: { ...bearer(access.token), ...options.headers } }), access }; } catch (second) { if (second.code === 'provider_unauthorized') await this.reject(uid, provider, id, access.row); throw second; } }
  }
  async resources(uid, provider, id, cursor = null) {
    if (cursor !== null && (typeof cursor !== 'string' || cursor.length > 2000 || /[\u0000-\u0020\u007f]/.test(cursor))) fail('invalid_cursor', 'The destination pagination cursor was invalid.');
    const access = await this.access(uid, provider, id);
    if (provider === 'pinterest') {
      const { data: account, access: fresh } = await this.authorized(uid, provider, id, 'https://api.pinterest.com/v5/user_account', {}, access);
      if (!numericId(account.id) || await accountKey(provider, account.id) !== fresh.row.account_key) fail('oauth_identity_required', 'The Pinterest identity changed. Reconnect it.', { status: 409 });
      const url = new URL('https://api.pinterest.com/v5/boards'); url.searchParams.set('page_size','100'); url.searchParams.set('privacy','PUBLIC'); if (cursor) url.searchParams.set('bookmark', cursor);
      const { data } = await this.authorized(uid, provider, id, url.href, {}, fresh);
      return { provider, items: (Array.isArray(data.items) ? data.items : []).filter(b => numericId(b.id) && b.privacy === 'PUBLIC' && typeof b.owner?.username === 'string' && b.owner.username.toLowerCase() === String(account.username).toLowerCase()).map(b => ({ id: b.id, name: name(b.name,b.id) })), nextCursor: typeof data.bookmark === 'string' && data.bookmark.length <= 2000 ? data.bookmark : null };
    }
    const url = new URL('https://www.googleapis.com/blogger/v3/users/self/blogs'); url.searchParams.set('role','ADMIN'); url.searchParams.set('status','LIVE'); if (cursor) url.searchParams.set('pageToken',cursor);
    const { data } = await this.authorized(uid, provider, id, url.href, {}, access), items = [];
    for (const b of Array.isArray(data.items) ? data.items : []) { try { if (numericId(b.id)) items.push({ id: b.id, name: name(b.name,b.id), url: secureBlogURL(b.url) }); } catch {} }
    return { provider, items, nextCursor: typeof data.nextPageToken === 'string' && data.nextPageToken.length <= 2000 ? data.nextPageToken : null };
  }
  async destination(uid, provider, id, destination, access = null) {
    if (!numericId(destination)) fail('invalid_destination', 'Select one of your owned publishing destinations.');
    if (provider === 'pinterest') {
      const { data: account, access: current } = await this.authorized(uid, provider, id, 'https://api.pinterest.com/v5/user_account', {}, access), { data: board, access: fresh } = await this.authorized(uid, provider, id, `https://api.pinterest.com/v5/boards/${destination}`, {}, current);
      if (!numericId(account.id) || await accountKey(provider, account.id) !== fresh.row.account_key || board.id !== destination || board.privacy !== 'PUBLIC' || typeof board.owner?.username !== 'string' || board.owner.username.toLowerCase() !== String(account.username).toLowerCase()) fail('destination_not_owned', 'Choose a public board owned by this connected Pinterest account.', { status: 403 });
      return { id: board.id, name: name(board.name,board.id), access: fresh };
    }
    const { data, access: fresh } = await this.authorized(uid, provider, id, `https://www.googleapis.com/blogger/v3/users/self/blogs/${destination}`, {}, access);
    if (data?.blog?.id !== destination || data.blog_user_info?.hasAdminAccess !== true) fail('destination_not_owned', 'Choose a live blog for which this connected account has administrator access.', { status: 403 });
    return { id: destination, name: name(data.blog.name,destination), url: secureBlogURL(data.blog.url), access: fresh };
  }
  async disconnect(uid, provider, id = provider) {
    const root = await ownerPath(uid), path = await connPath(uid, provider, id);
    const removed = await this.db.transaction(async tx => { const [saved, accounts] = await Promise.all([tx.get(path), this.linked(tx, uid)]), row = saved || emptyConnection(uid,provider,id); if (row.user_id !== uid || row.provider !== provider) fail('invalid_connection','This connection belongs to a different service.',{ status:403 }); const pause = await this.pause(tx, accounts, provider,id,{clear:true}); tx.set(path,{...emptyConnection(uid,provider,id),created_at:row.created_at,revision:row.revision+1,token_version:row.token_version+1,revocation_status:provider==='pinterest'?'manual_required':'unconfirmed'}); tx.delete(await attemptPath(uid,provider)); tx.delete(root+'/oauthAttempts/'+provider); pause(); return row; });
    let revocation = provider === 'pinterest' ? 'manual_required' : 'unconfirmed';
    if (provider === 'blogger' && removed.encrypted_tokens) try { const secret = await open(this.env, tokenAudience(uid,provider,id),removed.encrypted_tokens); await this.http.request('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:secret.refreshToken}).toString(),expected:[200],emptyOK:true}); revocation='revoked'; } catch {}
    await this.db.transaction(async tx => { const row=await tx.get(path); if(row?.status==='disconnected'&&row.revision===removed.revision+1) tx.set(path,{...row,revocation_status:revocation}); });
    return { provider, revocation, message: provider === 'pinterest' ? 'Saved tokens deleted and future publishing stopped. Also remove PinCraft in Pinterest Settings → Security and logins → Apps to revoke provider access. An already-sent request may finish.' : revocation === 'revoked' ? 'Saved tokens deleted. Google confirmed authorization revocation. An already-sent request may finish.' : 'Saved tokens deleted. Google revocation was not confirmed; remove PinCraft in Google Account permissions to revoke remote access. An already-sent request may finish.' };
  }
}
export function secureBlogURL(value) { let url; try { url = new URL(value); if(url.protocol==='http:')url.protocol='https:'; } catch { fail('invalid_destination','Blogger did not return a valid public blog URL.'); } return publicHttps(url.href).href; }
