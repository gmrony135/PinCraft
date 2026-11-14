import {json,apiError,readBody} from '@/lib/automation/api';
import {getDatabase} from '@/lib/automation/db.mjs';
import {AutomationError} from '@/lib/automation/errors.mjs';
import {verifyBlogWorkload,claimBlogDelivery} from '@/lib/publishing/automation-workload.mjs';
import {runBlogAutomations} from '@/lib/publishing/automations.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=90;
export async function POST(request){
 try{
  // No shared cron secret, owner cookie or browser-supplied UID/settings can
  // authorize this route. The exact public main-branch workflow and deployment
  // SHA must match a short-lived GitHub OIDC token. Legacy worker stays off.
  const identity=await verifyBlogWorkload(request.headers.get('authorization'));
  const body=await readBody(request,128);
  if(Object.keys(body).length)throw new AutomationError('invalid_request','Scheduled generation accepts no injected settings, accounts, jobs or adapters.');
  const db=getDatabase();await claimBlogDelivery(db,identity);
  return json({ok:true,...await runBlogAutomations(db,{limit:1})});
 }catch(error){return apiError(error);}
}
