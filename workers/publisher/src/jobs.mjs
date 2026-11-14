import { PublishError, fail, digest, validId, numericId, connectionId, publicHttps, safeUpstreamMessage } from './security.mjs';
import { ownerPath, connPath, jobPath, quotaPath, owned, connected, ms, subscriptionState, reserveQuota, finishQuota, reviewPayload, saveJob, publicJob, publicConnection, requireCapacity, tier, TICK_MS, LEASE_MS, MAX_ATTEMPTS, escapeHTML, config } from './model.mjs';
import { secureBlogURL } from './oauth.mjs';
const pendingStates = new Set(['queued','processing','scheduled','waiting_live','retry']);
const marker = id => `<!-- pincraft-publish-job:${id} -->`;
const missing = () => fail('not_found', 'This publishing job was not found in your account.', { status: 404 });
function requireJob(row, uid = null) { if (!row || uid && row.ownerUID !== uid || !['blogger','pinterest'].includes(row.type) || !validId(row.id)) missing(); return row; }
function candidateURL(data, blogURL) {
  if (!numericId(String(data?.id || '')) || !data?.url) fail('publication_uncertain','Blogger did not confirm this post’s ID and URL. Inspect the remote post before continuing.',{uncertain:true,status:409});
  const url = new URL(secureBlogURL(data.url)), base = new URL(blogURL);
  if (url.origin !== base.origin || url.pathname === base.pathname || !url.pathname.startsWith(base.pathname.endsWith('/') ? base.pathname : base.pathname + '/')) fail('publication_uncertain','Blogger did not return an article URL under the selected, verified blog.',{uncertain:true,status:409});
  return url.href;
}
export class PublishingJobs {
  constructor(env, db, http, oauth, now = () => Date.now()) { this.env=env; this.db=db; this.http=http; this.oauth=oauth; this.now=now; }
  async status(uid) {
    const root=await ownerPath(uid), [profiles,sites,sub,heartbeat]=await Promise.all([this.db.list(root,'connections',{limit:10}),this.db.list(root,'websites',{limit:10}),this.db.get('pincraft_subscriptions/'+root.split('/')[1]),this.db.get('publisher_system/heartbeat')]);
    return {accountId:uid,configured:true,providers:Object.fromEntries(['pinterest','blogger'].map(provider=>[provider,{configured:config(this.env,provider).configured,redirectUri:config(this.env,provider).redirectUri}])),accessTier:['trial','standard'].includes(this.env.PINTEREST_ACCESS_TIER)?this.env.PINTEREST_ACCESS_TIER:'unconfirmed',imageHostConfigured:this.http.imageHosts.length>0,profiles:profiles.map(({path,value})=>publicConnection(value,path.split('/').at(-1))).filter(p=>p.connected||p.status==='reconnect_required'),websites:sites.map(({value})=>value).filter(s=>!s.removed).map(s=>({id:s.id,name:s.name,url:s.url,blogId:s.blog_id,connectionId:s.connection_id,connectionRevision:s.connection_revision})),subscription:subscriptionState(sub),cron:{expression:'*/10 * * * *',pollMinutes:10,lastSeenAt:heartbeat?.lastSeenAt?.toISOString?.()||null,lastOutcome:heartbeat?.outcome||null},serverTime:new Date(this.now()).toISOString()};
  }
  async list(uid) { const rows=await this.db.list(await ownerPath(uid),'publish_job_views',{order:'createdAt',direction:'DESCENDING',limit:100}); return {accountId:uid,jobs:rows.map(({value})=>value).filter(row=>row.ownerUID===uid),limit:100}; }
  async website(uid,body) {
    if (Object.keys(body).some(k=>!['connectionId','blogId'].includes(k))||!connectionId(body.connectionId)||!numericId(body.blogId)) fail('invalid_destination','Select an owned Blogger website.');
    const verified=await this.oauth.destination(uid,'blogger',body.connectionId,body.blogId), root=await ownerPath(uid), path=root+'/websites/blogger_'+body.blogId;
    await this.db.transaction(async tx=>{const [all,auth,sub,old]=await Promise.all([tx.list(root,'websites',{limit:10}),tx.get(await connPath(uid,'blogger',body.connectionId)),tx.get('pincraft_subscriptions/'+root.split('/')[1]),tx.get(path)]); owned(auth,uid,'blogger'); if(auth.revision!==verified.access.row.revision)fail('oauth_changed','Authorization changed. Reload your blogs.',{status:409}); if(all.filter(({value})=>!value.removed&&value.id!=='blogger_'+body.blogId).length>=subscriptionState(sub).limits.websites)fail('subscription_required','An approved, active subscription is required for additional Blogger websites.',{status:402});tx.set(path,{id:'blogger_'+body.blogId,user_id:uid,provider:'blogger',blog_id:body.blogId,name:verified.name,url:verified.url,connection_id:body.connectionId,connection_revision:auth.revision,removed:false,created_at:old?.created_at||new Date(this.now()),updated_at:new Date(this.now())});});
    return {id:'blogger_'+body.blogId,message:'Your owned blog was verified and saved. Nothing was published.'};
  }
  async create(uid,raw) {
    const fingerprint=await digest(JSON.stringify(raw)), existing=validId(raw.requestId)?await this.db.get(jobPath(raw.requestId)):null;
    if(existing){requireJob(existing,uid);if(existing.requestFingerprint!==fingerprint)fail('request_changed','This submission ID already refers to different reviewed content. Start a new review instead.',{status:409});return {job:publicJob(existing),replayed:true};}
    const value=reviewPayload(raw,this.now()), accessTier=tier(this.env,raw.trialConsent), root=await ownerPath(uid), [blog,pin,site]=await Promise.all([this.db.get(await connPath(uid,'blogger',raw.bloggerConnectionId)),this.db.get(await connPath(uid,'pinterest',value.pin.connectionId)),this.db.get(root+'/websites/'+raw.websiteId)]);
    owned(blog,uid,'blogger');owned(pin,uid,'pinterest'); if(!site||site.user_id!==uid||site.removed||site.connection_id!==raw.bloggerConnectionId||site.connection_revision!==blog.revision)fail('website_verification_required','Select a verified Blogger website. Re-verify it after reconnecting.',{status:409});
    const image=await this.http.pinImage(value.pin.imageUrl,{encode:false});if(value.article.featuredImageUrl)this.http.imageURL(value.article.featuredImageUrl);
    const row={id:raw.requestId,ownerUID:uid,type:'blogger',status:'queued',phase:'draft',publishAtUTC:value.blogAt,pinPublishAtUTC:value.pinAt,timezone:value.timezone,payload:{article:value.article,bloggerConnectionId:raw.bloggerConnectionId,bloggerRevision:blog.revision,blogId:site.blog_id,blogURL:site.url,websiteId:site.id,plannedPin:{...value.pin,revision:pin.revision,accountKey:pin.account_key,imageSha256:image.sha256,imageContentType:image.contentType}},attempts:0,attemptOpen:false,error:null,resultURL:null,remoteId:null,draftURL:null,dependentPinId:crypto.randomUUID(),visibility:accessTier==='trial'?'creator_only_trial':'standard_access',reviewedAt:new Date(this.now()),createdAt:new Date(this.now()),updatedAt:new Date(this.now()),runAtUTC:new Date(this.now()),lease:null,leaseUntilUTC:null,mutationPending:null,requestFingerprint:fingerprint};
    await this.db.transaction(async tx=>{const [old,profiles,sites,sub,authBlog,authPin]=await Promise.all([tx.get(jobPath(row.id)),tx.list(root,'connections',{limit:10}),tx.list(root,'websites',{limit:10}),tx.get('pincraft_subscriptions/'+root.split('/')[1]),tx.get(await connPath(uid,'blogger',raw.bloggerConnectionId)),tx.get(await connPath(uid,'pinterest',value.pin.connectionId))]);
      if(old){requireJob(old,uid);if(old.requestFingerprint!==fingerprint)fail('request_changed','This submission changed. Review it again.',{status:409});return;}
      if(!connected(authBlog)||authBlog.revision!==blog.revision||!connected(authPin)||authPin.revision!==pin.revision)fail('oauth_changed','Your authorization changed during review. Reload your connections.',{status:409});requireCapacity(subscriptionState(sub),profiles.map(r=>r.value),sites.map(r=>r.value),value.pin.connectionId,site.id);await saveJob(tx,row);
    });return {job:publicJob(requireJob(await this.db.get(jobPath(row.id)),uid)),replayed:false};
  }
  async claim(id,uid=null) {
    const now=this.now();return this.db.transaction(async tx=>{
      const row=requireJob(await tx.get(jobPath(id)),uid);if(!pendingStates.has(row.status)||ms(row.runAtUTC)>now)return null;
      if(row.status==='processing'){
        if(ms(row.leaseUntilUTC)>now)return null;
        const uncertain=Boolean(row.mutationPending), updated={...row,status:uncertain?'needs_review':row.attempts>=MAX_ATTEMPTS?'failed':'retry',attemptOpen:false,lease:null,leaseUntilUTC:null,runAtUTC:uncertain||row.attempts>=MAX_ATTEMPTS?undefined:new Date(now+TICK_MS),updatedAt:new Date(now),error:{code:uncertain?'publication_uncertain':'interrupted',message:uncertain?'The worker stopped during a remote mutation. Inspect the destination and verify its ID; automatic reposting is blocked.':'The worker stopped before sending a publication. The saved checkpoint will be resumed.',upstreamStatus:null}};await saveJob(tx,updated);return null;
      }
      const increment=row.status==='retry'||!row.attemptOpen, attempts=row.attempts+(increment?1:0);
      if(attempts>MAX_ATTEMPTS){await saveJob(tx,{...row,status:'failed',runAtUTC:undefined,error:{code:'attempt_limit',message:'Three attempts have been used. Inspect the saved result; this job will not be silently reset.',upstreamStatus:null},updatedAt:new Date(now)});return null;}
      const next={...row,status:'processing',attempts,attemptOpen:true,lease:crypto.randomUUID(),leaseUntilUTC:new Date(now+LEASE_MS),runAtUTC:new Date(now+LEASE_MS),updatedAt:new Date(now)};await saveJob(tx,next);return next;
    });
  }
  async checkpoint(job,change,{quota=null,release=false,clearConnection=false}={}) {
    return this.db.transaction(async tx=>{
      const row=requireJob(await tx.get(jobPath(job.id)));if(row.lease!==job.lease||row.status!=='processing')fail('job_changed','This job changed while processing. No result was overwritten.',{status:409});
      const qpath=quota?quotaPath(row.payload.pin.accountKey):null, ledger=qpath?await tx.get(qpath):null, provider=row.type==='pinterest'?'pinterest':'blogger',cid=row.type==='pinterest'?row.payload.pin.connectionId:row.payload.bloggerConnectionId,cpath=clearConnection?await connPath(row.ownerUID,provider,cid):null,conn=cpath?await tx.get(cpath):null;
      const next={...row,...change,lease:null,leaseUntilUTC:null,updatedAt:new Date(this.now())};
      if(qpath)tx.set(qpath,finishQuota(ledger,row.id,{release,now:this.now()}));
      if(conn?.publisher_mutation_job===row.id)tx.set(cpath,{...conn,publisher_mutation_job:null,publisher_mutation_until:null});
      await saveJob(tx,next);return next;
    });
  }
  async beforeMutation(job,access,kind) {
    const uid=job.ownerUID,provider=job.type==='pinterest'?'pinterest':'blogger',id=job.type==='pinterest'?job.payload.pin.connectionId:job.payload.bloggerConnectionId,root=await ownerPath(uid),cpath=await connPath(uid,provider,id),qpath=job.type==='pinterest'?quotaPath(job.payload.pin.accountKey):null;
    return this.db.transaction(async tx=>{
      const [row,conn,sub,profiles,sites,ledger,source]=await Promise.all([tx.get(jobPath(job.id)),tx.get(cpath),tx.get('pincraft_subscriptions/'+root.split('/')[1]),tx.list(root,'connections',{limit:10}),tx.list(root,'websites',{limit:10}),qpath?tx.get(qpath):null,job.type==='pinterest'?tx.get(jobPath(job.bloggerJobId)):null]);
      requireJob(row,uid);owned(conn,uid,provider);if(row.status!=='processing'||row.lease!==job.lease||ms(row.leaseUntilUTC)<=this.now())fail('job_changed','This job is already being handled by another worker.',{status:409});
      const revision=job.type==='pinterest'?row.payload.pin.revision:row.payload.bloggerRevision;
      if(conn.revision!==revision||conn.revision!==access.row.revision)fail('oauth_changed','The selected authorization was replaced. Reconnect and explicitly review this saved job.',{status:409});
      const sourceJob=job.type==='pinterest'?requireJob(source,uid):row,site=sites.map(r=>r.value).find(s=>s.id===sourceJob.payload.websiteId),blogConn=profiles.map(r=>r.value).find(c=>c.connection_id===sourceJob.payload.bloggerConnectionId&&c.provider==='blogger');
      if(!site||site.removed||!connected(blogConn)||blogConn.revision!==sourceJob.payload.bloggerRevision||site.connection_revision!==blogConn.revision)fail('website_verification_required','The Blogger website or its consent changed. Re-verify the website before publishing.',{status:409});
      requireCapacity(subscriptionState(sub),profiles.map(r=>r.value),sites.map(r=>r.value),job.type==='pinterest'?job.payload.pin.connectionId:job.payload.plannedPin.connectionId,sourceJob.payload.websiteId);
      if(source&&(source.status!=='completed'||source.resultURL!==row.payload.pin.link))fail('article_not_live','The matching Blogger article is not confirmed live. Nothing was pinned.',{status:409,retryable:true});
      const reservation=qpath?reserveQuota(ledger,row.id,this.now()):null;
      if(reservation)tx.set(qpath,reservation);
      tx.set(cpath,{...conn,publisher_mutation_job:row.id,publisher_mutation_until:row.leaseUntilUTC});
      const next={...row,mutationPending:kind,mutationStartedAtUTC:new Date(this.now()),updatedAt:new Date(this.now())};await saveJob(tx,next);return next;
    });
  }
  async live(job) {
    const {data}=await this.oauth.authorized(job.ownerUID,'blogger',job.payload.bloggerConnectionId,`https://www.googleapis.com/blogger/v3/blogs/${job.payload.blogId}/posts/${job.remoteId}`);
    if(String(data.id)!==job.remoteId||data.blog?.id&&String(data.blog.id)!==job.payload.blogId)fail('post_mismatch','Blogger did not confirm the saved post in the selected blog.',{status:409});
    if(data.status!=='LIVE'||!Number.isFinite(Date.parse(data.published))||Date.parse(data.published)>this.now()+5000)return null;
    const url=candidateURL(data,job.payload.blogURL);return await this.http.articlePublic(url)?url:null;
  }
  async completeArticle(job,url) {
    const now=this.now();return this.db.transaction(async tx=>{
      const row=requireJob(await tx.get(jobPath(job.id)),job.ownerUID),path=jobPath(row.dependentPinId),old=await tx.get(path);
      if(row.status!=='processing'||row.lease!==job.lease)fail('job_changed','This job changed while verifying its article.',{status:409});
      if(old&&(old.ownerUID!==row.ownerUID||old.bloggerJobId!==row.id))fail('job_changed','The dependent Pin needs inspection.',{status:409});
      const pin=row.payload.plannedPin,child=old||{id:row.dependentPinId,ownerUID:row.ownerUID,type:'pinterest',bloggerJobId:row.id,status:'queued',phase:'pin',publishAtUTC:row.pinPublishAtUTC,timezone:row.timezone,payload:{pin:{...pin,link:url}},attempts:0,attemptOpen:false,error:null,resultURL:null,remoteId:null,visibility:row.visibility,createdAt:new Date(now),updatedAt:new Date(now),runAtUTC:new Date(Math.max(now,ms(row.pinPublishAtUTC))),lease:null,leaseUntilUTC:null,mutationPending:null,reviewedAt:row.reviewedAt};
      const next={...row,status:'completed',phase:'live',resultURL:url,liveCheckedAtUTC:new Date(now),completedAt:new Date(now),runAtUTC:undefined,mutationPending:null,lease:null,leaseUntilUTC:null,error:null,updatedAt:new Date(now)};
      await saveJob(tx,next);if(!old)await saveJob(tx,child);return next;
    });
  }
  async process(id,uid=null) {
    let job=await this.claim(id,uid);if(!job)return {job:publicJob(requireJob(await this.db.get(jobPath(id)),uid)),processed:false};
    let accepted=false;
    try {
      await this.db.managedUser(job.ownerUID);
      const currentTier=tier(this.env,job.visibility==='creator_only_trial');
      if((currentTier==='trial')!==(job.visibility==='creator_only_trial'))fail('access_tier_changed','The app access tier changed after this review. Review a new submission rather than making a creator-only test public.',{status:409});
      if(job.type==='blogger'){
        if(job.phase==='draft'){
          const dest=await this.oauth.destination(job.ownerUID,'blogger',job.payload.bloggerConnectionId,job.payload.blogId);
          if(dest.url!==job.payload.blogURL)fail('destination_changed','The selected blog URL changed. Review the destination again.',{status:409});
          const article=job.payload.article,content=marker(job.id)+'\n'+(article.featuredImageUrl?`<p><img src="${escapeHTML(article.featuredImageUrl)}" alt="${escapeHTML(article.title)}"></p>\n`:'')+article.html;
          job=await this.beforeMutation(job,dest.access,'blogger_draft');
          const {data}=await this.oauth.authorized(job.ownerUID,'blogger',job.payload.bloggerConnectionId,`https://www.googleapis.com/blogger/v3/blogs/${job.payload.blogId}/posts?isDraft=true`,{method:'POST',mutation:true,body:{kind:'blogger#post',title:article.title,content},expected:[200,201]},dest.access);accepted=true;
          if(!numericId(String(data.id||''))||data.blog?.id&&String(data.blog.id)!==job.payload.blogId||data.status&&data.status!=='DRAFT')fail('publication_uncertain','Blogger did not confirm the expected draft. Inspect the blog before continuing.',{status:409,uncertain:true});
          const url=data.url?candidateURL(data,job.payload.blogURL):null;
          job=await this.checkpoint(job,{status:'queued',phase:'publish',remoteId:String(data.id),draftURL:url,mutationPending:null,runAtUTC:new Date(this.now()),error:null},{clearConnection:true});
        }else if(job.phase==='publish'){
          if(!numericId(job.remoteId))fail('draft_missing','The saved Blogger draft ID is missing. Inspect the job before retrying.',{status:409});
          const access=await this.oauth.access(job.ownerUID,'blogger',job.payload.bloggerConnectionId),url=new URL(`https://www.googleapis.com/blogger/v3/blogs/${job.payload.blogId}/posts/${job.remoteId}/publish`),future=ms(job.publishAtUTC)>this.now()+1000;if(future)url.searchParams.set('publishDate',new Date(ms(job.publishAtUTC)).toISOString());
          job=await this.beforeMutation(job,access,'blogger_publish');
          const {data}=await this.oauth.authorized(job.ownerUID,'blogger',job.payload.bloggerConnectionId,url.href,{method:'POST',mutation:true,expected:[200]},access);accepted=true;
          if(String(data.id)!==job.remoteId)fail('publication_uncertain','Blogger did not confirm the saved post’s publication request.',{status:409,uncertain:true});
          const urlCandidate=data.url?candidateURL(data,job.payload.blogURL):job.draftURL;
          job=await this.checkpoint(job,{status:future?'scheduled':'waiting_live',phase:'verify_live',draftURL:urlCandidate,mutationPending:null,runAtUTC:new Date(Math.max(this.now(),ms(job.publishAtUTC))),error:null},{clearConnection:true});
        }else if(job.phase==='verify_live'){
          const url=await this.live(job);
          if(url)job=await this.completeArticle(job,url);
          else if(this.now()>ms(job.publishAtUTC)+48*3600000)fail('article_not_live','Blogger has not confirmed a public, live article within 48 hours of its due time. Inspect the remote post.',{status:409});
          else job=await this.checkpoint(job,{status:'waiting_live',runAtUTC:new Date(this.now()+TICK_MS),error:null});
        }else fail('invalid_checkpoint','The saved article checkpoint needs inspection.',{status:409});
      }else{
        tier(this.env,job.visibility==='creator_only_trial');
        const source=requireJob(await this.db.get(jobPath(job.bloggerJobId)),job.ownerUID);
        if(source.status!=='completed'||source.resultURL!==job.payload.pin.link)fail('article_not_live','The matching article is not confirmed live. The Pin will wait.',{status:409,retryable:true});
        const live=await this.live(source);if(live!==job.payload.pin.link){job=await this.checkpoint(job,{status:'waiting_live',runAtUTC:new Date(this.now()+TICK_MS),error:{code:'article_not_live',message:'The matching Blogger article is not currently confirmed public. No Pin was sent.',upstreamStatus:null}});return {job:publicJob(job),processed:true};}
        const pin=job.payload.pin,dest=await this.oauth.destination(job.ownerUID,'pinterest',pin.connectionId,pin.boardId),image=await this.http.pinImage(pin.imageUrl);
        if(image.sha256!==pin.imageSha256||image.contentType!==pin.imageContentType)fail('reviewed_image_changed','The hosted image changed after review. Review a new submission instead of silently publishing different artwork.',{status:409});
        job=await this.beforeMutation(job,dest.access,'pinterest_pin');
        const {data}=await this.oauth.authorized(job.ownerUID,'pinterest',pin.connectionId,'https://api.pinterest.com/v5/pins',{method:'POST',mutation:true,expected:[201],body:{board_id:pin.boardId,title:pin.title,description:pin.description+(pin.hashtags.length?'\n'+pin.hashtags.join(' '):''),link:pin.link,alt_text:pin.altText,media_source:image.media}},dest.access);accepted=true;
        if(!numericId(data?.id)||data.board_id&&String(data.board_id)!==pin.boardId||data.link&&data.link!==pin.link)fail('publication_uncertain','Pinterest returned an unconfirmed Pin receipt. Inspect the board and verify the Pin ID; automatic reposting is blocked.',{status:409,uncertain:true});
        job=await this.checkpoint(job,{status:'completed',remoteId:data.id,resultURL:`https://www.pinterest.com/pin/${data.id}/`,httpStatus:201,completedAt:new Date(this.now()),runAtUTC:undefined,mutationPending:null,error:null},{quota:true,clearConnection:true});
      }
      return {job:publicJob(job),processed:true};
    }catch(error){const result=await this.failure(job,error,accepted);return {job:publicJob(result),processed:true,stopRun:error.upstreamStatus===429||error.code==='rate_limited'};}
  }
  async failure(job,error,accepted=false) {
    const now=this.now(),uncertain=Boolean(accepted||error.uncertain),isQuota=error.code==='pinterest_daily_limit',retry=!uncertain&&(isQuota||error.retryable)&&job.attempts<MAX_ATTEMPTS,delay=isQuota?Math.max(TICK_MS,ms(error.resumeAt)-now):Math.max(TICK_MS,error.retryAfter||0,TICK_MS*2**Math.max(0,job.attempts-1));
    const upstreamStatus=Number.isInteger(error.upstreamStatus)?error.upstreamStatus:null,known=typeof error.code==='string'&&/^[a-z_]{3,60}$/.test(error.code),message=uncertain?'The remote result is uncertain. Inspect the destination and verify its ID. Automatic reposting is blocked.':known?safeUpstreamMessage(error.message,'The publishing step could not be completed. Review the destination and retry only after checking the saved result.'):'The publishing step could not be completed. No success was assumed.';
    return this.db.transaction(async tx=>{
      const row=requireJob(await tx.get(jobPath(job.id)));if(row.status==='completed')return row;if(row.lease!==job.lease||row.status!=='processing')return row;
      const qpath=job.type==='pinterest'&&row.mutationPending&&!uncertain?quotaPath(row.payload.pin.accountKey):null,ledger=qpath?await tx.get(qpath):null,provider=job.type==='pinterest'?'pinterest':'blogger',id=job.type==='pinterest'?row.payload.pin.connectionId:row.payload.bloggerConnectionId,cpath=await connPath(row.ownerUID,provider,id),conn=await tx.get(cpath);
      if(qpath)tx.set(qpath,finishQuota(ledger,row.id,{release:true,now}));
      if(conn?.publisher_mutation_job===row.id)tx.set(cpath,{...conn,publisher_mutation_job:null,publisher_mutation_until:null});
      const next={...row,status:uncertain?'needs_review':retry?'retry':'failed',attemptOpen:isQuota?true:false,attempts:isQuota?Math.max(0,row.attempts-1):row.attempts,error:{code:uncertain?'publication_uncertain':known?error.code:'publishing_failed',message,upstreamStatus},runAtUTC:retry?new Date(now+delay):undefined,lease:null,leaseUntilUTC:null,mutationPending:uncertain?row.mutationPending:null,updatedAt:new Date(now)};await saveJob(tx,next);return next;
    });
  }
  async retry(uid,id,body) {
    if(Object.keys(body).some(k=>!['boardId'].includes(k)))fail('invalid_retry','Only an owned board correction can be included in Retry.');
    const job=requireJob(await this.db.get(jobPath(id)),uid);let verified=null;if(body.boardId){if(job.type!=='pinterest')fail('invalid_retry','Board corrections belong to a Pin job.');verified=await this.oauth.destination(uid,'pinterest',job.payload.pin.connectionId,body.boardId);}
    await this.db.transaction(async tx=>{
      const row=requireJob(await tx.get(jobPath(id)),uid);if(!['failed','retry'].includes(row.status)||row.mutationPending)fail('review_required','This job is not safely retryable. Review uncertain remote results instead of reposting.',{status:409});if(row.attempts>=MAX_ATTEMPTS)fail('attempt_limit','This job has used three attempts. Its counter cannot be reset with Retry.',{status:409});if(row.error?.code==='rate_limited'&&ms(row.runAtUTC)>this.now())fail('rate_limited','Wait for the rate-limit backoff before retrying.',{status:429});
      if(verified&&verified.access.row.revision!==row.payload.pin.revision)fail('oauth_changed','Authorization changed. Review the saved content and connection.',{status:409});
      await saveJob(tx,{...row,...(verified?{payload:{...row.payload,pin:{...row.payload.pin,boardId:verified.id}}}:{}),status:'retry',attemptOpen:false,runAtUTC:new Date(this.now()),error:null,updatedAt:new Date(this.now())});
    });return {job:publicJob(requireJob(await this.db.get(jobPath(id)),uid))};
  }
  async review(uid,id,body) {
    if(Object.keys(body).some(k=>!['action','remoteId','inspected'].includes(k))||body.inspected!==true||!['verify','abandon'].includes(body.action))fail('inspection_required','Inspect the actual blog or board before resolving an uncertain result.');
    const job=requireJob(await this.db.get(jobPath(id)),uid);if(job.status!=='needs_review')fail('review_not_required','This job is not waiting for uncertainty review.',{status:409});
    if(body.action==='abandon'){
      await this.db.transaction(async tx=>{const row=requireJob(await tx.get(jobPath(id)),uid);if(row.status!=='needs_review')fail('job_changed','The review state changed.',{status:409});const path=row.type==='pinterest'?quotaPath(row.payload.pin.accountKey):null,ledger=path?await tx.get(path):null;if(path)tx.set(path,finishQuota(ledger,row.id,{now:this.now()}));await saveJob(tx,{...row,status:'cancelled',runAtUTC:undefined,mutationPending:null,error:{code:'manually_abandoned',message:'Stopped after owner inspection. An uncertain Pin remains conservatively counted for another 24 hours.',upstreamStatus:null},updatedAt:new Date(this.now())});});return {job:publicJob(requireJob(await this.db.get(jobPath(id)),uid))};
    }
    if(!numericId(body.remoteId))fail('invalid_remote_id','Enter the genuine remote post or Pin ID found during inspection.');
    let change;
    if(job.type==='pinterest'){
      const {data}=await this.oauth.authorized(uid,'pinterest',job.payload.pin.connectionId,`https://api.pinterest.com/v5/pins/${body.remoteId}`);
      if(data.id!==body.remoteId||String(data.board_id)!==job.payload.pin.boardId||data.link!==job.payload.pin.link)fail('verification_failed','This Pin did not confirm the reviewed board and exact article URL.',{status:409});change={status:'completed',remoteId:data.id,resultURL:`https://www.pinterest.com/pin/${data.id}/`,httpStatus:null,phase:'pin',completedAt:new Date(this.now()),runAtUTC:undefined};
    }else{
      const {data}=await this.oauth.authorized(uid,'blogger',job.payload.bloggerConnectionId,`https://www.googleapis.com/blogger/v3/blogs/${job.payload.blogId}/posts/${body.remoteId}`);
      if(String(data.id)!==body.remoteId||data.blog?.id&&String(data.blog.id)!==job.payload.blogId||typeof data.content!=='string'||!data.content.includes(marker(job.id)))fail('verification_failed','This post did not confirm this job’s private publication marker in the selected blog.',{status:409});
      const url=data.url?candidateURL(data,job.payload.blogURL):null;change={remoteId:body.remoteId,draftURL:url,status:data.status==='DRAFT'?'queued':'waiting_live',phase:data.status==='DRAFT'?'publish':'verify_live',runAtUTC:new Date(Math.max(this.now(),data.status==='SCHEDULED'?ms(job.publishAtUTC):this.now()))};
    }
    await this.db.transaction(async tx=>{const row=requireJob(await tx.get(jobPath(id)),uid);if(row.status!=='needs_review')fail('job_changed','This job changed during verification.',{status:409});const path=row.type==='pinterest'?quotaPath(row.payload.pin.accountKey):null,ledger=path?await tx.get(path):null;if(path)tx.set(path,finishQuota(ledger,row.id,{now:this.now()}));await saveJob(tx,{...row,...change,mutationPending:null,error:null,lease:null,leaseUntilUTC:null,updatedAt:new Date(this.now())});});return {job:publicJob(requireJob(await this.db.get(jobPath(id)),uid))};
  }
  async tick() {
    const due=await this.db.list('','publish_jobs',{field:'runAtUTC',op:'LESS_THAN_OR_EQUAL',value:new Date(this.now()),order:'runAtUTC',limit:1});
    const result=due[0]?await this.process(due[0].value.id):null;
    await this.db.set('publisher_system/heartbeat',{lastSeenAt:new Date(this.now()),outcome:result?.stopRun?'rate_limited':result?.job?.status==='needs_review'?'needs_review':result?.job?.status==='failed'?'job_failed':'ok',dueProcessed:result?.processed?1:0});return result;
  }
}
