import { apiError,automationResponse,json,readBody,sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { AutomationError } from '@/lib/automation/errors.mjs';
import { validJobId } from '@/lib/automation/images.mjs';
import { verifyRemotePublication } from '@/lib/automation/providers.mjs';
import { getJob,reserveVerification,reviewJob } from '@/lib/automation/repository.mjs';
import { getAccessToken } from '@/lib/automation/oauth-tokens.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=90;
export async function POST(request){
  try{
    const user=await sessionUser(request,true),body=await readBody(request);
    if(!validJobId(body.jobId))throw new AutomationError('invalid_job','Choose a valid job to review.');
    const db=getDatabase();const saved=await getJob(db,body.jobId,user.id);const job=saved&&['attention','failed'].includes(saved.state)?saved:null;
    if(!job)throw new AutomationError('job_not_found','This review job was not found.',{status:404});
    let outcome;
    if(body.action==='abandon'&&body.checkedRemote===true)outcome={cancel:true};
    else if(body.action==='verify'&&job.state==='attention'&&typeof body.externalId==='string'){
      await reserveVerification(db,user.id);
      const pin=job.kind==='queued_pin'||job.uncertain_step==='pin'||Boolean(job.blog_url);
      const access=await getAccessToken(db,user.id,pin?'pinterest':'blogger',{connectionId:pin?(job.pinterest_connection_id||'pinterest'):(job.blogger_connection_id||'blogger')});
      const config=pin?{pinterestToken:access.accessToken,pinterestBoardId:job.board_id}:{blogToken:access.accessToken,blogId:job.blog_target_id,blogUrl:job.blog_target_url};
      outcome=await verifyRemotePublication(config,job,body.externalId.trim());
    }else throw new AutomationError('review_confirmation_required','Verify a real remote ID, or confirm that you inspected the destination before abandoning this job.');
    await reviewJob(db,user.id,job.id,outcome);return json(await automationResponse(user));
  }catch(error){return apiError(error);}
}
