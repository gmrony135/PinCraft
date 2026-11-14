import { apiError,json,readBody,sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { AutomationError } from '@/lib/automation/errors.mjs';
import { addWebsite } from '@/lib/automation/channels.mjs';
import { listOAuthResources } from '@/lib/automation/oauth-resources.mjs';
import { createPublishingJob,publishingStatus,listPublishingJobs,processPublishingJob,retryPublishingJob,reviewPublishingJob,inspectPublishingJob,recoverPublishingArticle,markManualPin } from '@/lib/publishing/repository.mjs';
import { blogAutomationStatus,saveBlogAutomation,pauseBlogAutomation } from '@/lib/publishing/automations.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=90;
export async function GET(request,{params}){
 try{const user=await sessionUser(request),{path}=await params,key=path.join('/'),db=getDatabase();
  if(key==='status')return json(await publishingStatus(db,user.id));
  if(key==='jobs')return json(await listPublishingJobs(db,user.id));
  if(key==='automation')return json(await blogAutomationStatus(db,user.id));
  if(path.length===3&&path[0]==='jobs'&&path[2]==='article')return json(await recoverPublishingArticle(db,user.id,path[1]));
  if(key==='connections/blogger/resources'){const q=new URL(request.url).searchParams;return json(await listOAuthResources(db,user.id,'blogger',q.get('cursor'),undefined,q.get('connectionId')||'blogger'));}
  throw new AutomationError('not_found','Publishing endpoint not found. Pinterest is manually uploaded/scheduled in your own account.',{status:404});
 }catch(error){return apiError(error);}
}
export async function POST(request,{params}){
 try{const user=await sessionUser(request,true),{path}=await params,key=path.join('/'),body=await readBody(request,145000),db=getDatabase();
  if(key==='jobs')return json(await createPublishingJob(db,user.id,body),201);
  if(key==='automation')return json(await saveBlogAutomation(db,user.id,body));
  if(key==='automation/pause')return json(await pauseBlogAutomation(db,user.id,body));
  if(key==='websites'){await addWebsite(db,user.id,body);return json({saved:true,message:'Your owned Blogger website was verified. Nothing was published.'});}
  if(path.length===3&&path[0]==='jobs'){
   if(path[2]==='process'){if(Object.keys(body).length)throw new AutomationError('invalid_request','The saved content cannot be replaced while processing.');return json(await processPublishingJob(db,path[1],{uid:user.id}));}
   if(path[2]==='retry')return json(await retryPublishingJob(db,user.id,path[1],body));
   if(path[2]==='review')return json(await reviewPublishingJob(db,user.id,path[1],body));
   if(path[2]==='inspect')return json(await inspectPublishingJob(db,user.id,path[1],body));
   if(path[2]==='manual-complete')return json(await markManualPin(db,user.id,path[1],body));
  }
  throw new AutomationError('not_found','Publishing endpoint not found. This mode never posts through the Pinterest API.',{status:404});
 }catch(error){return apiError(error);}
}
