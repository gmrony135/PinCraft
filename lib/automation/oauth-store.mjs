import 'server-only';
import {randomBytes} from 'node:crypto';
import {transaction} from './db.mjs';
import {AutomationError} from './errors.mjs';
import {encryptCredentials,decryptCredentials} from './vault.mjs';
import {addLog,ensureSettings} from './repository.mjs';
import {authorizationURL,digest,OAUTH_TTL_SECONDS,tokenAudience,validProvider} from './oauth-config.mjs';
import {accountRef,connectionRef,attemptRef,jobRef,data,ms,readAccount,writeAccount,maintenanceAt} from './firestore.mjs';
export const attemptAudience=(userId,provider,stateHash)=>`oauth-attempt:v1:${provider}:${userId}:${stateHash}`;
const checkProvider=p=>{if(!validProvider(p))throw new AutomationError('invalid_provider','Choose Pinterest or Blogger.');};
export function emptyConnection(userId,provider){return {user_id:userId,provider,encrypted_tokens:null,status:'disconnected',scopes:[],expires_at:null,refresh_expires_at:null,maintenance_at:null,revision:1,token_version:1,refresh_lease:null,refresh_lease_until:null,last_refreshed_at:null,last_error:null,revocation_status:'not_requested',created_at:new Date(),updated_at:new Date()};}
export async function startOAuth(db,userId,provider){
  checkProvider(provider);await ensureSettings(db,userId);
  const state=randomBytes(32).toString('base64url'),browser=randomBytes(32).toString('base64url'),verifier=provider==='blogger'?randomBytes(48).toString('base64url'):null,stateHash=digest(state);
  const authorizationUrl=authorizationURL(provider,state,verifier?Buffer.from(digest(verifier),'hex').toString('base64url'):null);
  await transaction(db,async tx=>{
    const s=await readAccount(tx,db,userId),[attempt,connection,job]=await Promise.all([tx.get(attemptRef(db,userId,provider)),tx.get(connectionRef(db,userId,provider)),s.active_job_id?tx.get(jobRef(db,s.active_job_id)):null]);
    const active=data(job),old=data(attempt),row=data(connection)||emptyConnection(userId,provider);
    if(active&&ms(active.lease_until)>Date.now())throw new AutomationError('worker_busy','Pause Auto Mode and let its in-flight request finish before authorizing a different account.',{status:409});
    if(old&&ms(old.created_at)>Date.now()-30000)throw new AutomationError('rate_limited','Wait 30 seconds before starting authorization again.',{status:429});
    if(!connection.exists)tx.create(connection.ref,row);
    tx.set(attemptRef(db,userId,provider),{state_hash:stateHash,user_id:userId,provider,browser_hash:digest(browser),connection_revision:row.revision,pkce_envelope:verifier?encryptCredentials(attemptAudience(userId,provider,stateHash),{verifier}):null,created_at:new Date(),expires_at:new Date(Date.now()+OAUTH_TTL_SECONDS*1000)});
    s.enabled=false;writeAccount(tx,db,s);addLog(db,userId,null,'oauth_started','info',`${provider==='pinterest'?'Pinterest':'Blogger'} authorization started. Auto Mode is paused until destinations are selected again.`,tx);
  });return {authorizationUrl,browser};
}
export async function consumeOAuth(db,userId,provider,state,browser){
  checkProvider(provider);if(!/^[A-Za-z0-9_-]{43}$/.test(state||'')||!/^[A-Za-z0-9_-]{43}$/.test(browser||''))throw new AutomationError('oauth_state_invalid','The authorization request expired or could not be verified.',{status:403});
  const row=await transaction(db,async tx=>{
    const ref=attemptRef(db,userId,provider),saved=data(await tx.get(ref));
    if(!saved||saved.user_id!==userId||saved.provider!==provider||saved.state_hash!==digest(state)||saved.browser_hash!==digest(browser)||ms(saved.expires_at)<=Date.now())throw new AutomationError('oauth_state_invalid','The authorization request expired or has already been used.',{status:403});
    tx.delete(ref);return saved;
  });return {...row,verifier:row.pkce_envelope?decryptCredentials(attemptAudience(userId,provider,row.state_hash),row.pkce_envelope).verifier:null};
}
const clearTarget=(s,provider)=>{if(provider==='pinterest'){s.pinterest_board_id=null;s.pinterest_board_name=null;}else{s.blogger_blog_id=null;s.blogger_blog_name=null;s.blogger_blog_url=null;}};
export async function saveOAuthGrant(db,userId,provider,grant,expectedRevision){
  checkProvider(provider);
  // Sole persistence allow-list: a Blogger access token can never enter Firestore.
  const secret=provider==='blogger'?{refreshToken:grant.refreshToken}:{accessToken:grant.accessToken,refreshToken:grant.refreshToken};
  if(typeof secret.refreshToken!=='string'||!secret.refreshToken||(provider==='pinterest'&&(!secret.accessToken||!grant.expiresAt)))throw new AutomationError('oauth_offline_required','Offline OAuth permission is required. Reconnect and allow access.');
  const encrypted=encryptCredentials(tokenAudience(userId,provider),secret);
  await transaction(db,async tx=>{
    const s=await readAccount(tx,db,userId),ref=connectionRef(db,userId,provider),row=data(await tx.get(ref));
    if(!row||row.revision!==expectedRevision)throw new AutomationError('oauth_changed','This connection changed during authorization. Start Connect again.',{status:409});
    const expires=provider==='pinterest'?grant.expiresAt:null,refreshExpires=grant.refreshExpiresAt||null;
    tx.set(ref,{...row,encrypted_tokens:encrypted,status:'connected',scopes:grant.scopes,expires_at:expires,refresh_expires_at:refreshExpires,maintenance_at:maintenanceAt(provider,expires,refreshExpires),revision:row.revision+1,token_version:row.token_version+1,refresh_lease:null,refresh_lease_until:null,last_error:null,revocation_status:'not_requested',updated_at:new Date()});
    s.enabled=false;clearTarget(s,provider);s.connection_version++;s.last_error=null;writeAccount(tx,db,s);
    addLog(db,userId,null,'oauth_connected','success',`${provider==='pinterest'?'Pinterest':'Blogger'} confirmed OAuth authorization. Encrypted offline credentials saved in Firestore for this user only; select a destination before enabling the schedule.`,tx);
  });
}
export async function removeOAuthLocally(db,userId,provider){
  checkProvider(provider);await ensureSettings(db,userId);
  return transaction(db,async tx=>{
    const s=await readAccount(tx,db,userId),ref=connectionRef(db,userId,provider),row=data(await tx.get(ref))||emptyConnection(userId,provider),revision=row.revision+1;
    tx.set(ref,{...emptyConnection(userId,provider),revision,token_version:row.token_version+1,revocation_status:provider==='pinterest'?'manual_required':'unconfirmed'});tx.delete(attemptRef(db,userId,provider));
    s.enabled=false;clearTarget(s,provider);s.connection_version++;writeAccount(tx,db,s);
    addLog(db,userId,null,'oauth_disconnected','info',`${provider==='pinterest'?'Pinterest':'Blogger'} disconnected locally. Saved tokens deleted and Auto Mode stopped. A request already sent to the provider may finish.`,tx);
    return {encrypted:row.encrypted_tokens,revision};
  });
}
