import {apiError,json,readBody} from '@/lib/automation/api';
import {getDatabase} from '@/lib/automation/db.mjs';
import {AutomationError} from '@/lib/automation/errors.mjs';
import {assertRunner,readSession,refreshSession,recordRunStatus,claimNextPin,completePin} from '@/lib/pinterest-browser/store.mjs';
import {SESSION_MAX_BYTES} from '@/lib/pinterest-browser/jobs.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
// Runner-only endpoints. Every call needs the PINTEREST_RUNNER_TOKEN bearer. Browser cookies cannot reach them.
export async function GET(request,{params}){
 try{
  assertRunner(request.headers.get('authorization'));
  const {action}=await params;
  if(action!=='session')throw new AutomationError('not_found','Unknown action.',{status:404});
  const state=await readSession(getDatabase());
  if(!state)return json({storageState:null},404);
  return json({storageState:state});
 }catch(error){return apiError(error);}
}
export async function POST(request,{params}){
 try{
  assertRunner(request.headers.get('authorization'));
  const {action}=await params,db=getDatabase();
  if(action==='session'){const body=await readBody(request,SESSION_MAX_BYTES+1024);return json(await refreshSession(db,body.storageState));}
  if(action==='status'){const body=await readBody(request,2000);return json(await recordRunStatus(db,body));}
  if(action==='next'){await readBody(request,200).catch(()=>({}));return json(await claimNextPin(db));}
  if(action==='complete'){const body=await readBody(request,2000);return json(await completePin(db,body.jobId,body));}
  throw new AutomationError('not_found','Unknown action.',{status:404});
 }catch(error){return apiError(error);}
}
