import 'server-only';
import { NextResponse } from 'next/server';
import { apiError, json, readBody, sessionUser } from '@/lib/automation/api';
import { AutomationError } from '@/lib/automation/errors.mjs';
import { bridgeSettings, allowedBridgePath, signBridge } from './bridge-core.mjs';
export const publisherBridgeConfigured = () => bridgeSettings().configured;
const privateHeaders={'Cache-Control':'no-store, private',Vary:'Cookie','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
function canonical(request,settings) {
  const url=new URL(request.url),host=(request.headers.get('x-forwarded-host')||request.headers.get('host')||'').split(',')[0].trim(),proto=(request.headers.get('x-forwarded-proto')||url.protocol.slice(0,-1)).split(',')[0].trim();
  return url.origin===settings.appOrigin||`${proto}://${host}`===settings.appOrigin;
}
function setOAuthCookie(response,provider,value) { response.cookies.set(`pincraft.publish.oauth.${provider}.v1`,value,{httpOnly:true,secure:true,sameSite:'lax',path:`/api/${provider}/callback`,maxAge:value?600:0});return response; }
export async function forwardPublishing(request,path,{callbackProvider=null}={}) {
  const settings=bridgeSettings();
  try {
    const mutation=request.method==='POST';
    const user=await sessionUser(request,mutation);
    if(!settings.configured&&['status','jobs'].includes(path.split('?')[0])&&request.method==='GET')return json({accountId:user.id,configured:false,providers:{pinterest:{configured:false},blogger:{configured:false}},accessTier:'unconfirmed',imageHostConfigured:false,profiles:[],websites:[],jobs:[],cron:{pollMinutes:10,lastSeenAt:null},message:'The reviewed publishing Worker has not been connected. Existing generation and Library saves are unchanged.'});
    if(!settings.configured)throw new AutomationError('publisher_setup_required','Reviewed publishing is not connected to its Worker yet. Existing generation, previews and Library saves are unchanged.',{status:503});
    if(!allowedBridgePath(path))throw new AutomationError('not_found','Publishing endpoint not found.',{status:404});
    if((callbackProvider||/^connections\/(pinterest|blogger)\/start(?:\?|$)/.test(path))&&!canonical(request,settings))throw new AutomationError('oauth_origin_required','Open the canonical website before connecting. Authorization must return to your signed-in HTTPS origin.',{status:409});
    const raw=mutation?JSON.stringify(await readBody(request,145000)):'',target=new URL('/v1/'+path,settings.origin),browser=callbackProvider?(request.cookies.get(`pincraft.publish.oauth.${callbackProvider}.v1`)?.value||''):'';
    const signed=signBridge({uid:user.id,method:request.method,path:target.pathname+target.search,body:raw,browser},settings);
    let upstream;try{upstream=await fetch(target,{method:request.method,headers:{'Content-Type':'application/json','x-pincraft-publish-authorization':signed,...(browser?{'x-pincraft-oauth-browser':browser}:{})},...(mutation?{body:raw}:{}),redirect:'error',signal:AbortSignal.timeout(55000),cache:'no-store'});}catch{throw new AutomationError('publisher_unavailable','The publishing Worker could not confirm this request. Inspect Jobs before resubmitting; a request already sent may finish.',{status:503});}
    if(Number(upstream.headers.get('content-length')||0)>700000)throw new Error('Oversized publisher response');
    const reader=upstream.body?.getReader(),chunks=[];let size=0;
    if(reader)for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>700000){await reader.cancel();throw new Error('Oversized publisher response');}chunks.push(Buffer.from(value));}
    let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new AutomationError('publisher_unavailable','The publishing response could not be confirmed. Inspect Jobs before retrying.',{status:503});}
    if(callbackProvider){const expected=`/connector?integration=${callbackProvider}&result=`,redirect=typeof body.redirectPath==='string'&&body.redirectPath.startsWith(expected)&&/^\/connector\?integration=(pinterest|blogger)&result=[a-z_]+#connections$/.test(body.redirectPath)?body.redirectPath:`/connector?integration=${callbackProvider}&result=authorization_failed#connections`;return setOAuthCookie(NextResponse.redirect(new URL(redirect,settings.appOrigin),{status:303,headers:privateHeaders}),callbackProvider,'');}
    const response=NextResponse.json(body,{status:upstream.status,headers:privateHeaders}),cookie=upstream.headers.get('set-cookie')||'',match=/^pincraft\.publish\.oauth\.(pinterest|blogger)\.v1=([A-Za-z0-9_-]{43});/.exec(cookie);
    if(match&&path.split('?')[0]===`connections/${match[1]}/start`)setOAuthCookie(response,match[1],match[2]);
    return response;
  }catch(error){
    if(callbackProvider){const result=error.code==='sign_in_required'?'sign_in_required':error.code==='publisher_setup_required'?'setup_required':'authorization_failed',origin=settings.appOrigin||'https://pincraftly.vercel.app';return setOAuthCookie(NextResponse.redirect(new URL(`/connector?integration=${callbackProvider}&result=${result}#connections`,origin),{status:303,headers:privateHeaders}),callbackProvider,'');}
    return apiError(error);
  }
}
