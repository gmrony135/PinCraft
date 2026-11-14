import 'server-only';
import {randomUUID} from 'node:crypto';
import {AutomationError,publicMessage} from '../automation/errors.mjs';
import {transaction} from '../automation/db.mjs';
import {accountRef,connectionRef,data,ms,iso,ownerKey} from '../automation/firestore.mjs';
import {entitlements} from '../billing/repository.mjs';
import {oauthConfig} from '../automation/oauth-config.mjs';
import {vaultReady} from '../automation/vault.mjs';
import {draftInput,saveDraft} from '../automation/drafts.mjs';
import {generateForUser} from '../ai/service.mjs';
import {publicAIStatus} from '../ai/config.mjs';
import {publicGeneration} from '../ai/public.mjs';
import {aiUsage} from '../ai/usage.mjs';
import {validJobId,fingerprint,redactedError} from './content.mjs';
import {manualPinterestMode} from './mode.mjs';
import {createAutomatedPublishingJob,authorizePublishingOwner,assertDestination,siteCapacity} from './repository.mjs';
import {blogAutomationRef,blogSlotRef,blogSlotsRef,assertAutomationConsent} from './automation-contract.mjs';
import {blogAutomationSettings,BLOG_AUTOMATION_CONSENT,MIN_FIRST_NOTICE_MS,MIN_PUBLISH_NOTICE_MS,nextBlogSlot,prepareAt,automationSlotId} from './blog-automation-policy.mjs';
import {blogWorkloadConfig} from './automation-workload.mjs';
import {selectCategoryTrend,trendGuideTitle} from './category-trends.mjs';
import {automationContext,validateAutomaticArticle,automaticEditorialReview} from './automation-editorial.mjs';
export const AUTOMATION_LEASE_MS=4*60000,AUTOMATION_RETRY_MS=10*60000;
const mode=()=>{if(!manualPinterestMode())throw new AutomationError('publishing_mode_changed','Recurring Blogger articles require Blogger automatic + Pinterest manual mode.',{status:409});};
const putConfig=(tx,db,row)=>{const saved={...row};if(saved.nextRunAtUTC===undefined)delete saved.nextRunAtUTC;tx.set(blogAutomationRef(db,row.ownerUID),saved);};
const ownConfig=(row,uid)=>{if(row&&row.ownerUID!==uid)throw new AutomationError('not_found','No automation was found in this account.',{status:404});return row;};
const safeError=error=>{const details=redactedError(error);return {...details,message:publicMessage(details.message,'Live article generation is temporarily unavailable. No template or replacement article was queued.')};};
const cleanOutcome=row=>row?{state:row.state,message:row.message,at:iso(row.at),slotId:row.slotId||null,jobId:row.jobId||null,title:row.title||null,publishAtUTC:iso(row.publishAtUTC),error:row.error||null}:null;
export function publicBlogAutomation(row){return row?{revision:row.revision,enabled:row.enabled===true,settings:row.settings,destination:{name:row.destination.name,url:row.destination.blogURL},consentAt:iso(row.consent?.givenAt),nextSlotUTC:iso(row.nextSlotUTC),nextCheckAtUTC:iso(row.nextRunAtUTC),activeSlotId:row.activeSlotId||null,lastOutcome:cleanOutcome(row.lastOutcome),updatedAt:iso(row.updatedAt)}:null;}
export function publicBlogSlot(row){return {id:row.id,state:row.state,title:row.title||null,publishAtUTC:iso(row.publishAtUTC),createdAt:iso(row.createdAt),updatedAt:iso(row.updatedAt),jobId:row.state==='queued'?row.jobId:null,libraryDraftId:row.libraryDraftId||null,error:row.error||null,evidence:row.evidence||null,editorialReview:row.editorialReview||null};}
export async function blogAutomationStatus(db,uid){
 mode();
 const [config,slots,heartbeat,usage]=await Promise.all([blogAutomationRef(db,uid).get(),blogSlotsRef(db,uid).orderBy('createdAt','desc').limit(12).get(),db.doc('publisher_system/blog_automation').get(),aiUsage(db,uid)]);
 return {accountId:uid,automation:publicBlogAutomation(ownConfig(data(config),uid)),slots:slots.docs.map(data).filter(s=>s.ownerUID===uid).map(publicBlogSlot),readiness:{textConfigured:publicAIStatus().textConfigured,workloadConfigured:blogWorkloadConfig().configured,bloggerConfigured:oauthConfig('blogger').configured&&vaultReady(),dailyCeiling:6,prepareAheadMinutes:90},usage,heartbeat:{lastSeenAt:iso(data(heartbeat)?.lastSeenAt),outcome:data(heartbeat)?.outcome||null},serverTime:new Date().toISOString()};
}
async function destination(db,uid,settings,tx=null){
 const read=r=>tx?tx.get(r):r.get();
 const [authSnap,all,access]=await Promise.all([read(connectionRef(db,uid,'blogger',settings.bloggerConnectionId)),read(accountRef(db,uid).collection('websites')),entitlements(db,uid,tx)]);
 const auth=data(authSnap),allSites=all.docs.map(data),site=allSites.find(s=>s.id===settings.websiteId);
 const payload={bloggerConnectionId:settings.bloggerConnectionId,bloggerRevision:auth?.revision??null,bloggerAccountKey:auth?.account_key??null,websiteId:settings.websiteId,blogId:site?.blog_id??null,blogURL:site?.url??null};
 assertDestination(auth,site,uid,payload);siteCapacity(access,allSites,settings.websiteId);
 return {...payload,name:site.name||'Blogger website'};
}
function setupReady({aiConfigured=publicAIStatus().textConfigured,workloadConfigured=blogWorkloadConfig().configured}={}){
 if(!oauthConfig('blogger').configured||!vaultReady())throw new AutomationError('oauth_setup_required','Secure Blogger publishing is not configured. Nothing was enabled.',{status:503});
 if(!aiConfigured)throw new AutomationError('ai_setup_required','Live text generation is not configured. No template articles will be substituted.',{status:503});
 if(!workloadConfigured)throw new AutomationError('automation_scheduler_setup','The guarded recurring-generation scheduler is not configured for this production deployment. Nothing was enabled.',{status:503});
}
export async function saveBlogAutomation(db,uid,raw,{now=Date.now(),authorizeOwner=authorizePublishingOwner,...readiness}={}){
 mode();
 const allowed=['requestId','expectedRevision','settings','enabled','consent'];
 if(!raw||Array.isArray(raw)||Object.keys(raw).some(k=>!allowed.includes(k))||!validJobId(raw.requestId)||!(raw.expectedRevision===null||validJobId(raw.expectedRevision))||typeof raw.enabled!=='boolean'||typeof raw.consent!=='boolean'||raw.enabled&&raw.consent!==true)throw new AutomationError('recurring_consent_required','Explicitly authorize future AI-generated articles and Blogger publication, separately from reviewing one article.');
 let settings;try{settings=blogAutomationSettings(raw.settings);}catch(error){throw new AutomationError('invalid_automation',error.message);}
 const hash=fingerprint(raw),revision=randomUUID();
 await authorizeOwner(uid);
 if(raw.enabled)setupReady(readiness);
 await transaction(db,async tx=>{
  const previous=ownConfig(data(await tx.get(blogAutomationRef(db,uid))),uid);
  if(previous?.lastRequestId===raw.requestId){if(previous.lastRequestFingerprint!==hash)throw new AutomationError('request_changed','This automation request ID already refers to different settings.',{status:409});return;}
  if((previous?.revision||null)!==raw.expectedRevision)throw new AutomationError('automation_changed','Your automation changed in another tab or request. Refresh and review its current settings.',{status:409});
  const selected=await destination(db,uid,settings,tx),oldSlot=previous?.activeSlotId?data(await tx.get(blogSlotRef(db,uid,previous.activeSlotId))):null;
  let nextSlotUTC=raw.enabled?nextBlogSlot(settings,now+MIN_FIRST_NOTICE_MS):null;
  if(nextSlotUTC){let found=false;for(let i=0;i<18;i++){const old=await tx.get(blogSlotRef(db,uid,automationSlotId(nextSlotUTC))),near=(previous?.publicationReservations||[]).some(r=>Math.abs(ms(r.at)-ms(nextSlotUTC))<60*60000);if(!old.exists&&!near){found=true;break;}nextSlotUTC=nextBlogSlot(settings,ms(nextSlotUTC)+1000);}if(!found)throw new AutomationError('automation_schedule_reserved','Upcoming times are already reserved. Choose a later schedule rather than repeating an existing slot.',{status:409});}
  const row={ownerUID:uid,revision,enabled:raw.enabled,settings,destination:selected,consent:raw.enabled?{version:BLOG_AUTOMATION_CONSENT,ownerUID:uid,settingsFingerprint:fingerprint(settings),givenAt:new Date(now)}:null,activeSlotId:null,nextSlotUTC,nextRunAtUTC:nextSlotUTC?prepareAt(nextSlotUTC,now):undefined,lease:null,leaseUntilUTC:null,publicationReservations:previous?.publicationReservations||[],recentTopics:previous?.recentTopics||[],lastRequestId:raw.requestId,lastRequestFingerprint:hash,createdAt:previous?.createdAt||new Date(now),updatedAt:new Date(now),lastOutcome:{state:raw.enabled?'enabled':'saved_paused',message:raw.enabled?'Recurring generation and Blogger publication authorized for these exact settings. No post is claimed until its saved Blogger job is verified live.':'Settings saved, but recurring generation and publication are paused.',at:new Date(now)}};
  if(oldSlot&&!['queued','skipped','cancelled'].includes(oldSlot.state))tx.set(blogSlotRef(db,uid,oldSlot.id),{...oldSlot,state:'cancelled',error:{code:'automation_changed',message:'The owner replaced or paused the recurring settings. Any generated draft was kept privately.',upstreamStatus:null},updatedAt:new Date(now)});
  putConfig(tx,db,row);
 });
 return {accountId:uid,automation:publicBlogAutomation(data(await blogAutomationRef(db,uid).get()))};
}
export async function pauseBlogAutomation(db,uid,raw,{now=Date.now()}={}){
 mode();
 if(!raw||Object.keys(raw).some(k=>!['requestId','expectedRevision'].includes(k))||!validJobId(raw.requestId)||!validJobId(raw.expectedRevision))throw new AutomationError('invalid_automation','Refresh and select the current automation to pause.');
 const hash=fingerprint(raw);
 await transaction(db,async tx=>{
  const current=ownConfig(data(await tx.get(blogAutomationRef(db,uid))),uid);
  if(current?.lastRequestId===raw.requestId){if(current.lastRequestFingerprint!==hash)throw new AutomationError('request_changed','This request ID was used for another change.',{status:409});return;}
  if(!current||current.revision!==raw.expectedRevision)throw new AutomationError('automation_changed','The automation changed. Refresh before pausing.',{status:409});
  const slot=current.activeSlotId?data(await tx.get(blogSlotRef(db,uid,current.activeSlotId))):null;
  if(slot&&!['queued','skipped','cancelled'].includes(slot.state))tx.set(blogSlotRef(db,uid,slot.id),{...slot,state:'cancelled',updatedAt:new Date(now),error:{code:'automation_paused',message:'The owner paused this slot. Any already-generated article remains a private draft.',upstreamStatus:null}});
  putConfig(tx,db,{...current,enabled:false,revision:randomUUID(),consent:null,nextSlotUTC:null,nextRunAtUTC:undefined,activeSlotId:null,lease:null,leaseUntilUTC:null,lastRequestId:raw.requestId,lastRequestFingerprint:hash,updatedAt:new Date(now),lastOutcome:{state:'paused',message:'New generation and unsent Blogger mutations stopped. Posts already scheduled inside Blogger remain scheduled; manage those in Blogger.',at:new Date(now)}});
 });
 return {accountId:uid,automation:publicBlogAutomation(data(await blogAutomationRef(db,uid).get()))};
}
async function claimAutomation(db,uid,now){
 return transaction(db,async tx=>{
  const cfg=ownConfig(data(await tx.get(blogAutomationRef(db,uid))),uid);
  if(!cfg?.enabled||!cfg.nextRunAtUTC||ms(cfg.nextRunAtUTC)>now||ms(cfg.leaseUntilUTC)>now)return null;
  assertAutomationConsent(cfg,uid,cfg.revision);
  const selected=await destination(db,uid,cfg.settings,tx);
  if(fingerprint(selected)!==fingerprint(cfg.destination))throw new AutomationError('oauth_changed','The Blogger authorization or website changed. Reconnect and explicitly enable automation again.',{status:409});
  const id=cfg.activeSlotId||automationSlotId(cfg.nextSlotUTC),previous=data(await tx.get(blogSlotRef(db,uid,id)));
  if(previous&&(previous.ownerUID!==uid||previous.revision!==cfg.revision))throw new AutomationError('automation_slot_conflict','This planned instant already belongs to an earlier authorization. Refresh and choose a later schedule; no duplicate was created.',{status:409});
  const slot=previous||{id,ownerUID:uid,revision:cfg.revision,publishAtUTC:cfg.nextSlotUTC,state:'select',jobId:randomUUID(),articleRequestKey:randomUUID(),qualityRequestKey:randomUUID(),libraryRequestKey:randomUUID(),attempts:{},evidence:null,title:null,article:null,articlePayload:null,editorialReview:null,error:null,createdAt:new Date(now),updatedAt:new Date(now)};
  if(['queued','skipped','cancelled'].includes(slot.state))throw new AutomationError('automation_slot_conflict','This instant already has a terminal result. It will not be reused.',{status:409});
  const claimed={...cfg,activeSlotId:id,lease:randomUUID(),leaseUntilUTC:new Date(now+AUTOMATION_LEASE_MS),nextRunAtUTC:new Date(now+AUTOMATION_LEASE_MS),updatedAt:new Date(now)};
  const attempt={...slot,attempts:{...slot.attempts,[slot.state]:(slot.attempts?.[slot.state]||0)+1},updatedAt:new Date(now)};
  putConfig(tx,db,claimed);tx.set(blogSlotRef(db,uid,id),attempt);
  return {config:claimed,slot:attempt};
 });
}
async function activeCheckpoint(db,context,patch,now,{release=false,message='Preparing a generated article.'}={}){
 const {config,slot}=context;
 return transaction(db,async tx=>{
  const [c,s]=await tx.getAll(blogAutomationRef(db,config.ownerUID),blogSlotRef(db,config.ownerUID,slot.id)),current=data(c),previous=data(s);
  assertAutomationConsent(current,config.ownerUID,config.revision);
  if(current.activeSlotId!==slot.id||current.lease!==config.lease||ms(current.leaseUntilUTC)<=now||previous?.revision!==config.revision)throw new AutomationError('automation_lease_lost','This generation lease changed. Its result cannot authorize publication.',{status:409});
  const next={...previous,...patch,updatedAt:new Date(now)},attemptedTopic=patch.article&&next.evidence?{key:next.evidence.topicKey,tokens:next.evidence.topicTokens,title:next.evidence.topic,at:new Date(now)}:null,nextConfig={...current,...(attemptedTopic?{recentTopics:[...(current.recentTopics||[]).filter(t=>ms(t.at)>now-7*86400000&&t.key!==attemptedTopic.key),attemptedTopic].slice(-48)}:{}),updatedAt:new Date(now),...(release?{lease:null,leaseUntilUTC:null,nextRunAtUTC:new Date(now+1000)}:{}),lastOutcome:{state:next.state,slotId:slot.id,title:next.title,publishAtUTC:next.publishAtUTC,message,at:new Date(now)}};
  tx.set(blogSlotRef(db,config.ownerUID,slot.id),next);putConfig(tx,db,nextConfig);
  return {config:nextConfig,slot:next};
 });
}
const critical=new Set(['oauth_changed','oauth_reconnect_required','website_verification_required','subscription_required','account_unavailable','automation_authorization_changed','automation_slot_conflict','ai_setup_required','oauth_setup_required']);
const safeWait=new Set(['category_trends_unavailable','ai_busy','ai_slow_down','ai_request_pending','ai_usage_unavailable']);
async function failAutomation(db,context,error,now){
 const {config,slot}=context,details=safeError(error);
 return transaction(db,async tx=>{
  const [c,s]=await tx.getAll(blogAutomationRef(db,config.ownerUID),blogSlotRef(db,config.ownerUID,slot.id)),current=data(c),saved=data(s);
  if(!current||current.ownerUID!==config.ownerUID||current.revision!==config.revision||current.lease!==config.lease||current.activeSlotId!==slot.id)return 'superseded';
  const pause=critical.has(error.code),retry=!pause&&safeWait.has(error.code)&&(saved.attempts?.[saved.state]||0)<3&&now+AUTOMATION_RETRY_MS+MIN_PUBLISH_NOTICE_MS<ms(saved.publishAtUTC);
  const state=pause?'blocked':retry?'retry':'skipped',nextSlotUTC=pause?null:retry?current.nextSlotUTC:nextBlogSlot(current.settings,Math.max(now+MIN_FIRST_NOTICE_MS,ms(saved.publishAtUTC))+1000);
  tx.set(blogSlotRef(db,config.ownerUID,slot.id),{...saved,state:retry?saved.state:'skipped',error:details,updatedAt:new Date(now)});
  putConfig(tx,db,{...current,enabled:!pause,activeSlotId:retry?slot.id:null,nextSlotUTC,nextRunAtUTC:pause?undefined:retry?new Date(now+AUTOMATION_RETRY_MS):prepareAt(nextSlotUTC,now),lease:null,leaseUntilUTC:null,updatedAt:new Date(now),lastOutcome:{state,error:details,message:pause?'Automation paused for an authorization or configuration blocker. Review and explicitly enable it again.':retry?'This slot is waiting safely before its deadline. No filler was generated and no provider request will be silently repeated.':'This slot was skipped. No replacement, late catch-up burst or fake publication was created.',slotId:slot.id,title:saved.title,publishAtUTC:saved.publishAtUTC,at:new Date(now)}});
  return state;
 });
}
async function blockUnclaimed(db,uid,revision,error,now){
 await transaction(db,async tx=>{const current=ownConfig(data(await tx.get(blogAutomationRef(db,uid))),uid);if(!current||current.revision!==revision)return;putConfig(tx,db,{...current,enabled:false,nextRunAtUTC:undefined,lease:null,leaseUntilUTC:null,updatedAt:new Date(now),lastOutcome:{state:'blocked',message:'Automation paused before generation. Resolve this blocker and explicitly enable it again.',error:safeError(error),at:new Date(now)}});});
}
export async function processBlogAutomation(db,uid,{now=()=>Date.now(),send,generate=generateForUser,generationDependencies={},authorizeOwner=authorizePublishingOwner}={}){
 mode();let context=await claimAutomation(db,uid,now());if(!context)return {state:'not_due',processed:false};
 try{
  await authorizeOwner(uid);
  if(ms(context.slot.publishAtUTC)<now()+MIN_PUBLISH_NOTICE_MS)throw new AutomationError('automation_slot_missed','The slot was missed or too close to register safely. It was skipped instead of backdated.',{status:409});
  if(context.slot.state==='select'){
   const evidence=await selectCategoryTrend(context.config.settings,(context.config.recentTopics||[]).filter(t=>ms(t.at)>now()-7*86400000),{send,now:now()}),title=trendGuideTitle(evidence,context.config.settings.language);
   context=await activeCheckpoint(db,context,{evidence,title,state:'article',attempts:{...context.slot.attempts,article:1},error:null},now(),{message:'Fresh category evidence selected; no article or publication is claimed yet.'});
  }
  if(context.slot.state==='article'){
   // Fixed request keys and exact inputs survive interruption. The existing AI
   // receipt layer returns its saved text or refuses repetition of a spent call.
   const input={task:'article',requestKey:context.slot.articleRequestKey,title:context.slot.title,topic:context.slot.evidence.topic.slice(0,160),language:context.config.settings.language,automationContext:automationContext(context.slot.evidence)};
   const generated=await generate(db,uid,input,generationDependencies),article={...generated.result,generation:publicGeneration({kind:'ai',...generated.generation})};
   const articlePayload=validateAutomaticArticle(article,context.slot.title,context.slot.evidence);
   const libraryDraftId=await saveDraft(db,uid,draftInput({action:'save',kind:'article',requestKey:context.slot.libraryRequestKey,content:article}),{automationSlotId:context.slot.id});
   context=await activeCheckpoint(db,context,{article,articlePayload,contentFingerprint:fingerprint(articlePayload),libraryDraftId,state:'quality',error:null},now(),{release:true,message:'A real AI article was saved privately. The next scheduler check performs editorial review before any publication job is authorized.'});
   return {state:'article_generated',processed:true};
  }
  if(context.slot.state==='quality'){
   const generated=await generate(db,uid,{task:'quality',requestKey:context.slot.qualityRequestKey,content:context.slot.article.plainText.slice(0,14000),topic:context.slot.evidence.topic.slice(0,160),language:context.config.settings.language,automationContext:automationContext(context.slot.evidence)},generationDependencies);
   const editorialReview=automaticEditorialReview(generated.result);
   context=await activeCheckpoint(db,context,{editorialReview,state:editorialReview.passed?'approved':'quality',error:null},now(),{message:editorialReview.passed?'Article passed the configured editorial gates. A durable Blogger job is being queued.':'Editorial review did not pass; no Blogger publication was authorized.'});
   if(!editorialReview.passed)throw new AutomationError('automation_quality_gate','The AI editorial review did not reach 82/100 with every check passing. The private draft was kept; this slot was not published.',{status:422});
  }
  if(context.slot.state!=='approved')throw new AutomationError('automation_invalid_checkpoint','The generation checkpoint needs inspection. No Blogger job was created.',{status:409});
  if(context.slot.evidence.sources.some(s=>now()-Date.parse(s.publishedAt)>=48*3600000))throw new AutomationError('automation_stale_evidence','The topic evidence became too old before publication. The draft was retained without publishing.',{status:409});
  // Revalidate structure/relevance after recovery as well as on first generation.
  const article=validateAutomaticArticle(context.slot.article,context.slot.title,context.slot.evidence);
  await createAutomatedPublishingJob(db,uid,{requestId:context.slot.jobId,article,bloggerConnectionId:context.config.settings.bloggerConnectionId,websiteId:context.config.settings.websiteId,blogPublishAtUTC:iso(context.slot.publishAtUTC),timezone:context.config.settings.timezone},{now:now(),authorization:{slotId:context.slot.id,revision:context.config.revision,lease:context.config.lease}});
  return {state:'queued',processed:true};
 }catch(error){return {state:await failAutomation(db,context,error,now()),processed:true};}
}
export async function runBlogAutomations(db,{limit=1,now=()=>Date.now(),...dependencies}={}){
 mode();
 const candidates=await db.collection('blog_automations').where('nextRunAtUTC','<=',new Date(now())).orderBy('nextRunAtUTC').limit(Math.min(2,Math.max(1,limit))).get();
 const counts={candidates:candidates.size,processed:0,articleGenerated:0,queued:0,skipped:0,blocked:0,retry:0};
 for(const snapshot of candidates.docs){const cfg=data(snapshot);if(!cfg?.ownerUID||snapshot.id!==ownerKey(cfg.ownerUID))continue;let result;try{result=await processBlogAutomation(db,cfg.ownerUID,{now,...dependencies});}catch(error){await blockUnclaimed(db,cfg.ownerUID,cfg.revision,error,now());result={state:'blocked',processed:true};}if(result.processed)counts.processed++;const key=result.state==='article_generated'?'articleGenerated':result.state;if(Object.hasOwn(counts,key))counts[key]++;}
 const outcome=counts.blocked?'needs_attention':counts.skipped?'skipped_slot':counts.retry?'waiting':'ok';
 await db.doc('publisher_system/blog_automation').set({lastSeenAt:new Date(now()),outcome,...counts});
 return {outcome,...counts};
}
