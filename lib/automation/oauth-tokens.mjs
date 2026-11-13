import 'server-only';
import {randomUUID} from 'node:crypto';
import {transaction} from './db.mjs';
import {AutomationError} from './errors.mjs';
import {requestData} from './http.mjs';
import {decryptCredentials,encryptCredentials} from './vault.mjs';
import {BLOGGER_SCOPE,PINTEREST_SCOPES,requireOAuthConfig,revocationLink,tokenAudience,validProvider} from './oauth-config.mjs';
import {removeOAuthLocally} from './oauth-store.mjs';
import {connectionRef,data,ms,readAccount,writeAccount,maintenanceAt} from './firestore.mjs';
const token=value=>typeof value==='string'&&value.length>=1&&value.length<=10000&&!/[\u0000-\u0020\u007f]/.test(value);
const expiry=(value,now)=>Number.isFinite(Number(value))&&Number(value)>0&&Number(value)<=366*86400?new Date(now+Number(value)*1000):null;
const refreshExpiry=(response,now)=>expiry(response.refresh_token_expires_in,now)||(Number.isFinite(Number(response.refresh_token_expires_at))&&Number(response.refresh_token_expires_at)>now/1000?new Date(Number(response.refresh_token_expires_at)*1000):null);
function parseGrant(provider,response,{previous=null,initial=false,now=Date.now()}={}){
  if(!response||!token(response.access_token)||String(response.token_type||'').toLowerCase()!=='bearer')throw new AutomationError('oauth_invalid_response','The provider did not confirm a valid OAuth access token. Reconnect your account.');
  const expiresAt=expiry(response.expires_in,now);if(!expiresAt)throw new AutomationError('oauth_invalid_response','The provider did not confirm access-token expiry. Reconnect your account.');
  const required=provider==='pinterest'?PINTEREST_SCOPES:[BLOGGER_SCOPE],scopes=typeof response.scope==='string'?response.scope.split(/[ ,]+/).filter(Boolean):initial?[]:required;
  if(required.some(scope=>!scopes.includes(scope)))throw new AutomationError('oauth_scope_missing','Required publishing permissions were not granted. Connect again and allow the requested permissions.');
  const refreshToken=token(response.refresh_token)?response.refresh_token:previous?.refreshToken;
  if(!refreshToken)throw new AutomationError('oauth_offline_required','The provider did not issue an offline refresh token. Connect again and allow offline access.');
  return {accessToken:response.access_token,refreshToken,expiresAt,refreshExpiresAt:refreshExpiry(response,now)||previous?.refreshExpiresAt||null,scopes:required};
}
async function tokenRequest(provider,fields,send){
  const config=requireOAuthConfig(provider);
  return send(provider==='pinterest'?'https://api.pinterest.com/v5/oauth/token':'https://oauth2.googleapis.com/token',{provider:provider==='pinterest'?'Pinterest OAuth':'Blogger OAuth',oauth:true,method:'POST',timeout:15000,headers:{'Content-Type':'application/x-www-form-urlencoded',...(provider==='pinterest'?{Authorization:`Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`}:{})},body:new URLSearchParams({...fields,...(provider==='pinterest'?{}:{client_id:config.clientId,client_secret:config.clientSecret})}).toString()});
}
export async function exchangeOAuthCode(provider,code,verifier=null,send=requestData){
  if(typeof code!=='string'||!code||code.length>6000||/[\u0000-\u0020\u007f]/.test(code))throw new AutomationError('oauth_code_invalid','The authorization response was not valid. Connect again.');
  const config=requireOAuthConfig(provider),response=await tokenRequest(provider,{grant_type:'authorization_code',code,redirect_uri:config.redirectUri,...(provider==='blogger'?{code_verifier:verifier||''}:{continuous_refresh:'true'})},send);return parseGrant(provider,response,{initial:true});
}
async function rejectRefresh(db,userId,provider,previous,message){
  await transaction(db,async tx=>{
    const s=await readAccount(tx,db,userId),ref=connectionRef(db,userId,provider),row=data(await tx.get(ref));
    if(!row||row.status!=='connected'||row.revision!==previous.revision||row.token_version!==previous.token_version)return;
    tx.set(ref,{...row,status:'reconnect_required',last_error:message,maintenance_at:null,refresh_lease:null,refresh_lease_until:null,updated_at:new Date()});s.enabled=false;s.last_error=message;writeAccount(tx,db,s);
  });
}
export async function getAccessToken(db,userId,provider,{send=requestData,force=false}={}){
  if(!validProvider(provider))throw new AutomationError('invalid_provider','Choose Pinterest or Blogger.');requireOAuthConfig(provider);
  const ref=connectionRef(db,userId,provider);let row=data(await ref.get());
  if(!row||row.user_id!==userId||row.provider!==provider||row.status!=='connected'||!row.encrypted_tokens)throw new AutomationError('oauth_reconnect_required',`Connect ${provider==='pinterest'?'Pinterest':'Blogger'} using its own consent page before publishing.`,{status:409});
  const secret=decryptCredentials(tokenAudience(userId,provider),row.encrypted_tokens),now=Date.now();
  if(row.refresh_expires_at&&ms(row.refresh_expires_at)<=now){await rejectRefresh(db,userId,provider,row,'Offline authorization expired. Reconnect the affected provider.');throw new AutomationError('oauth_reconnect_required','Offline authorization expired. Reconnect the affected provider.',{status:409});}
  if(provider==='pinterest'&&!force&&token(secret.accessToken)&&ms(row.expires_at)>now+5*60000&&(!row.refresh_expires_at||ms(row.refresh_expires_at)>now+7*86400000))return {accessToken:secret.accessToken,revision:row.revision,tokenVersion:row.token_version};
  const lease=randomUUID(),previous=row;
  row=await transaction(db,async tx=>{
    const current=data(await tx.get(ref));if(!current||current.status!=='connected'||current.revision!==previous.revision||current.token_version!==previous.token_version||ms(current.refresh_lease_until)>Date.now())throw new AutomationError('oauth_refresh_busy','This account is already refreshing or its authorization changed. Try again shortly.',{status:409,retryable:true});
    const leased={...current,refresh_lease:lease,refresh_lease_until:new Date(Date.now()+90000)};tx.set(ref,leased);return leased;
  });
  try{
    const response=await tokenRequest(provider,{grant_type:'refresh_token',refresh_token:secret.refreshToken,...(provider==='pinterest'?{continuous_refresh:'true'}:{})},send);
    const grant=parseGrant(provider,response,{previous:{...secret,refreshExpiresAt:row.refresh_expires_at}}),persistent=provider==='blogger'?{refreshToken:grant.refreshToken}:{accessToken:grant.accessToken,refreshToken:grant.refreshToken};
    const encrypted=encryptCredentials(tokenAudience(userId,provider),persistent),expires=provider==='pinterest'?grant.expiresAt:null;
    const saved=await transaction(db,async tx=>{
      const current=data(await tx.get(ref));
      if(!current||current.status!=='connected'||current.revision!==row.revision||current.token_version!==row.token_version||current.refresh_lease!==lease)throw new AutomationError('oauth_changed','Authorization was disconnected or replaced while refreshing. No credentials were restored.',{status:409});
      const updated={...current,encrypted_tokens:encrypted,expires_at:expires,refresh_expires_at:grant.refreshExpiresAt,maintenance_at:maintenanceAt(provider,expires,grant.refreshExpiresAt),token_version:current.token_version+1,refresh_lease:null,refresh_lease_until:null,last_refreshed_at:new Date(),last_error:null,updated_at:new Date()};tx.set(ref,updated);return updated;
    });return {accessToken:grant.accessToken,revision:saved.revision,tokenVersion:saved.token_version};
  }catch(error){
    const reconnect=['oauth_grant_rejected','provider_auth','oauth_invalid_response','oauth_scope_missing','oauth_offline_required'].includes(error.code)||(provider==='pinterest'&&error.code==='provider_unavailable');
    if(reconnect)await rejectRefresh(db,userId,provider,row,'Offline authorization could not be renewed. Reconnect the affected provider.');
    else await transaction(db,async tx=>{const current=data(await tx.get(ref));if(current?.refresh_lease===lease)tx.update(ref,{refresh_lease:null,refresh_lease_until:null});});
    throw reconnect?new AutomationError('oauth_reconnect_required','Offline authorization could not be renewed. Reconnect the affected provider.',{status:409}):error;
  }
}
export async function maintainPinterestTokens(db,{send=requestData,limit=12}={}){
  const candidates=await db.collectionGroup('connections').where('provider','==','pinterest').where('status','==','connected').where('maintenance_at','<=',new Date()).orderBy('maintenance_at').limit(Math.min(30,Math.max(1,limit))).get();
  const results=await Promise.all(candidates.docs.map(async snapshot=>{const row=data(snapshot);try{await getAccessToken(db,row.user_id,'pinterest',{send});return true;}catch{return false;}}));
  const expired=await db.collectionGroup('oauthAttempts').where('expires_at','<=',new Date()).limit(20).get();
  for(const snapshot of expired.docs)await transaction(db,async tx=>{const current=data(await tx.get(snapshot.ref));if(current&&ms(current.expires_at)<=Date.now())tx.delete(snapshot.ref);});
  return {checked:candidates.size,renewed:results.filter(Boolean).length};
}
export async function disconnectProvider(db,userId,provider,send=requestData){
  const removed=await removeOAuthLocally(db,userId,provider);let revocation=provider==='pinterest'?'manual_required':'unconfirmed';
  if(provider==='blogger'&&removed.encrypted){try{const secret=decryptCredentials(tokenAudience(userId,provider),removed.encrypted);await send('https://oauth2.googleapis.com/revoke',{provider:'Google authorization revocation',method:'POST',timeout:15000,format:'text',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:secret.refreshToken}).toString()});revocation='revoked';}catch{/* Local deletion has committed. Never invent remote revocation success. */}}
  await transaction(db,async tx=>{const ref=connectionRef(db,userId,provider),row=data(await tx.get(ref));if(row&&row.revision===removed.revision&&row.status==='disconnected')tx.update(ref,{revocation_status:revocation});});
  return {provider,revocation,revocationUrl:revocationLink(provider),message:provider==='pinterest'?'Pinterest disconnected locally and saved tokens deleted. Posting has stopped. Personal OAuth grants cannot currently be revoked with Pinterest’s API; remove PinCraft in Pinterest Settings → Security and logins → Apps to revoke provider access.':revocation==='revoked'?'Blogger disconnected. Google confirmed revocation of the saved offline authorization.':'Blogger disconnected locally and saved tokens deleted. Google revocation was not confirmed; remove PinCraft from your Google Account permissions to ensure provider access is revoked.'};
}
export async function invalidateAuthorization(db,userId,provider,access){
  const row=data(await connectionRef(db,userId,provider).get());if(row&&row.revision===access.revision&&row.token_version===access.tokenVersion&&row.status==='connected')await rejectRefresh(db,userId,provider,row,'The provider rejected publishing authorization. Reconnect and verify the required permissions.');
}
