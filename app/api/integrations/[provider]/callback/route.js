import { NextResponse } from 'next/server';
import { sessionUser,json } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { imageOrigin } from '@/lib/automation/images.mjs';
import { oauthCookieName,validProvider } from '@/lib/automation/oauth-config.mjs';
import { consumeOAuth,saveOAuthGrant } from '@/lib/automation/oauth-store.mjs';
import { exchangeOAuthCode } from '@/lib/automation/oauth-tokens.mjs';
import { readOAuthIdentity } from '@/lib/automation/oauth-resources.mjs';
import { integrationReady,oauthCookie,oauthHeaders } from '@/lib/automation/oauth-api';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=45;
export async function GET(request,{params}){
  const {provider}=await params;
  if(!validProvider(provider))return json({error:'Unknown OAuth provider.'},404);
  let result='authorization_failed';
  try{
    const user=await sessionUser(request);await integrationReady(provider);
    const query=new URL(request.url).searchParams;
    if(query.getAll('state').length!==1||query.getAll('code').length>1)throw new Error('Invalid callback');
    const attempt=await consumeOAuth(getDatabase(),user.id,provider,query.get('state'),request.cookies.get(oauthCookieName(provider))?.value);
    if(query.has('error'))result='denied';
    else{const grant=await exchangeOAuthCode(provider,query.get('code'),attempt.verifier);grant.identity=await readOAuthIdentity(provider,grant.accessToken);await saveOAuthGrant(getDatabase(),user.id,provider,grant,attempt.connection_revision,attempt.connection_id||provider);result='connected';}
  }catch(error){
    if(error.code==='sign_in_required')result='sign_in_required';
    else if(error.code==='oauth_state_invalid'||error.code==='oauth_changed')result='expired';
    else if(error.code==='oauth_setup_required')result='setup_required';
    else if(error.code==='subscription_required')result='subscription_required';
    else if(error.code==='connection_exists')result='connection_exists';
    // Do not log request URLs, authorization codes, provider responses or errors.
  }
  const target=new URL('/connector',imageOrigin()||request.url);target.searchParams.set('integration',provider);target.searchParams.set('result',result);target.hash='connections';
  return oauthCookie(NextResponse.redirect(target, {status:303,headers:oauthHeaders}),request,provider,'');
}
