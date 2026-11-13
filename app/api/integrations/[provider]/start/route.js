import { NextResponse } from 'next/server';
import { apiError,sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { AutomationError } from '@/lib/automation/errors.mjs';
import { startOAuth } from '@/lib/automation/oauth-store.mjs';
import { canonicalOAuthRequest,integrationReady,oauthCookie,oauthHeaders } from '@/lib/automation/oauth-api';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=30;
export async function POST(request,{params}){
  try{
    const user=await sessionUser(request,true),{provider}=await params;
    await integrationReady(provider);
    if(!canonicalOAuthRequest(request))throw new AutomationError('oauth_origin_required','Open the canonical production website before connecting. OAuth callbacks must return to the same signed-in HTTPS origin.',{status:409});
    const result=await startOAuth(getDatabase(),user.id,provider);
    return oauthCookie(NextResponse.json({authorizationUrl:result.authorizationUrl},{headers:oauthHeaders}),request,provider,result.browser);
  }catch(error){return apiError(error);}
}
