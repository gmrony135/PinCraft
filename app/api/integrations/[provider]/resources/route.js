import { apiError,json,sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { integrationReady } from '@/lib/automation/oauth-api';
import { listOAuthResources } from '@/lib/automation/oauth-resources.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export async function GET(request,{params}){
  try{const user=await sessionUser(request),{provider}=await params;await integrationReady(provider);return json(await listOAuthResources(getDatabase(),user.id,provider,new URL(request.url).searchParams.get('cursor'),undefined,new URL(request.url).searchParams.get('connectionId')||provider));}catch(error){return apiError(error);}
}
