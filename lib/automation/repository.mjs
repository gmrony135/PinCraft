import 'server-only';
import {randomUUID} from 'node:crypto';
import {transaction} from './db.mjs';
import {emptyAutomation} from './shared.mjs';
import {AutomationError} from './errors.mjs';
import {revocationLink} from './oauth-config.mjs';
import {ACTIVE,MUTATING,accountRef,connectionRef,jobRef,jobsFor,data,ms,iso,defaultSettings,defaultJob,readAccount,writeAccount,writeJob,assertLease,assertAccountActive,connected,localDay} from './firestore.mjs';

export async function ensureSettings(db,userId){
  try{await accountRef(db,userId).create(defaultSettings(userId));}catch(error){if(error.code!==6&&error.code!=='already-exists')throw error;}
}
export async function getSettings(db,userId){return data(await accountRef(db,userId).get());}
export async function getJob(db,id,userId=null){const row=data(await jobRef(db,id).get());return row&&(!userId||row.user_id===userId)?row:null;}
export function addLog(db,userId,jobId,event,status,message,tx=null){
  const ref=accountRef(db,userId).collection('logs').doc();const row={id:ref.id,job_id:jobId||null,event,status,message,created_at:new Date()};
  return tx?tx.set(ref,row):ref.set(row);
}
const busy=(job)=>job&&ACTIVE.includes(job.state)&&ms(job.lease_until)>Date.now();
async function activeFor(tx,db,s){return s.active_job_id?data(await tx.get(jobRef(db,s.active_job_id))):null;}
function idle(job){if(busy(job))throw new AutomationError('worker_busy','A server job is in flight. Pause Auto Mode and wait for it to finish before changing settings.',{status:409});}
const lockTarget=(job,s,boardId,blogId)=>{if(job&&((job.board_id&&job.board_id!==boardId)||(job.kind==='generated'&&job.blog_target_id&&job.blog_target_id!==blogId)))throw new AutomationError('destination_locked','A saved job belongs to its original board/blog. Restore that destination, or inspect and explicitly abandon it before switching destinations.',{status:409});};

