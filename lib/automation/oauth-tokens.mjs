import 'server-only';
import { randomUUID } from 'node:crypto';
import { AutomationError } from './errors.mjs';
import { requestData } from './http.mjs';
import { decryptCredentials,encryptCredentials } from './vault.mjs';
import { BLOGGER_SCOPE,PINTEREST_SCOPES,requireOAuthConfig,revocationLink,tokenAudience,validProvider } from './oauth-config.mjs';
import { removeOAuthLocally } from './oauth-store.mjs';

const token=(value)=>typeof value==='string'&&value.length>=1&&value.length<=10000&&!/[\u0000-\u0020\u007f]/.test(value);
const expiry=(value,now)=>Number.isFinite(Number(value))&&Number(value)>0&&Number(value)<=366*86400?new Date(now+Number(value)*1000):null;
const refreshExpiry=(data,now)=>expiry(data.refresh_token_expires_in,now)||(Number.isFinite(Number(data.refresh_token_expires_at))&&Number(data.refresh_token_expires_at)>now/1000?new Date(Number(data.refresh_token_expires_at)*1000):null);
function parseGrant(provider,data,{previous=null,initial=false,now=Date.now()}={}){
  if(!data||!token(data.access_token)||String(data.token_type||'').toLowerCase()!=='bearer')throw new AutomationError('oauth_invalid_response','The provider did not confirm a valid OAuth access token. Reconnect your account.');
  const expiresAt=expiry(data.expires_in,now);
  if(!expiresAt)throw new AutomationError('oauth_invalid_response','The provider did not confirm access-token expiry. Reconnect your account.');
  const required=provider==='pinterest'?PINTEREST_SCOPES:[BLOGGER_SCOPE];
  const scopes=typeof data.scope==='string'?data.scope.split(/[ ,]+/).filter(Boolean):initial?[]:required;
  if(required.some(s=>!scopes.includes(s)))throw new AutomationError('oauth_scope_missing','Required publishing permissions were not granted. Connect again and allow the requested permissions.');
  const refreshToken=token(data.refresh_token)?data.refresh_token:previous?.refreshToken;
  if(!refreshToken)throw new AutomationError('oauth_offline_required','The provider did not issue an offline refresh token. Connect again and allow offline access.');
  return {accessToken:data.access_token,refreshToken,expiresAt,refreshExpiresAt:refreshExpiry(data,now)||previous?.refreshExpiresAt||null,scopes:required};
}
async function tokenRequest(provider,fields,send){
  const c=requireOAuthConfig(provider);
  return send(provider==='pinterest'?'https://api.pinterest.com/v5/oauth/token':'https://oauth2.googleapis.com/token',{
    provider:provider==='pinterest'?'Pinterest OAuth':'Blogger OAuth',oauth:true,method:'POST',timeout:15000,
    headers:{'Content-Type':'application/x-www-form-urlencoded',...(provider==='pinterest'?{Authorization:`Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`}:{})},
    body:new URLSearchParams({...fields,...(provider==='pinterest'?{}:{client_id:c.clientId,client_secret:c.clientSecret})}).toString(),
  });
}
export async function exchangeOAuthCode(provider,code,verifier=null,send=requestData){
  if(typeof code!=='string'||!code||code.length>6000||/[\u0000-\u0020\u007f]/.test(code))throw new AutomationError('oauth_code_invalid','The authorization response was not valid. Connect again.');
  const c=requireOAuthConfig(provider);
  const data=await tokenRequest(provider,{grant_type:'authorization_code',code,redirect_uri:c.redirectUri,...(provider==='blogger'?{code_verifier:verifier||''}:{continuous_refresh:'true'})},send);
  return parseGrant(provider,data,{initial:true});
}
async function rejectRefresh(database,userId,provider,row,message){
  // Lock ordering is always settings -> connection, matching disconnect/save.
  // The row-version predicate prevents an old worker invalidating a new grant.
  const client=await database.connect();
  try{
    await client.query('BEGIN');
    await client.query('SELECT user_id FROM pincraft_auto_settings WHERE user_id=$1 FOR UPDATE',[userId]);
    const result=await client.query("UPDATE pincraft_oauth_connections SET status='reconnect_required',last_error=$5,refresh_lease=NULL,refresh_lease_until=NULL,updated_at=now() WHERE user_id=$1 AND provider=$2 AND revision=$3 AND token_version=$4 AND status='connected' RETURNING user_id",[userId,provider,row.revision,row.token_version,message]);
    if(result.rowCount)await client.query('UPDATE pincraft_auto_settings SET enabled=false,last_error=$2 WHERE user_id=$1',[userId,message]);
    await client.query('COMMIT');
  }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
}
export async function getAccessToken(database,userId,provider,{send=requestData,force=false}={}){
  if(!validProvider(provider))throw new AutomationError('invalid_provider','Choose Pinterest or Blogger.');
  requireOAuthConfig(provider);
  let row=(await database.query('SELECT * FROM pincraft_oauth_connections WHERE user_id=$1 AND provider=$2',[userId,provider])).rows[0];
  if(!row||row.status!=='connected'||!row.encrypted_tokens)throw new AutomationError('oauth_reconnect_required',`Connect ${provider==='pinterest'?'Pinterest':'Blogger'} using its own consent page before publishing.`,{status:409});
  const secret=decryptCredentials(tokenAudience(userId,provider),row.encrypted_tokens);
  const now=Date.now();
  if(row.refresh_expires_at&&new Date(row.refresh_expires_at).getTime()<=now){
    await rejectRefresh(database,userId,provider,row,'Offline authorization expired. Reconnect the affected provider.');
    throw new AutomationError('oauth_reconnect_required','Offline authorization expired. Reconnect the affected provider.',{status:409});
  }
  if(provider==='pinterest'&&!force&&token(secret.accessToken)&&new Date(row.expires_at).getTime()>now+5*60000&&(!row.refresh_expires_at||new Date(row.refresh_expires_at).getTime()>now+7*86400000))return {accessToken:secret.accessToken,revision:row.revision,tokenVersion:row.token_version};
  const lease=randomUUID();
  const leased=await database.query("UPDATE pincraft_oauth_connections SET refresh_lease=$5,refresh_lease_until=now()+interval '90 seconds' WHERE user_id=$1 AND provider=$2 AND status='connected' AND revision=$3 AND token_version=$4 AND (refresh_lease_until IS NULL OR refresh_lease_until<=now()) RETURNING *",[userId,provider,row.revision,row.token_version,lease]);
  if(!leased.rowCount)throw new AutomationError('oauth_refresh_busy','This account is already refreshing or its authorization changed. Try again shortly.',{status:409,retryable:true});
  row=leased.rows[0];
  try{
    const data=await tokenRequest(provider,{grant_type:'refresh_token',refresh_token:secret.refreshToken,...(provider==='pinterest'?{continuous_refresh:'true'}:{})},send);
    const grant=parseGrant(provider,data,{previous:{...secret,refreshExpiresAt:row.refresh_expires_at}});
    const persistent=provider==='blogger'?{refreshToken:grant.refreshToken}:{accessToken:grant.accessToken,refreshToken:grant.refreshToken};
    const saved=await database.query("UPDATE pincraft_oauth_connections SET encrypted_tokens=$6,expires_at=$7,refresh_expires_at=$8,token_version=token_version+1,refresh_lease=NULL,refresh_lease_until=NULL,last_refreshed_at=now(),last_error=NULL,updated_at=now() WHERE user_id=$1 AND provider=$2 AND revision=$3 AND token_version=$4 AND refresh_lease=$5 AND status='connected' RETURNING revision,token_version",[userId,provider,row.revision,row.token_version,lease,encryptCredentials(tokenAudience(userId,provider),persistent),provider==='pinterest'?grant.expiresAt:null,grant.refreshExpiresAt]);
    if(!saved.rowCount)throw new AutomationError('oauth_changed','Authorization was disconnected or replaced while refreshing. No credentials were restored.',{status:409});
    return {accessToken:grant.accessToken,revision:row.revision,tokenVersion:saved.rows[0].token_version};
  }catch(error){
    const reconnect=['oauth_grant_rejected','provider_auth','oauth_invalid_response','oauth_scope_missing','oauth_offline_required'].includes(error.code)||(provider==='pinterest'&&error.code==='provider_unavailable');
    if(reconnect)await rejectRefresh(database,userId,provider,row,'Offline authorization could not be renewed. Reconnect the affected provider.');
    else await database.query('UPDATE pincraft_oauth_connections SET refresh_lease=NULL,refresh_lease_until=NULL WHERE user_id=$1 AND provider=$2 AND refresh_lease=$3',[userId,provider,lease]);
    throw reconnect?new AutomationError('oauth_reconnect_required','Offline authorization could not be renewed. Reconnect the affected provider.',{status:409}):error;
  }
}
export async function maintainPinterestTokens(database,{send=requestData,limit=6}={}){
  const rows=(await database.query("SELECT user_id FROM pincraft_oauth_connections WHERE provider='pinterest' AND status='connected' AND (expires_at<=now()+interval '5 minutes' OR refresh_expires_at<=now()+interval '7 days') AND (refresh_lease_until IS NULL OR refresh_lease_until<=now()) ORDER BY LEAST(expires_at,refresh_expires_at) LIMIT $1",[Math.min(12,Math.max(1,limit))])).rows;
  const results=await Promise.all(rows.map(async({user_id})=>{try{await getAccessToken(database,user_id,'pinterest',{send});return true;}catch{return false;}}));
  await database.query('DELETE FROM pincraft_oauth_attempts WHERE expires_at<=now()');
  return {checked:rows.length,renewed:results.filter(Boolean).length};
}
export async function disconnectProvider(database,userId,provider,send=requestData){
  const removed=await removeOAuthLocally(database,userId,provider);
  let revocation=provider==='pinterest'?'manual_required':'unconfirmed';
  if(provider==='blogger'&&removed.encrypted){
    try{
      const secret=decryptCredentials(tokenAudience(userId,provider),removed.encrypted);
      await send('https://oauth2.googleapis.com/revoke',{provider:'Google authorization revocation',method:'POST',timeout:15000,format:'text',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:secret.refreshToken}).toString()});
      revocation='revoked';
    }catch{/* Local disconnect has ALREADY committed. Never report unconfirmed remote revocation as success. */}
  }
  if(provider==='blogger'&&!removed.encrypted)revocation='unconfirmed';
  await database.query("UPDATE pincraft_oauth_connections SET revocation_status=$4 WHERE user_id=$1 AND provider=$2 AND revision=$3 AND status='disconnected'",[userId,provider,removed.revision,revocation]);
  return {provider,revocation,revocationUrl:revocationLink(provider),message:provider==='pinterest'?'Pinterest disconnected locally and saved tokens deleted. Posting has stopped. Personal OAuth grants cannot currently be revoked with Pinterest’s API; remove PinCraft in Pinterest Settings → Security and logins → Apps to revoke provider access.':revocation==='revoked'?'Blogger disconnected. Google confirmed revocation of the saved offline authorization.':'Blogger disconnected locally and saved tokens deleted. Google revocation was not confirmed; remove PinCraft from your Google Account permissions to ensure provider access is revoked.'};
}

export async function invalidateAuthorization(database,userId,provider,access){
  const row=(await database.query("SELECT * FROM pincraft_oauth_connections WHERE user_id=$1 AND provider=$2 AND revision=$3 AND token_version=$4 AND status='connected'",[userId,provider,access.revision,access.tokenVersion])).rows[0];
  if(row)await rejectRefresh(database,userId,provider,row,'The provider rejected publishing authorization. Reconnect and verify the required permissions.');
}
