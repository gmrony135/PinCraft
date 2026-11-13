import { apiError,automationResponse,json,readBody,sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { AutomationError } from '@/lib/automation/errors.mjs';
import { addQueuedPin,queueInput,removeQueuedPin } from '@/lib/automation/queue.mjs';
import { retryFailedJob } from '@/lib/automation/repository.mjs';
import { validJobId } from '@/lib/automation/images.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export async function POST(request){
  try{
    const user=await sessionUser(request,true),body=await readBody(request),db=getDatabase();
    if(body.action==='queue')await addQueuedPin(db,user.id,queueInput(body));
    else if(body.action==='remove')await removeQueuedPin(db,user.id,body.jobId);
    else if(body.action==='retry'&&validJobId(body.jobId))await retryFailedJob(db,user.id,body.jobId);
    else throw new AutomationError('invalid_action','Choose a valid queue action.');
    return json(await automationResponse(user));
  }catch(error){return apiError(error);}
}
