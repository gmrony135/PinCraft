import 'server-only';
import { randomUUID } from 'node:crypto';
import { transaction } from './db.mjs';
import { DEFAULT_TOPICS,emptyAutomation } from './shared.mjs';
import { AutomationError } from './errors.mjs';
import { revocationLink } from './oauth-config.mjs';

const ACTIVE="('pending','generating','generated','publishing','blog_published','posting','retry')";
const MUTATING=new Set(['publishing','posting']);
const iso=(v)=>v?new Date(v).toISOString():null;
export async function ensureSettings(db,userId){await db.query('INSERT INTO pincraft_auto_settings(user_id,topics) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING',[userId,JSON.stringify(DEFAULT_TOPICS)]);}
export async function addLog(db,userId,jobId,event,status,message){await db.query('INSERT INTO pincraft_auto_logs(user_id,job_id,event,status,message) VALUES($1,$2,$3,$4,$5)',[userId,jobId,event,status,message]);}
export async function recoverInterrupted(db,userId=null,now=new Date()){
  return transaction(db,async(c)=>{
    const accounts=(await c.query("SELECT s.user_id FROM pincraft_auto_settings s WHERE ($1::text IS NULL OR s.user_id=$1) AND EXISTS(SELECT 1 FROM pincraft_auto_jobs j WHERE j.user_id=s.user_id AND j.state IN ('publishing','posting') AND j.lease_until<=$2) ORDER BY s.user_id FOR UPDATE OF s SKIP LOCKED LIMIT 30",[userId,now])).rows;
    for(const a of accounts){
      const jobs=(await c.query("UPDATE pincraft_auto_jobs SET uncertain_step=CASE WHEN state='posting' THEN 'pin' ELSE 'article' END,state='attention',error_code='interrupted_publication',error_message='The worker stopped during external publication. Check the remote result before continuing.',lease_until=NULL,lease_token=NULL,updated_at=now() WHERE user_id=$1 AND state IN ('publishing','posting') AND lease_until<=$2 RETURNING id",[a.user_id,now])).rows;
      await c.query("UPDATE pincraft_auto_settings SET enabled=false,last_error='An interrupted publication needs review to prevent duplicate posts.' WHERE user_id=$1",[a.user_id]);
      for(const j of jobs)await addLog(c,a.user_id,j.id,'review_required','warning','Interrupted external publish: no automatic repost was attempted.');
    }return accounts.length;
  });
}
export async function getStatus(db,userId){
  await ensureSettings(db,userId);await recoverInterrupted(db,userId);
  const s=(await db.query('SELECT * FROM pincraft_auto_settings WHERE user_id=$1',[userId])).rows[0];
  const [stats,recent,logs,hb,oauth,queue,active]=await Promise.all([
    db.query("SELECT count(*) FILTER(WHERE state='success' AND (completed_at AT TIME ZONE $2)::date=(now() AT TIME ZONE $2)::date)::int AS today,count(*) FILTER(WHERE state='success')::int AS successes,count(blog_id)::int AS articles,count(*) FILTER(WHERE state IN ('retry','failed','attention') AND error_code IS NOT NULL)::int AS failures,count(*) FILTER(WHERE state='queued')::int AS queued FROM pincraft_auto_jobs WHERE user_id=$1",[userId,s.timezone]),
    db.query("SELECT id,kind,topic,topic_metadata,state,content->>'title' AS title,blog_url,pin_url,destination_url,uncertain_step,error_message,retry_at,scheduled_at,created_at,completed_at FROM pincraft_auto_jobs WHERE user_id=$1 AND state<>'queued' ORDER BY created_at DESC,id DESC LIMIT 12",[userId]),
    db.query('SELECT id,job_id,event,status,message,created_at FROM pincraft_auto_logs WHERE user_id=$1 ORDER BY id DESC LIMIT 30',[userId]),
    db.query("SELECT last_seen_at,last_finished_at,last_status FROM pincraft_auto_heartbeat WHERE name='auto-worker'"),
    db.query('SELECT provider,status,expires_at,refresh_expires_at,last_refreshed_at,last_error,revocation_status,updated_at FROM pincraft_oauth_connections WHERE user_id=$1',[userId]),
    db.query("SELECT id,content->>'title' AS title,scheduled_at,created_at FROM pincraft_auto_jobs WHERE user_id=$1 AND state='queued' ORDER BY scheduled_at,created_at,id LIMIT 20",[userId]),
    db.query(`SELECT retry_at,lease_until,scheduled_at FROM pincraft_auto_jobs WHERE user_id=$1 AND state IN ${ACTIVE} LIMIT 1`,[userId]),
  ]);
  const integrations=Object.fromEntries(['pinterest','blogger'].map(provider=>{
    const row=oauth.rows.find(r=>r.provider===provider);
    const expired=Boolean(row?.refresh_expires_at&&new Date(row.refresh_expires_at)<=new Date());
    return [provider,{status:expired&&row?.status==='connected'?'reconnect_required':row?.status||'disconnected',connected:row?.status==='connected'&&!expired,accessExpiresAt:iso(row?.expires_at),refreshExpiresAt:iso(row?.refresh_expires_at),lastRefreshedAt:iso(row?.last_refreshed_at),lastError:row?.last_error||null,revocationStatus:row?.revocation_status||'not_requested',revocationUrl:revocationLink(provider)}];
  }));
  const ai={connected:Boolean(s.credentials),provider:s.connection_summary?.aiProvider||null,model:s.connection_summary?.model||null};
  const destinations={boardId:s.pinterest_board_id,boardName:s.pinterest_board_name,blogId:s.blogger_blog_id,blogName:s.blogger_blog_name,blogUrl:s.blogger_blog_url};
  const ready=integrations.pinterest.connected&&Boolean(destinations.boardId)&&(s.posting_mode==='queue'||(ai.connected&&integrations.blogger.connected&&Boolean(destinations.blogId)));
  let next=s.next_run_at;
  if(active.rows[0])next=active.rows[0].retry_at||active.rows[0].scheduled_at;
  else if(s.posting_mode==='queue')next=queue.rows[0]?new Date(Math.max(new Date(next||0).getTime(),new Date(queue.rows[0].scheduled_at).getTime())):null;
  const n=stats.rows[0];
  if(next&&n.today>=s.daily_limit){const reset=(await db.query("SELECT (((now() AT TIME ZONE $1)::date+1)::timestamp AT TIME ZONE $1) AS tomorrow",[s.timezone])).rows[0].tomorrow;next=new Date(Math.max(new Date(next).getTime(),new Date(reset).getTime()));}
  return {...emptyAutomation(),hasActiveJob:Boolean(active.rows[0]),enabled:s.enabled,timezone:s.timezone,topics:s.topics,topicSource:s.topic_source,trendRegion:s.trend_region,intervalMinutes:s.interval_minutes,dailyLimit:s.daily_limit,postingMode:s.posting_mode,nextRunAt:iso(next),lastSuccessAt:iso(s.last_success_at),lastError:s.last_error,connections:ready?{...s.connection_summary,boardId:destinations.boardId,boardName:destinations.boardName,blogProvider:'blogger',blogName:destinations.blogName,blogUrl:destinations.blogUrl,tokenRefresh:true}:null,integrations,destinations,ai,todayCount:n.today,totalSuccess:n.successes,totalArticles:n.articles,failedPosts:n.failures,queueCount:n.queued,queue:queue.rows,recent:recent.rows,logs:logs.rows,heartbeat:hb.rows[0]?{lastSeenAt:iso(hb.rows[0].last_seen_at),lastFinishedAt:iso(hb.rows[0].last_finished_at),lastStatus:hb.rows[0].last_status}:null};
}
async function idleAccount(c,userId){
  const s=(await c.query('SELECT * FROM pincraft_auto_settings WHERE user_id=$1 FOR UPDATE',[userId])).rows[0];
  if((await c.query(`SELECT id FROM pincraft_auto_jobs WHERE user_id=$1 AND state IN ${ACTIVE} AND lease_until>now() LIMIT 1`,[userId])).rowCount)throw new AutomationError('worker_busy','A server job is in flight. Pause Auto Mode and wait for it to finish before changing settings.',{status:409});
  return s;
}
export async function reserveVerification(db,userId){
  await ensureSettings(db,userId);
  if(!(await db.query("UPDATE pincraft_auto_settings SET verify_started_at=now() WHERE user_id=$1 AND (verify_started_at IS NULL OR verify_started_at<now()-interval '90 seconds') RETURNING user_id",[userId])).rowCount)throw new AutomationError('rate_limited','Wait 90 seconds before verifying again. This protects provider quota.',{status:429});
}
export async function saveAI(db,userId,encrypted,summary){
  await ensureSettings(db,userId);
  await transaction(db,async(c)=>{await idleAccount(c,userId);await c.query('UPDATE pincraft_auto_settings SET credentials=$2,connection_summary=$3::jsonb,last_error=NULL,updated_at=now() WHERE user_id=$1',[userId,encrypted,JSON.stringify(summary)]);await addLog(c,userId,null,'ai_verified','success','AI API access verified and API key encrypted. No account password is requested or stored.');});
}
export async function removeAI(db,userId){
  await ensureSettings(db,userId);
  await transaction(db,async(c)=>{await c.query('SELECT user_id FROM pincraft_auto_settings WHERE user_id=$1 FOR UPDATE',[userId]);await c.query('UPDATE pincraft_auto_settings SET enabled=false,credentials=NULL,connection_summary=NULL,updated_at=now() WHERE user_id=$1',[userId]);await addLog(c,userId,null,'ai_removed','info','AI API key deleted and Auto Mode paused.');});
}
export async function saveDestinations(db,userId,{pinterest,blogger=null}){
  await ensureSettings(db,userId);await recoverInterrupted(db,userId);
  await transaction(db,async(c)=>{
    const s=await idleAccount(c,userId);
    for(const [provider,resource] of [['pinterest',pinterest],['blogger',blogger]])if(resource&&!(await c.query("SELECT user_id FROM pincraft_oauth_connections WHERE user_id=$1 AND provider=$2 AND status='connected' AND revision=$3",[userId,provider,resource.revision])).rowCount)throw new AutomationError('oauth_changed','Authorization changed while selecting destinations. Reload and try again.',{status:409});
    const open=(await c.query(`SELECT * FROM pincraft_auto_jobs WHERE user_id=$1 AND (state IN ${ACTIVE} OR state='attention') LIMIT 1`,[userId])).rows[0];
    if(open&&((open.board_id&&open.board_id!==pinterest.id)||(open.kind==='generated'&&open.blog_target_id&&open.blog_target_id!==(blogger?.id||s.blogger_blog_id))))throw new AutomationError('destination_locked','A saved job belongs to its original board/blog. Restore that destination, or review and explicitly abandon the saved job before switching accounts.',{status:409});
    const u=(await c.query('UPDATE pincraft_auto_settings SET enabled=false,pinterest_board_id=$2,pinterest_board_name=$3,blogger_blog_id=$4,blogger_blog_name=$5,blogger_blog_url=$6,connection_version=connection_version+1,last_error=NULL,updated_at=now() WHERE user_id=$1 RETURNING connection_version',[userId,pinterest.id,pinterest.name,blogger?.id||s.blogger_blog_id,blogger?.name||s.blogger_blog_name,blogger?.url||s.blogger_blog_url])).rows[0];
    await c.query(`UPDATE pincraft_auto_jobs SET connection_version=$2 WHERE user_id=$1 AND state IN ${ACTIVE}`,[userId,u.connection_version]);
    await addLog(c,userId,null,'destinations_verified','success','Publishing destinations verified against this user’s own OAuth authorization. Auto Mode remains paused.');
  });
}
export async function updatePreferences(db,userId,{topics,timezone,topicSource,trendRegion,intervalMinutes=120,dailyLimit=10,postingMode='queue',nextPostAt=null}){
  await ensureSettings(db,userId);
  await transaction(db,async(c)=>{
    const s=await idleAccount(c,userId);
    if(s.posting_mode!==postingMode&&(await c.query(`SELECT id FROM pincraft_auto_jobs WHERE user_id=$1 AND state IN ${ACTIVE} LIMIT 1`,[userId])).rowCount)throw new AutomationError('saved_job_pending','Finish or explicitly abandon the saved job before changing posting mode.',{status:409});
    await c.query('UPDATE pincraft_auto_settings SET topics=$2::jsonb,timezone=$3,topic_source=$4,trend_region=$5,interval_minutes=$6,daily_limit=$7,posting_mode=$8,topic_index=0,next_run_at=COALESCE($9::timestamptz,next_run_at),updated_at=now() WHERE user_id=$1',[userId,JSON.stringify(topics),timezone,topicSource,trendRegion,intervalMinutes,dailyLimit,postingMode,nextPostAt]);
    await addLog(c,userId,null,'preferences_saved','info',`Schedule saved: up to ${dailyLimit} Pins/day, at least ${intervalMinutes} minutes apart. Worker checks every 30 minutes; confirmed retryable failures wait 1 hour. Topic source: ${topicSource==='google_trends'?'Google Trends RSS':'rotation (not live trends)'}.`);
  });
}
export async function setMode(db,userId,enabled){
  await ensureSettings(db,userId);await recoverInterrupted(db,userId);
  return transaction(db,async(c)=>{
    const s=(await c.query('SELECT * FROM pincraft_auto_settings WHERE user_id=$1 FOR UPDATE',[userId])).rows[0];
    if(enabled){
      const connected=(await c.query("SELECT provider FROM pincraft_oauth_connections WHERE user_id=$1 AND status='connected' AND (refresh_expires_at IS NULL OR refresh_expires_at>now())",[userId])).rows.map(r=>r.provider);
      if(!s.pinterest_board_id||!connected.includes('pinterest')||(s.posting_mode==='generated'&&(!s.credentials||!s.blogger_blog_id||!connected.includes('blogger'))))throw new AutomationError('connections_required','Connect Pinterest and select your board. Generated Pin + Article mode also requires Blogger, your blog and an AI API key.',{status:409});
      if((await c.query("SELECT id FROM pincraft_auto_jobs WHERE user_id=$1 AND state='attention' LIMIT 1",[userId])).rowCount)throw new AutomationError('review_required','Inspect the uncertain remote result before resuming. It will not be blindly reposted.',{status:409});
      if(s.last_error)throw new AutomationError('reconnect_required','Reconnect the affected provider or schedule an explicit retry of the failed post before resuming.',{status:409});
    }
    await c.query('UPDATE pincraft_auto_settings SET enabled=$2,next_run_at=CASE WHEN $2 THEN COALESCE(next_run_at,now()) ELSE next_run_at END,updated_at=now() WHERE user_id=$1',[userId,enabled]);
    if(s.enabled!==enabled)await addLog(c,userId,null,enabled?'mode_enabled':'mode_paused','info',enabled?'Auto Mode enabled. The server continues while this website is closed.':'Auto Mode paused. A request already sent to a provider may finish; no next step will start.');
  });
}
export async function workerHeartbeat(db,phase='start',id=null){
  if(phase==='start')await db.query("INSERT INTO pincraft_auto_heartbeat(name,last_seen_at,last_status,execution_id) VALUES('auto-worker',now(),'running',$1) ON CONFLICT(name) DO UPDATE SET last_seen_at=now(),last_status='running',execution_id=$1",[id]);
  else await db.query("UPDATE pincraft_auto_heartbeat SET last_finished_at=now(),last_status=$1 WHERE name='auto-worker'",[phase==='ok'?'ok':'error']);
}
export async function claimJob(db,now=new Date()){
  return transaction(db,async(c)=>{
    const account=(await c.query(`SELECT s.* FROM pincraft_auto_settings s LEFT JOIN pincraft_auto_jobs j ON j.user_id=s.user_id AND j.state IN ${ACTIVE}
      WHERE s.enabled AND s.pinterest_board_id IS NOT NULL
      AND EXISTS(SELECT 1 FROM pincraft_oauth_connections p WHERE p.user_id=s.user_id AND p.provider='pinterest' AND p.status='connected')
      AND (s.posting_mode='queue' OR (s.credentials IS NOT NULL AND s.blogger_blog_id IS NOT NULL AND EXISTS(SELECT 1 FROM pincraft_oauth_connections b WHERE b.user_id=s.user_id AND b.provider='blogger' AND b.status='connected')))
      AND NOT EXISTS(SELECT 1 FROM pincraft_auto_jobs a WHERE a.user_id=s.user_id AND a.state='attention')
      AND ((j.id IS NULL AND COALESCE(s.next_run_at,$1)<=$1 AND (s.posting_mode='generated' OR EXISTS(SELECT 1 FROM pincraft_auto_jobs q WHERE q.user_id=s.user_id AND q.state='queued' AND q.scheduled_at<=$1))) OR (j.id IS NOT NULL AND (j.lease_until IS NULL OR j.lease_until<=$1) AND (j.retry_at IS NULL OR j.retry_at<=$1)))
      ORDER BY COALESCE(j.retry_at,s.next_run_at,'epoch'::timestamptz),s.user_id FOR UPDATE OF s SKIP LOCKED LIMIT 1`,[now])).rows[0];
    if(!account)return null;
    let job=(await c.query(`SELECT * FROM pincraft_auto_jobs WHERE user_id=$1 AND state IN ${ACTIVE} FOR UPDATE LIMIT 1`,[account.user_id])).rows[0];
    if(job&&MUTATING.has(job.state)){
      await c.query("UPDATE pincraft_auto_jobs SET uncertain_step=CASE WHEN state='posting' THEN 'pin' ELSE 'article' END,state='attention',error_code='interrupted_publication',error_message='The worker stopped during external publication. Check the remote result.',lease_until=NULL,lease_token=NULL WHERE id=$1",[job.id]);
      await c.query("UPDATE pincraft_auto_settings SET enabled=false,last_error='An interrupted publication requires review.' WHERE user_id=$1",[account.user_id]);return {skipped:true};
    }
    const date=(await c.query("SELECT ($1::timestamptz AT TIME ZONE $2)::date::text AS day,((($1::timestamptz AT TIME ZONE $2)::date+1)::timestamp AT TIME ZONE $2) AS tomorrow",[now,account.timezone])).rows[0];
    const used=(await c.query("SELECT count(*)::int AS total FROM pincraft_auto_jobs WHERE user_id=$1 AND state='success' AND (completed_at AT TIME ZONE $3)::date=$2::date",[account.user_id,date.day,account.timezone])).rows[0].total;
    if(used>=account.daily_limit){await c.query('UPDATE pincraft_auto_settings SET next_run_at=GREATEST(COALESCE(next_run_at,$2),$2) WHERE user_id=$1',[account.user_id,date.tomorrow]);if(job)await c.query('UPDATE pincraft_auto_jobs SET retry_at=$2 WHERE id=$1',[job.id,date.tomorrow]);return {skipped:true};}
    if(!job){
      if(account.posting_mode==='queue'){
        job=(await c.query("SELECT * FROM pincraft_auto_jobs WHERE user_id=$1 AND state='queued' AND scheduled_at<=$2 ORDER BY scheduled_at,created_at,id FOR UPDATE LIMIT 1",[account.user_id,now])).rows[0];
        if(!job)return null;
        job=(await c.query("UPDATE pincraft_auto_jobs SET state='pending',board_id=$2,connection_version=$3,updated_at=now() WHERE id=$1 RETURNING *",[job.id,account.pinterest_board_id,account.connection_version])).rows[0];
      }else{
        const topic=account.topics[Number(account.topic_index)%account.topics.length];
        job=(await c.query('INSERT INTO pincraft_auto_jobs(id,user_id,scheduled_at,day_key,topic,connection_version,board_id,blog_target_id,blog_target_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[randomUUID(),account.user_id,now,date.day,topic,account.connection_version,account.pinterest_board_id,account.blogger_blog_id,account.blogger_blog_url])).rows[0];
      }
      await c.query("UPDATE pincraft_auto_settings SET topic_index=topic_index+1,next_run_at=$2::timestamptz+($3*interval '1 minute') WHERE user_id=$1",[account.user_id,now,account.interval_minutes]);
    }
    if(job.attempts>=3){await c.query("UPDATE pincraft_auto_jobs SET state='failed',lease_until=NULL,lease_token=NULL WHERE id=$1",[job.id]);await c.query("UPDATE pincraft_auto_settings SET enabled=false,last_error='Retry limit reached. Check the provider before scheduling another retry.' WHERE user_id=$1",[account.user_id]);return {skipped:true};}
    return {...(await c.query("UPDATE pincraft_auto_jobs SET lease_token=$2,lease_until=$3::timestamptz+interval '8 minutes',attempts=attempts+1,retry_at=NULL,updated_at=now() WHERE id=$1 RETURNING *",[job.id,randomUUID(),now])).rows[0],account};
  });
}
export async function assertActive(db,job){
  const r=await db.query('SELECT s.enabled,s.connection_version,s.pinterest_board_id,s.blogger_blog_id FROM pincraft_auto_settings s JOIN pincraft_auto_jobs j ON j.user_id=s.user_id WHERE j.id=$1 AND j.user_id=$3 AND j.lease_token=$2 AND j.lease_until>now()',[job.id,job.lease_token,job.user_id]);
  if(!r.rowCount)throw new AutomationError('lease_lost','The job lease expired; no further external request was started.');
  if(!r.rows[0].enabled)throw new AutomationError('paused','Auto Mode is paused.');
  if(r.rows[0].connection_version!==job.connection_version)throw new AutomationError('connections_changed','Connections changed. Resume from the saved checkpoint after reconnecting.');
  if(job.board_id!==r.rows[0].pinterest_board_id||(job.kind==='generated'&&job.blog_target_id!==r.rows[0].blogger_blog_id))throw new AutomationError('destinations_changed','Restore this saved job’s original authorized board/blog before retrying.');
}
export async function checkpoint(db,job,state,updates={}){
  const allowed=['content','topic','topic_metadata','blog_id','blog_url','pin_id','pin_url'];const fields=[],values=[job.id,job.lease_token,state];
  for(const [n,v]of Object.entries(updates)){if(!allowed.includes(n))throw new Error('Invalid checkpoint field');const json=n==='content'||n==='topic_metadata';values.push(json?JSON.stringify(v):v);fields.push(`${n}=$${values.length}${json?'::jsonb':''}`);}
  const r=await db.query(`UPDATE pincraft_auto_jobs SET state=$3,updated_at=now()${fields.length?','+fields.join(','):''} WHERE id=$1 AND lease_token=$2 AND lease_until>now() RETURNING *`,values);
  if(!r.rowCount)throw new AutomationError('lease_lost','This worker no longer owns the job lease.');Object.assign(job,r.rows[0]);
}
export async function beginMutation(db,job,state){await transaction(db,async(c)=>{await c.query('SELECT user_id FROM pincraft_auto_settings WHERE user_id=$1 FOR UPDATE',[job.user_id]);await assertActive(c,job);await checkpoint(c,job,state);});}
export async function completeJob(db,job,pin){
  // Clone until COMMIT: if saving an accepted Pin fails, failJob must still see
  // the publishing state and demand review, never replay a successful POST.
  const updated={...job};
  await transaction(db,async(c)=>{
    await c.query('SELECT user_id FROM pincraft_auto_settings WHERE user_id=$1 FOR UPDATE',[job.user_id]);
    await checkpoint(c,updated,'success',{pin_id:pin.id,pin_url:pin.url});
    await c.query('UPDATE pincraft_auto_jobs SET completed_at=now(),lease_token=NULL,lease_until=NULL,error_code=NULL,error_message=NULL,uncertain_step=NULL WHERE id=$1',[job.id]);
    await c.query("UPDATE pincraft_auto_settings SET last_success_at=now(),last_error=NULL,next_run_at=GREATEST(COALESCE(next_run_at,now()),now()+(interval_minutes*interval '1 minute')) WHERE user_id=$1",[job.user_id]);
    await addLog(c,job.user_id,job.id,'pin_posted','success',job.kind==='queued_pin'?'Published — Pinterest confirmed this scheduled Pin ID. Its real Pin URL is saved.':'Pin Posted — Pinterest confirmed its Pin ID. The linked Blogger article and Pin are saved in My Library.');
  });Object.assign(job,updated);
}
export async function failJob(db,job,error){
  const known=error instanceof AutomationError;
  const uncertain=error.uncertain||((!known||error.code==='lease_lost')&&MUTATING.has(job.state));
  const retry=Boolean(error.retryable&&job.attempts<3&&!uncertain);
  const state=uncertain?'attention':retry?'retry':'failed';
  const message=known?error.message:uncertain?'The provider result could not be persisted. Check the remote destination; automatic reposting is blocked.':'The worker could not finish. Check the saved checkpoint and server configuration.';
  await transaction(db,async(c)=>{
    await c.query('SELECT user_id FROM pincraft_auto_settings WHERE user_id=$1 FOR UPDATE',[job.user_id]);
    if(error.code==='paused'){await c.query('UPDATE pincraft_auto_jobs SET lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2',[job.id,job.lease_token]);return;}
    const r=await c.query("UPDATE pincraft_auto_jobs SET state=$3,error_code=$4,error_message=$5,uncertain_step=$6,retry_at=CASE WHEN $3='retry' THEN now()+interval '1 hour' ELSE NULL END,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2 RETURNING user_id",[job.id,job.lease_token,state,error.code||'worker_error',message,uncertain?(job.state==='posting'?'pin':'article'):null]);
    if(!r.rowCount)return;
    if(!retry)await c.query('UPDATE pincraft_auto_settings SET enabled=false,last_error=$2 WHERE user_id=$1',[job.user_id,message]);
    await addLog(c,job.user_id,job.id,retry?'retry_scheduled':'job_stopped',uncertain?'warning':'error',retry?`${message} Retry scheduled after 1 hour (attempt ${job.attempts} of 3).`:message);
  });
}
export async function listLibrary(db,userId,cursor){const r=await db.query('SELECT id,kind,topic,topic_metadata,state,content,blog_url,pin_url,created_at,completed_at FROM pincraft_auto_jobs WHERE user_id=$1 AND content IS NOT NULL AND ($2::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM pincraft_auto_jobs WHERE id=$2::uuid AND user_id=$1)) ORDER BY created_at DESC,id DESC LIMIT 21',[userId,cursor||null]);return {items:r.rows.slice(0,20),nextCursor:r.rows.length>20?r.rows[19].id:null};}
export async function retryFailedJob(db,userId,jobId){
  await transaction(db,async(c)=>{
    const s=await idleAccount(c,userId);
    const previous=(await c.query("SELECT board_id,blog_target_id,kind FROM pincraft_auto_jobs WHERE user_id=$1 AND id=$2 AND state='failed'",[userId,jobId])).rows[0];
    if(previous&&(previous.board_id!==s.pinterest_board_id||(previous.kind==='generated'&&previous.blog_target_id!==s.blogger_blog_id)))throw new AutomationError('destination_locked','Restore the failed post’s original board/blog before scheduling a retry.',{status:409});
    if((await c.query(`SELECT id FROM pincraft_auto_jobs WHERE user_id=$1 AND (state IN ${ACTIVE} OR state='attention') LIMIT 1`,[userId])).rowCount)throw new AutomationError('saved_job_pending','Resolve the existing saved job before retrying another.',{status:409});
    const r=await c.query("UPDATE pincraft_auto_jobs SET state='retry',attempts=0,retry_at=now()+interval '1 hour',error_code=NULL,error_message=NULL,connection_version=$3,updated_at=now() WHERE id=$1 AND user_id=$2 AND state='failed' AND uncertain_step IS NULL AND pin_id IS NULL RETURNING id",[jobId,userId,s.connection_version]);
    if(!r.rowCount)throw new AutomationError('invalid_retry','Only a confirmed failed, unpublished job can be retried.',{status:409});
    await c.query('UPDATE pincraft_auto_settings SET enabled=false,last_error=NULL WHERE user_id=$1',[userId]);await addLog(c,userId,jobId,'owner_retry_scheduled','info','Owner scheduled another bounded retry in 1 hour. Auto Mode remains paused until explicitly enabled.');
  });
}
export async function reviewJob(db,userId,jobId,outcome){
  await transaction(db,async(c)=>{
    await c.query('SELECT user_id FROM pincraft_auto_settings WHERE user_id=$1 FOR UPDATE',[userId]);
    const job=(await c.query('SELECT * FROM pincraft_auto_jobs WHERE user_id=$1 AND id=$2 FOR UPDATE',[userId,jobId])).rows[0];
    if(!job||!['attention','failed'].includes(job.state))throw new AutomationError('invalid_review','This job is not awaiting review.',{status:409});
    if(outcome.cancel){await c.query("UPDATE pincraft_auto_jobs SET state='cancelled',error_message='Abandoned after the owner checked the remote destination.',updated_at=now() WHERE id=$1",[jobId]);await addLog(c,userId,jobId,'job_abandoned','warning','Owner inspected the destination and abandoned this job. No success or automatic repost was recorded.');}
    else if(job.state!=='attention')throw new AutomationError('invalid_review','Only an uncertain publication can have its remote result verified.');
    else if(outcome.pin){await c.query("UPDATE pincraft_auto_jobs SET state='success',pin_id=$2,pin_url=$3,completed_at=now(),error_code=NULL,error_message=NULL,uncertain_step=NULL,updated_at=now() WHERE id=$1",[jobId,outcome.pin.id,outcome.pin.url]);await c.query("UPDATE pincraft_auto_settings SET last_success_at=now(),next_run_at=GREATEST(COALESCE(next_run_at,now()),now()+(interval_minutes*interval '1 minute')) WHERE user_id=$1",[userId]);await addLog(c,userId,jobId,'pin_verified','success','Pinterest confirmed the supplied Pin ID, expected board and destination. No repost was made.');}
    else if(outcome.blog){await c.query("UPDATE pincraft_auto_jobs SET state='retry',blog_id=$2,blog_url=$3,attempts=0,retry_at=now()+interval '1 hour',error_code=NULL,error_message=NULL,uncertain_step=NULL,updated_at=now() WHERE id=$1",[jobId,outcome.blog.id,outcome.blog.url]);await addLog(c,userId,jobId,'article_verified','success','Blogger confirmed the article and job marker. Only the remaining Pinterest step will resume, after 1 hour.');}
    else throw new AutomationError('invalid_review','A verified remote result is required.');
    await c.query("UPDATE pincraft_auto_settings SET enabled=false,last_error=CASE WHEN EXISTS(SELECT 1 FROM pincraft_auto_jobs WHERE user_id=$1 AND state='attention') THEN last_error ELSE NULL END WHERE user_id=$1",[userId]);
  });
}
