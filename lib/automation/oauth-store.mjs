import "server-only";
import { randomBytes } from 'node:crypto';
import { transaction } from './db.mjs';
import { AutomationError } from './errors.mjs';
import { encryptCredentials, decryptCredentials } from './vault.mjs';
import { addLog, ensureSettings } from './repository.mjs';
import { authorizationURL, digest, OAUTH_TTL_SECONDS, tokenAudience, validProvider } from './oauth-config.mjs';

export const attemptAudience=(userId,provider,stateHash)=>`oauth-attempt:v1:${provider}:${userId}:${stateHash}`;
const checkProvider=(provider)=>{if(!validProvider(provider))throw new AutomationError('invalid_provider','Choose Pinterest or Blogger.');};
export async function startOAuth(database,userId,provider){
  checkProvider(provider);
  await ensureSettings(database,userId);
  const state=randomBytes(32).toString('base64url'),browser=randomBytes(32).toString('base64url'),verifier=provider==='blogger'?randomBytes(48).toString('base64url'):null;
  const stateHash=digest(state);
  // Validate app configuration BEFORE pausing anything.
  const authorizationUrl=authorizationURL(provider,state,verifier?Buffer.from(digest(verifier),'hex').toString('base64url'):null);
  await transaction(database,async(client)=>{
    await client.query('SELECT user_id FROM pincraft_auto_settings WHERE user_id=$1 FOR UPDATE',[userId]);
    if((await client.query("SELECT id FROM pincraft_auto_jobs WHERE user_id=$1 AND lease_until>now() LIMIT 1",[userId])).rowCount)throw new AutomationError('worker_busy','Pause Auto Mode and let its in-flight request finish before authorizing a different account.',{status:409});
    if((await client.query("SELECT state_hash FROM pincraft_oauth_attempts WHERE user_id=$1 AND provider=$2 AND created_at>now()-interval '30 seconds'",[userId,provider])).rowCount)throw new AutomationError('rate_limited','Wait 30 seconds before starting authorization again.',{status:429});
    await client.query("DELETE FROM pincraft_oauth_attempts WHERE expires_at<=now() OR (user_id=$1 AND provider=$2)",[userId,provider]);
    await client.query("INSERT INTO pincraft_oauth_connections(user_id,provider,status) VALUES($1,$2,'disconnected') ON CONFLICT DO NOTHING",[userId,provider]);
    const connection=(await client.query('SELECT revision FROM pincraft_oauth_connections WHERE user_id=$1 AND provider=$2 FOR UPDATE',[userId,provider])).rows[0];
    await client.query("INSERT INTO pincraft_oauth_attempts(state_hash,user_id,provider,browser_hash,connection_revision,pkce_envelope,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+($7*interval '1 second'))",[stateHash,userId,provider,digest(browser),connection.revision,verifier?encryptCredentials(attemptAudience(userId,provider,stateHash),{verifier}):null,OAUTH_TTL_SECONDS]);
    await client.query('UPDATE pincraft_auto_settings SET enabled=false,updated_at=now() WHERE user_id=$1',[userId]);
    await addLog(client,userId,null,'oauth_started','info',`${provider==='pinterest'?'Pinterest':'Blogger'} authorization started. Auto Mode is paused until destinations are selected again.`);
  });
  return {authorizationUrl,browser};
}
export async function consumeOAuth(database,userId,provider,state,browser){
  checkProvider(provider);
  if(!/^[A-Za-z0-9_-]{43}$/.test(state||'')||!/^[A-Za-z0-9_-]{43}$/.test(browser||''))throw new AutomationError('oauth_state_invalid','The authorization request expired or could not be verified.',{status:403});
  // Owner, provider, HttpOnly browser nonce, TTL and single use all enforced by
  // the DELETE. An attacker cannot consume another signed-in owner's attempt.
  const row=(await database.query('DELETE FROM pincraft_oauth_attempts WHERE state_hash=$1 AND user_id=$2 AND provider=$3 AND browser_hash=$4 AND expires_at>now() RETURNING *',[digest(state),userId,provider,digest(browser)])).rows[0];
  if(!row)throw new AutomationError('oauth_state_invalid','The authorization request expired or has already been used.',{status:403});
  return {...row,verifier:row.pkce_envelope?decryptCredentials(attemptAudience(userId,provider,row.state_hash),row.pkce_envelope).verifier:null};
}
export async function saveOAuthGrant(database,userId,provider,grant,expectedRevision){
  checkProvider(provider);
  // An allow-list at this sole persistence boundary makes Blogger access-token
  // persistence impossible, even if a future caller accidentally passes one.
  const secret=provider==='blogger'?{refreshToken:grant.refreshToken}:{accessToken:grant.accessToken,refreshToken:grant.refreshToken};
  if(typeof secret.refreshToken!=='string'||!secret.refreshToken||(provider==='pinterest'&&(!secret.accessToken||!grant.expiresAt)))throw new AutomationError('oauth_offline_required','Offline OAuth permission is required. Reconnect and allow access.');
  const encrypted=encryptCredentials(tokenAudience(userId,provider),secret);
  await transaction(database,async(client)=>{
    await client.query('SELECT user_id FROM pincraft_auto_settings WHERE user_id=$1 FOR UPDATE',[userId]);
    const result=await client.query("UPDATE pincraft_oauth_connections SET encrypted_tokens=$3,status='connected',scopes=$4,expires_at=$5,refresh_expires_at=$6,revision=revision+1,token_version=token_version+1,refresh_lease=NULL,refresh_lease_until=NULL,last_error=NULL,revocation_status='not_requested',updated_at=now() WHERE user_id=$1 AND provider=$2 AND revision=$7 RETURNING revision",[userId,provider,encrypted,grant.scopes,provider==='pinterest'?grant.expiresAt:null,grant.refreshExpiresAt||null,expectedRevision]);
    if(!result.rowCount)throw new AutomationError('oauth_changed','This connection changed during authorization. Start Connect again.',{status:409});
    const target=provider==='pinterest'?'pinterest_board_id=NULL,pinterest_board_name=NULL':'blogger_blog_id=NULL,blogger_blog_url=NULL,blogger_blog_name=NULL';
    await client.query(`UPDATE pincraft_auto_settings SET enabled=false,${target},connection_version=connection_version+1,last_error=NULL,updated_at=now() WHERE user_id=$1`,[userId]);
    await addLog(client,userId,null,'oauth_connected','success',`${provider==='pinterest'?'Pinterest':'Blogger'} confirmed OAuth authorization. Encrypted offline credentials saved for this user only; select a destination before enabling the schedule.`);
  });
}
export async function removeOAuthLocally(database,userId,provider){
  checkProvider(provider);await ensureSettings(database,userId);
  return transaction(database,async(client)=>{
    await client.query('SELECT user_id FROM pincraft_auto_settings WHERE user_id=$1 FOR UPDATE',[userId]);
    const row=(await client.query('SELECT * FROM pincraft_oauth_connections WHERE user_id=$1 AND provider=$2 FOR UPDATE',[userId,provider])).rows[0];
    const revocation=provider==='pinterest'?'manual_required':'unconfirmed';
    const updated=(await client.query("INSERT INTO pincraft_oauth_connections(user_id,provider,status,revocation_status) VALUES($1,$2,'disconnected',$3) ON CONFLICT(user_id,provider) DO UPDATE SET encrypted_tokens=NULL,status='disconnected',scopes='{}',expires_at=NULL,refresh_expires_at=NULL,revision=pincraft_oauth_connections.revision+1,token_version=pincraft_oauth_connections.token_version+1,refresh_lease=NULL,refresh_lease_until=NULL,last_error=NULL,revocation_status=$3,updated_at=now() RETURNING revision",[userId,provider,revocation])).rows[0];
    await client.query('DELETE FROM pincraft_oauth_attempts WHERE user_id=$1 AND provider=$2',[userId,provider]);
    const target=provider==='pinterest'?'pinterest_board_id=NULL,pinterest_board_name=NULL':'blogger_blog_id=NULL,blogger_blog_url=NULL,blogger_blog_name=NULL';
    await client.query(`UPDATE pincraft_auto_settings SET enabled=false,${target},connection_version=connection_version+1,updated_at=now() WHERE user_id=$1`,[userId]);
    await addLog(client,userId,null,'oauth_disconnected','info',`${provider==='pinterest'?'Pinterest':'Blogger'} disconnected locally. Saved tokens deleted and Auto Mode stopped. A request already sent to the provider may finish.`);
    return {encrypted:row?.encrypted_tokens||null,revision:updated.revision};
  });
}
