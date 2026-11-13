import { apiError,automationResponse,json,readBody,sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { AutomationError } from '@/lib/automation/errors.mjs';
import { disconnectProvider } from '@/lib/automation/oauth-tokens.mjs';
import { validProvider } from '@/lib/automation/oauth-config.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=30;
export async function POST(request,{params}){
  try{const user=await sessionUser(request,true),{provider}=await params,body=await readBody(request);if(!validProvider(provider))throw new AutomationError('invalid_provider','Unknown OAuth provider.',{status:404});if(body.confirm!==true)throw new AutomationError('confirmation_required','Confirm provider disconnection.');const notice=await disconnectProvider(getDatabase(),user.id,provider);return json({...await automationResponse(user),notice});}catch(error){return apiError(error);}
}
