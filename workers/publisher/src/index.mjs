import { FirestoreStore } from './firestore.mjs';
import { ProviderHTTP } from './http.mjs';
import { OAuth } from './oauth.mjs';
import { PublishingJobs } from './jobs.mjs';
import { PublishError, fail, json, verifyBridge, readBounded, oauthCookie, validId, connectionId, digest } from './security.mjs';
export function runtime(env, upstream = fetch, database = null) {
  let calls=0;
  const send=async (...args)=>{if(++calls>46)fail('invocation_budget','This publishing step reached its safe request budget. Its saved checkpoint will be inspected before continuing.',{status:503,retryable:true});return upstream(...args);};
  const db=database||new FirestoreStore(env,send),http=new ProviderHTTP(send,env.PUBLIC_IMAGE_HOSTS||''),oauth=new OAuth(env,db,http),jobs=new PublishingJobs(env,db,http,oauth);
  return {db,http,oauth,jobs,get subrequests(){return calls;}};
}
async function consumeRequest(db,claims) {
  const path='publisher_request_nonces/'+claims.jti,ownerHash=await digest(claims.uid);
  await db.transaction(async tx=>{if(await tx.get(path))fail('request_replayed','This signed publishing request was already received. Reload the saved job rather than resending it.',{status:409});tx.set(path,{ownerHash,expiresAtUTC:new Date(claims.exp+30000)});});
}
async function cleanup(db) {
  const rows=await db.list('','publisher_request_nonces',{field:'expiresAtUTC',op:'LESS_THAN_OR_EQUAL',value:new Date(),order:'expiresAtUTC',limit:5});if(rows.length)await db.transaction(async tx=>{for(const row of rows)tx.delete(row.path);});
}
const callbackResult = error => ({oauth_state_invalid:'expired',oauth_changed:'expired',publisher_setup_required:'setup_required',subscription_required:'subscription_required',connection_exists:'connection_exists'}[error.code]||'authorization_failed');
export async function handle(request,env,context={},overrides={}) {
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/health')return json({service:'PinCraft reviewed publisher',ok:true,cron:'*/10 * * * *'});
  if(!['GET','POST'].includes(request.method)||!url.pathname.startsWith('/v1/'))return json({error:'Publishing endpoint not found.',code:'not_found'},404);
  let raw='';
  try {
    raw=new TextDecoder('utf-8',{fatal:true}).decode(await readBounded(request,145000));
    if(request.method==='GET'&&raw)fail('invalid_request','GET requests cannot include publishing content.');
    const claims=await verifyBridge(request,env,raw),{uid}=claims,r=overrides.runtime||runtime(env),path=url.pathname.slice(4),parts=path.split('/');
    const callback=parts.length===2&&parts[0]==='callbacks'&&['pinterest','blogger'].includes(parts[1]);
    if(callback&&request.method==='GET'){
      const provider=parts[1];let result='authorization_failed';try{await consumeRequest(r.db,claims);result=(await r.oauth.callback(uid,provider,url.searchParams,request.headers.get('x-pincraft-oauth-browser')||'')).result;}catch(error){result=callbackResult(error);}
      return json({redirectPath:`/connector?integration=${provider}&result=${result}#connections`,result},200,{'Set-Cookie':oauthCookie(provider,'')});
    }
    if(path==='status'&&request.method==='GET')return json(await r.jobs.status(uid));
    if(path==='jobs'&&request.method==='GET')return json(await r.jobs.list(uid));
    if(parts.length===3&&parts[0]==='connections'&&['pinterest','blogger'].includes(parts[1])&&parts[2]==='resources'&&request.method==='GET'){
      const id=url.searchParams.get('connectionId')||parts[1];if(!connectionId(id))fail('invalid_connection','Choose your own connected account.');return json(await r.oauth.resources(uid,parts[1],id,url.searchParams.get('cursor')));
    }
    if(request.method!=='POST')fail('not_found','Publishing endpoint not found.',{status:404});
    if(!request.headers.get('content-type')?.startsWith('application/json'))fail('invalid_format','Send a JSON publishing request.',{status:415});
    let body;try{body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();}catch{fail('invalid_request','Send valid publishing settings.');}
    const route=path==='jobs'||path==='websites'||path==='images/inspect'||parts.length===3&&parts[0]==='connections'&&['pinterest','blogger'].includes(parts[1])&&['start','disconnect'].includes(parts[2])||parts.length===3&&parts[0]==='jobs'&&validId(parts[1])&&['process','retry','review'].includes(parts[2]);
    if(!route)fail('not_found','Publishing endpoint not found.',{status:404});
    await consumeRequest(r.db,claims);
    if(path==='jobs')return json(await r.jobs.create(uid,body),201);
    if(path==='websites')return json(await r.jobs.website(uid,body));
    if(path==='images/inspect'){if(Object.keys(body).some(k=>k!=='url'))fail('invalid_request','Send only the existing public image URL.');return json(await r.http.pinImage(body.url,{encode:false}));}
    if(parts[0]==='connections'){
      const provider=parts[1];
      if(parts[2]==='start'){const result=await r.oauth.start(uid,provider,body);return json({authorizationUrl:result.authorizationUrl},200,{'Set-Cookie':oauthCookie(provider,result.browser)});}
      if(Object.keys(body).some(k=>!['connectionId','confirm'].includes(k))||body.confirm!==true||!connectionId(body.connectionId||provider))fail('confirmation_required','Confirm which of your connections to disconnect.');
      return json(await r.oauth.disconnect(uid,provider,body.connectionId||provider));
    }
    if(parts[2]==='process'){if(Object.keys(body).length)fail('invalid_request','Saved content cannot be replaced while publishing.');return json(await r.jobs.process(parts[1],uid));}
    if(parts[2]==='retry')return json(await r.jobs.retry(uid,parts[1],body));
    return json(await r.jobs.review(uid,parts[1],body));
  } catch(error) {
    // Never log request URLs, upstream bodies, credentials or thrown objects.
    const known=error instanceof PublishError;return json({error:known?error.message:'Publishing is temporarily unavailable. No success was assumed.',code:known?error.code:'publisher_unavailable',...(known&&error.upstreamStatus?{upstreamStatus:error.upstreamStatus}:{})},known?error.status:503);
  }
}
export default {
  fetch:handle,
  async scheduled(controller,env,ctx){
    const run=async()=>{const r=runtime(env);try{const result=await r.jobs.tick();if(!result)await cleanup(r.db);}catch{try{await r.db.set('publisher_system/heartbeat',{lastSeenAt:new Date(),outcome:'error',dueProcessed:0});}catch{} }};
    ctx.waitUntil(run());
  }
};