export async function recoverInterrupted(db,userId=null,now=new Date()){
  let query=db.collection('pincraft_jobs').where('state','in',['publishing','posting']).where('lease_until','<=',now).orderBy('lease_until');
  if(userId)query=query.where('user_id','==',userId);
  const candidates=await query.limit(30).get();let count=0;
  for(const candidate of candidates.docs){
    const stale=data(candidate);
    const changed=await transaction(db,async tx=>{
      const s=await readAccount(tx,db,stale.user_id),j=data(await tx.get(candidate.ref));
      if(!j||!MUTATING.has(j.state)||!j.lease_until||ms(j.lease_until)>ms(now))return false;
      const next={...j,state:'attention',uncertain_step:j.state==='posting'?'pin':'article',error_code:'interrupted_publication',error_message:'The worker stopped during external publication. Check the remote result before continuing.',lease_token:null,lease_until:null};
      writeJob(tx,db,s,j,next);s.enabled=false;s.active_job_id=null;s.active_due_at=null;s.last_error='An interrupted publication needs review to prevent duplicate posts.';writeAccount(tx,db,s);
      addLog(db,s.user_id,j.id,'review_required','warning','Interrupted external publish: no automatic repost was attempted.',tx);return true;
    });if(changed)count++;
  }return count;
}
export async function getStatus(db,userId){
  await ensureSettings(db,userId);await recoverInterrupted(db,userId);
  const s=await getSettings(db,userId),day=localDay(new Date(),s.timezone);
  const [today,recent,logs,heartbeat,pinterest,blogger,queue,active]=await Promise.all([
    jobsFor(db,userId).where('state','==','success').where('completed_at','>=',day.start).where('completed_at','<',day.tomorrow).count().get(),
    jobsFor(db,userId).where('state','in',[...ACTIVE,'success','failed','attention','cancelled']).orderBy('created_at','desc').limit(12).get(),
    accountRef(db,userId).collection('logs').orderBy('created_at','desc').limit(30).get(),
    db.doc('pincraft_system/heartbeat').get(),connectionRef(db,userId,'pinterest').get(),connectionRef(db,userId,'blogger').get(),
    jobsFor(db,userId).where('state','==','queued').orderBy('scheduled_at').orderBy('created_at').limit(20).get(),
    s.active_job_id?jobRef(db,s.active_job_id).get():null,
  ]);
  const integrations=Object.fromEntries([['pinterest',data(pinterest)],['blogger',data(blogger)]].map(([provider,row])=>[provider,{status:row?.status==='connected'&&!connected(row)?'reconnect_required':row?.status||'disconnected',connected:connected(row),accessExpiresAt:iso(row?.expires_at),refreshExpiresAt:iso(row?.refresh_expires_at),lastRefreshedAt:iso(row?.last_refreshed_at),lastError:row?.last_error||null,revocationStatus:row?.revocation_status||'not_requested',revocationUrl:revocationLink(provider)}]));
  const ai={connected:Boolean(s.credentials),provider:s.connection_summary?.aiProvider||null,model:s.connection_summary?.model||null};
  const destinations={boardId:s.pinterest_board_id,boardName:s.pinterest_board_name,blogId:s.blogger_blog_id,blogName:s.blogger_blog_name,blogUrl:s.blogger_blog_url};
  const ready=integrations.pinterest.connected&&Boolean(destinations.boardId)&&(s.posting_mode==='queue'||(ai.connected&&integrations.blogger.connected&&Boolean(destinations.blogId)));
  const activeJob=data(active),waiting=queue.docs.map(data);let next=s.next_run_at;
  if(activeJob&&ACTIVE.includes(activeJob.state))next=activeJob.retry_at||activeJob.scheduled_at;
  else if(s.posting_mode==='queue')next=waiting[0]?new Date(Math.max(ms(next),ms(waiting[0].scheduled_at))):null;
  const todayCount=today.data().count;if(next&&todayCount>=s.daily_limit)next=new Date(Math.max(ms(next),ms(day.tomorrow)));
  const select=(row,fields)=>Object.fromEntries(fields.map(k=>[k,row[k]??null]));
  const h=data(heartbeat);
  return {...emptyAutomation(),hasActiveJob:Boolean(activeJob&&ACTIVE.includes(activeJob.state)),enabled:s.enabled,timezone:s.timezone,topics:s.topics,topicSource:s.topic_source,trendRegion:s.trend_region,intervalMinutes:s.interval_minutes,dailyLimit:s.daily_limit,postingMode:s.posting_mode,nextRunAt:iso(next),lastSuccessAt:iso(s.last_success_at),lastError:s.last_error,connections:ready?{...s.connection_summary,boardId:destinations.boardId,boardName:destinations.boardName,blogProvider:'blogger',blogName:destinations.blogName,blogUrl:destinations.blogUrl,tokenRefresh:true}:null,integrations,destinations,ai,todayCount,totalSuccess:s.total_success,totalArticles:s.total_articles,failedPosts:s.failed_count,queueCount:s.queue_count,queue:waiting.map(j=>({id:j.id,title:j.content?.title||'',scheduled_at:j.scheduled_at,created_at:j.created_at})),recent:recent.docs.map(doc=>{const j=data(doc);return {...select(j,['id','kind','topic','topic_metadata','state','blog_url','pin_url','destination_url','uncertain_step','error_message','retry_at','scheduled_at','created_at','completed_at']),title:j.content?.title||null};}),logs:logs.docs.map(data),heartbeat:h?{lastSeenAt:iso(h.last_seen_at),lastFinishedAt:iso(h.last_finished_at),lastStatus:h.last_status}:null};
}
export async function reserveVerification(db,userId){
  await ensureSettings(db,userId);await transaction(db,async tx=>{const s=await readAccount(tx,db,userId);if(ms(s.verify_started_at)>Date.now()-90000)throw new AutomationError('rate_limited','Wait 90 seconds before verifying again. This protects provider quota.',{status:429});s.verify_started_at=new Date();writeAccount(tx,db,s);});
}
export async function saveAI(db,userId,encrypted,summary){
  await ensureSettings(db,userId);await transaction(db,async tx=>{const s=await readAccount(tx,db,userId),active=await activeFor(tx,db,s);idle(active);s.credentials=encrypted;s.connection_summary=summary;s.last_error=null;writeAccount(tx,db,s);addLog(db,userId,null,'ai_verified','success','AI API access verified and API key encrypted. No account password is requested or stored.',tx);});
}
export async function removeAI(db,userId){
  await ensureSettings(db,userId);await transaction(db,async tx=>{const s=await readAccount(tx,db,userId);s.enabled=false;s.credentials=null;s.connection_summary=null;writeAccount(tx,db,s);addLog(db,userId,null,'ai_removed','info','AI API key deleted and Auto Mode paused.',tx);});
}
export async function saveDestinations(db,userId,{pinterest,blogger=null}){
  await ensureSettings(db,userId);await recoverInterrupted(db,userId);
  await transaction(db,async tx=>{
    const s=await readAccount(tx,db,userId),active=await activeFor(tx,db,s);
    const [p,b,open]=await Promise.all([tx.get(connectionRef(db,userId,'pinterest')),blogger?tx.get(connectionRef(db,userId,'blogger')):null,tx.get(jobsFor(db,userId).where('state','in',[...ACTIVE,'attention']))]);
    idle(active);
    for(const [snap,resource]of [[p,pinterest],[b,blogger]])if(resource){const row=data(snap);if(!connected(row)||row.revision!==resource.revision)throw new AutomationError('oauth_changed','Authorization changed while selecting destinations. Reload and try again.',{status:409});}
    const blogId=blogger?.id||s.blogger_blog_id;for(const doc of open.docs)lockTarget(data(doc),s,pinterest.id,blogId);
    Object.assign(s,{enabled:false,pinterest_board_id:pinterest.id,pinterest_board_name:pinterest.name,blogger_blog_id:blogId,blogger_blog_name:blogger?.name||s.blogger_blog_name,blogger_blog_url:blogger?.url||s.blogger_blog_url,connection_version:s.connection_version+1,last_error:null});
    if(active&&ACTIVE.includes(active.state))writeJob(tx,db,s,active,{...active,connection_version:s.connection_version});
    writeAccount(tx,db,s);addLog(db,userId,null,'destinations_verified','success','Publishing destinations verified against this user’s own OAuth authorization. Auto Mode remains paused.',tx);
  });
}
export async function updatePreferences(db,userId,{topics,timezone,topicSource,trendRegion,intervalMinutes=120,dailyLimit=10,postingMode='queue',nextPostAt=null}){
  await ensureSettings(db,userId);await transaction(db,async tx=>{
    const s=await readAccount(tx,db,userId),active=await activeFor(tx,db,s);idle(active);
    if(s.posting_mode!==postingMode&&active&&ACTIVE.includes(active.state))throw new AutomationError('saved_job_pending','Finish or explicitly abandon the saved job before changing posting mode.',{status:409});
    Object.assign(s,{topics,timezone,topic_source:topicSource,trend_region:trendRegion,interval_minutes:intervalMinutes,daily_limit:dailyLimit,posting_mode:postingMode,topic_index:0,...(nextPostAt?{next_run_at:new Date(nextPostAt)}:{})});
    writeAccount(tx,db,s);addLog(db,userId,null,'preferences_saved','info',`Schedule saved: up to ${dailyLimit} Pins/day, at least ${intervalMinutes} minutes apart. Firebase worker checks every 30 minutes; confirmed retryable failures wait 1 hour. Topic source: ${topicSource==='google_trends'?'Google Trends RSS':'rotation (not live trends)'}.`,tx);
  });
}
export async function setMode(db,userId,enabled){
  await ensureSettings(db,userId);await recoverInterrupted(db,userId);
  await transaction(db,async tx=>{
    const s=await readAccount(tx,db,userId);
    const [p,b]=enabled?await Promise.all([tx.get(connectionRef(db,userId,'pinterest')),tx.get(connectionRef(db,userId,'blogger'))]):[null,null];
    if(enabled){
      if(!s.pinterest_board_id||!connected(data(p))||(s.posting_mode==='generated'&&(!s.credentials||!s.blogger_blog_id||!connected(data(b)))))throw new AutomationError('connections_required','Connect Pinterest and select your board. Generated Pin + Article mode also requires Blogger, your blog and an AI API key.',{status:409});
      if(s.attention_count)throw new AutomationError('review_required','Inspect the uncertain remote result before resuming. It will not be blindly reposted.',{status:409});
      if(s.last_error)throw new AutomationError('reconnect_required','Reconnect the affected provider or schedule an explicit retry of the failed post before resuming.',{status:409});
    }
    const changed=s.enabled!==enabled;s.enabled=enabled;if(enabled&&!s.next_run_at)s.next_run_at=new Date();writeAccount(tx,db,s);
    if(changed)addLog(db,userId,null,enabled?'mode_enabled':'mode_paused','info',enabled?'Auto Mode enabled. Firebase continues while this website is closed.':'Auto Mode paused. A request already sent to a provider may finish; no next step will start.',tx);
  });
}
export async function workerHeartbeat(db,phase='start',id=null){
  const ref=db.doc('pincraft_system/heartbeat');
  if(phase==='start')await ref.set({last_seen_at:new Date(),last_status:'running',execution_id:id},{merge:true});
  else await ref.set({last_finished_at:new Date(),last_status:phase==='ok'?'ok':'error'},{merge:true});
}
export async function claimJob(db,now=new Date()){
  const candidates=await db.collection('pincraft_accounts').where('enabled','==',true).where('worker_due_at','<=',now).orderBy('worker_due_at').limit(30).get();
  for(const candidate of candidates.docs){
    const result=await transaction(db,async tx=>{
      const s=data(await tx.get(candidate.ref));if(!s||!s.enabled||!s.worker_due_at||ms(s.worker_due_at)>ms(now))return null;
      let job=await activeFor(tx,db,s);
      const [p,b,queued]=await Promise.all([tx.get(connectionRef(db,s.user_id,'pinterest')),s.posting_mode==='generated'?tx.get(connectionRef(db,s.user_id,'blogger')):null,!job&&s.posting_mode==='queue'?tx.get(jobsFor(db,s.user_id).where('state','==','queued').orderBy('scheduled_at').orderBy('created_at').limit(2)):null]);
      if(!connected(data(p))||!s.pinterest_board_id||(s.posting_mode==='generated'&&(!s.credentials||!s.blogger_blog_id||!connected(data(b))))){s.enabled=false;s.last_error='Reconnect the affected provider and verify the selected destination.';writeAccount(tx,db,s);return {skipped:true};}
      if(s.attention_count){s.enabled=false;writeAccount(tx,db,s);return {skipped:true};}
      if(job&&(!ACTIVE.includes(job.state)||job.user_id!==s.user_id)){s.enabled=false;s.last_error='Saved job ownership or state needs inspection.';writeAccount(tx,db,s);return {skipped:true};}
      if(job&&(ms(job.lease_until)>ms(now)||ms(job.retry_at)>ms(now)))return null;
      if(job&&MUTATING.has(job.state)){
        writeJob(tx,db,s,job,{...job,state:'attention',uncertain_step:job.state==='posting'?'pin':'article',error_code:'interrupted_publication',error_message:'The worker stopped during external publication. Check the remote result.',lease_token:null,lease_until:null});s.enabled=false;s.active_job_id=null;s.active_due_at=null;s.last_error='An interrupted publication requires review.';writeAccount(tx,db,s);return {skipped:true};
      }
      const day=localDay(now,s.timezone);
      const today=await tx.get(jobsFor(db,s.user_id).where('state','==','success').where('completed_at','>=',day.start).where('completed_at','<',day.tomorrow));
      if(today.size>=s.daily_limit){s.next_run_at=new Date(Math.max(ms(s.next_run_at),ms(day.tomorrow)));if(job){job={...job,retry_at:day.tomorrow};writeJob(tx,db,s,job,job);s.active_due_at=day.tomorrow;}writeAccount(tx,db,s);return {skipped:true};}
      if(!job){
        if(ms(s.next_run_at)>ms(now))return null;
        if(s.posting_mode==='queue'){
          const waiting=queued.docs.map(data);job=waiting[0];
          if(!job||ms(job.scheduled_at)>ms(now)){s.next_queue_at=job?.scheduled_at||null;writeAccount(tx,db,s);return null;}
          const original={...job};job={...job,state:'pending',board_id:s.pinterest_board_id,connection_version:s.connection_version};
          s.next_queue_at=waiting[1]?.scheduled_at||null;writeJob(tx,db,s,original,job);
        }else{job=defaultJob(s.user_id,{scheduled_at:now,day_key:day.key,topic:s.topics[s.topic_index%s.topics.length],connection_version:s.connection_version,board_id:s.pinterest_board_id,blog_target_id:s.blogger_blog_id,blog_target_url:s.blogger_blog_url});}
        s.topic_index++;s.next_run_at=new Date(ms(now)+s.interval_minutes*60000);
      }
      if(job.attempts>=3){writeJob(tx,db,s,job,{...job,state:'failed',lease_token:null,lease_until:null});s.enabled=false;s.active_job_id=null;s.active_due_at=null;s.last_error='Retry limit reached. Check the provider before scheduling another retry.';writeAccount(tx,db,s);return {skipped:true};}
      const next={...job,lease_token:randomUUID(),lease_until:new Date(ms(now)+8*60000),attempts:job.attempts+1,retry_at:null};
      // For a queued claim its queued->pending delta was already applied above.
      writeJob(tx,db,s,job,next);s.active_job_id=next.id;s.active_due_at=next.lease_until;writeAccount(tx,db,s);return {...next,account:{...s}};
    });if(result)return result;
  }return null;
}
export async function assertActive(db,job){
  const [settings,saved]=await db.getAll(accountRef(db,job.user_id),jobRef(db,job.id));const s=data(settings),row=data(saved);assertLease(row,job);if(!s||s.user_id!==job.user_id)throw new AutomationError('lease_lost','Account ownership changed.');assertAccountActive(s,job);
}
const checkpointFields=new Set(['content','topic','topic_metadata','blog_id','blog_url','pin_id','pin_url']);
export async function checkpoint(db,job,state,updates={}){
  for(const name of Object.keys(updates))if(!checkpointFields.has(name))throw new Error('Invalid checkpoint field');
  const updated=await transaction(db,async tx=>{const s=await readAccount(tx,db,job.user_id),saved=data(await tx.get(jobRef(db,job.id)));assertLease(saved,job);const next=writeJob(tx,db,s,saved,{...saved,...updates,state});writeAccount(tx,db,s);return next;});
  Object.assign(job,updated);
}
export async function beginMutation(db,job,state){
  if(!MUTATING.has(state))throw new Error('Invalid publication state');
  const updated=await transaction(db,async tx=>{const s=await readAccount(tx,db,job.user_id),saved=data(await tx.get(jobRef(db,job.id)));assertLease(saved,job);assertAccountActive(s,job);const next=writeJob(tx,db,s,saved,{...saved,state});writeAccount(tx,db,s);return next;});Object.assign(job,updated);
}
export async function completeJob(db,job,pin){
  // Do not mutate the in-memory publishing checkpoint until Firestore commits.
  const updated=await transaction(db,async tx=>{
    const s=await readAccount(tx,db,job.user_id),saved=data(await tx.get(jobRef(db,job.id)));assertLease(saved,job);
    const now=new Date(),next=writeJob(tx,db,s,saved,{...saved,state:'success',pin_id:pin.id,pin_url:pin.url,completed_at:now,lease_token:null,lease_until:null,error_code:null,error_message:null,uncertain_step:null});
    s.last_success_at=now;s.last_error=null;s.next_run_at=new Date(Math.max(ms(s.next_run_at),ms(now)+s.interval_minutes*60000));s.active_job_id=null;s.active_due_at=null;writeAccount(tx,db,s);
    addLog(db,job.user_id,job.id,'pin_posted','success',job.kind==='queued_pin'?'Published — Pinterest confirmed this scheduled Pin ID. Its real Pin URL is saved.':'Pin Posted — Pinterest confirmed its Pin ID. The linked Blogger article and Pin are saved in My Library.',tx);return next;
  });Object.assign(job,updated);
}
export async function failJob(db,job,error){
  const known=error instanceof AutomationError,uncertain=Boolean(error.uncertain||((!known||error.code==='lease_lost')&&MUTATING.has(job.state))),retry=Boolean(error.retryable&&job.attempts<3&&!uncertain);
  const state=uncertain?'attention':retry?'retry':'failed';
  const message=known?error.message:uncertain?'The provider result could not be persisted. Check the remote destination; automatic reposting is blocked.':'The worker could not finish. Check the saved checkpoint and server configuration.';
  await transaction(db,async tx=>{
    const s=await readAccount(tx,db,job.user_id),saved=data(await tx.get(jobRef(db,job.id)));if(!saved||saved.user_id!==job.user_id||saved.lease_token!==job.lease_token)return;
    if(error.code==='paused'){writeJob(tx,db,s,saved,{...saved,lease_token:null,lease_until:null});s.active_due_at=saved.retry_at||new Date();writeAccount(tx,db,s);return;}
    const retryAt=retry?new Date(Date.now()+3600000):null;
    writeJob(tx,db,s,saved,{...saved,state,error_code:error.code||'worker_error',error_message:message,uncertain_step:uncertain?(job.state==='posting'?'pin':'article'):null,retry_at:retryAt,lease_token:null,lease_until:null});
    s.active_job_id=retry?job.id:null;s.active_due_at=retryAt;if(!retry){s.enabled=false;s.last_error=message;}writeAccount(tx,db,s);
    addLog(db,job.user_id,job.id,retry?'retry_scheduled':'job_stopped',uncertain?'warning':'error',retry?`${message} Retry scheduled after 1 hour (attempt ${job.attempts} of 3).`:message,tx);
  });
}
export async function listLibrary(db,userId,cursor=null){
  let query=jobsFor(db,userId).where('has_content','==',true).orderBy('created_at','desc').orderBy('__name__','desc');
  if(cursor){const row=await jobRef(db,cursor).get();if(!row.exists||row.data().user_id!==userId)return {items:[],nextCursor:null};query=query.startAfter(row);}
  const rows=(await query.limit(21).get()).docs.map(data);
  const fields=['id','kind','topic','topic_metadata','state','content','image_url','destination_url','scheduled_at','blog_url','pin_url','created_at','completed_at'];
  return {items:rows.slice(0,20).map(row=>Object.fromEntries(fields.map(k=>[k,row[k]??null]))),nextCursor:rows.length>20?rows[19].id:null};
}
export async function retryFailedJob(db,userId,jobId){
  await transaction(db,async tx=>{
    const s=await readAccount(tx,db,userId),active=await activeFor(tx,db,s),job=data(await tx.get(jobRef(db,jobId)));idle(active);
    if(!job||job.user_id!==userId||job.state!=='failed'||job.uncertain_step||job.pin_id)throw new AutomationError('invalid_retry','Only a confirmed failed, unpublished job can be retried.',{status:409});
    lockTarget(job,s,s.pinterest_board_id,s.blogger_blog_id);
    if((active&&ACTIVE.includes(active.state))||s.attention_count)throw new AutomationError('saved_job_pending','Resolve the existing saved job before retrying another.',{status:409});
    const retryAt=new Date(Date.now()+3600000);writeJob(tx,db,s,job,{...job,state:'retry',attempts:0,retry_at:retryAt,error_code:null,error_message:null,connection_version:s.connection_version});s.active_job_id=job.id;s.active_due_at=retryAt;s.enabled=false;s.last_error=null;writeAccount(tx,db,s);
    addLog(db,userId,jobId,'owner_retry_scheduled','info','Owner scheduled another bounded retry in 1 hour. Auto Mode remains paused until explicitly enabled.',tx);
  });
}
export async function reviewJob(db,userId,jobId,outcome){
  await transaction(db,async tx=>{
    const s=await readAccount(tx,db,userId),job=data(await tx.get(jobRef(db,jobId)));
    if(!job||job.user_id!==userId||!['attention','failed'].includes(job.state))throw new AutomationError('invalid_review','This job is not awaiting review.',{status:409});
    let next={...job,lease_token:null,lease_until:null},event,message,status='success';
    if(outcome.cancel){next.state='cancelled';next.error_message='Abandoned after the owner checked the remote destination.';event='job_abandoned';status='warning';message='Owner inspected the destination and abandoned this job. No success or automatic repost was recorded.';}
    else if(job.state!=='attention')throw new AutomationError('invalid_review','Only an uncertain publication can have its remote result verified.');
    else if(outcome.pin){Object.assign(next,{state:'success',pin_id:outcome.pin.id,pin_url:outcome.pin.url,completed_at:new Date(),error_code:null,error_message:null,uncertain_step:null});s.last_success_at=new Date();s.next_run_at=new Date(Math.max(ms(s.next_run_at),Date.now()+s.interval_minutes*60000));event='pin_verified';message='Pinterest confirmed the supplied Pin ID, expected board and destination. No repost was made.';}
    else if(outcome.blog){Object.assign(next,{state:'retry',blog_id:outcome.blog.id,blog_url:outcome.blog.url,attempts:0,retry_at:new Date(Date.now()+3600000),error_code:null,error_message:null,uncertain_step:null});s.active_job_id=job.id;s.active_due_at=next.retry_at;event='article_verified';message='Blogger confirmed the article and job marker. Only the remaining Pinterest step will resume, after 1 hour.';}
    else throw new AutomationError('invalid_review','A verified remote result is required.');
    writeJob(tx,db,s,job,next);if(next.state!=='retry'&&s.active_job_id===job.id){s.active_job_id=null;s.active_due_at=null;}s.enabled=false;if(!s.attention_count)s.last_error=null;writeAccount(tx,db,s);addLog(db,userId,jobId,event,status,message,tx);
  });
}
