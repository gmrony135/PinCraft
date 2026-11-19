import {after} from 'next/server';
import {json,apiError,readBody} from '@/lib/automation/api';
import {getDatabase} from '@/lib/automation/db.mjs';
import {AutomationError} from '@/lib/automation/errors.mjs';
import {verifyBlogWorkload,claimBlogDelivery,blogWorkloadConfig} from '@/lib/publishing/automation-workload.mjs';
import {cronSecretIdentity} from '@/lib/publishing/blog-tick-secret.mjs';
import {runBlogAutomations,missedSlotsReport} from '@/lib/publishing/automations.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Generation runs after the response (see after() below), so the cron caller never waits on AI work.
export const maxDuration=300;
export async function POST(request){
 try{
  // Two accepted callers, both gated on the production deployment config:
  // 1) the external 10-minute cron presenting BLOG_TICK_SECRET as a bearer token
  // 2) the GitHub Actions fallback presenting a short-lived OIDC token.
  // Browser cookies and request bodies can never authorize this route.
  const authorization=request.headers.get('authorization');
  let identity=null;
  if(blogWorkloadConfig().configured&&process.env.BLOG_TICK_SECRET){
   // A missing or malformed secret must not block the OIDC fallback below.
   try{identity=cronSecretIdentity({authorization,secret:process.env.BLOG_TICK_SECRET});}catch{identity=null;}
  }
  if(!identity)identity=await verifyBlogWorkload(authorization);
  const body=await readBody(request,128);
  if(Object.keys(body).length)throw new AutomationError('invalid_request','Scheduled generation accepts no injected settings, accounts, jobs or adapters.');
  const db=getDatabase();await claimBlogDelivery(db,identity);
  // Fast, read-only check: a skipped slot whose publish time has passed is reported as MISSED.
  const missed=await missedSlotsReport(db);
  // Preparation runs in the background. The lease in claimAutomation stops overlapping runs,
  // and a failed or timed-out preparation is retried by later ticks before the slot deadline.
  after(async()=>{
   try{await runBlogAutomations(db,{limit:1});}
   catch(error){console.error('blog automation tick run failed',error?.code||error?.name||'unknown');}
  });
  return json({ok:true,accepted:true,outcome:missed.length?'missed_slot':'accepted',missedSlots:missed.length});
 }catch(error){return apiError(error);}
}
