// LOCAL ONLY: real Auth/Firestore emulator transactions, synthetic RSS/AI/
// Blogger transports. These checks are NOT production owner consent or posts.
import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {generateKeyPair,SignJWT} from 'jose';
import {writeFile,mkdir} from 'node:fs/promises';
import {getDatabase} from '../lib/automation/db.mjs';
import {firebaseAuth} from '../lib/firebase/admin.mjs';
import {accountRef,data,ms,connectionRef} from '../lib/automation/firestore.mjs';
import {AutomationError} from '../lib/automation/errors.mjs';
import {generateForUser} from '../lib/ai/service.mjs';
import {aiInput} from '../lib/ai/tasks.mjs';
import {aiLimits} from '../lib/ai/config.mjs';
import {blogAutomationSettings,nextBlogSlot,automationSlotId,exceedsRollingBlogLimit} from '../lib/publishing/blog-automation-policy.mjs';
import {blogAutomationRef,blogSlotsRef,blogSlotRef} from '../lib/publishing/automation-contract.mjs';
import {newsXML,trendXML,automaticAI,automaticQuality,automaticArticle} from './blog-automation-fixtures.mjs';
import {parseCategoryNews,parseCategorySearchTrends,rankCategorySignals,selectCategoryTrend,categoryFeedURLs,topicTokens} from '../lib/publishing/category-trends.mjs';
import {automaticEditorialReview,validateAutomaticArticle} from '../lib/publishing/automation-editorial.mjs';
import {verifyBlogWorkload,claimBlogDelivery} from '../lib/publishing/automation-workload.mjs';
import {requestBlogAutomation} from './request-blog-automation.mjs';
import {saveBlogAutomation,pauseBlogAutomation,blogAutomationStatus,processBlogAutomation,runBlogAutomations,AUTOMATION_LEASE_MS} from '../lib/publishing/automations.mjs';
import {listPublishingJobs,processPublishingJob,createAutomatedPublishingJob,retryPublishingJob,reviewPublishingJob} from '../lib/publishing/repository.mjs';
import {reviewedFixture,BLOG,POST} from './reviewed-blogger-fixtures.mjs';
import {isolatedFirebase,resetFirebase,firebaseIdentity} from './automation-fixtures.mjs';
isolatedFirebase();const db=getDatabase(),evidence=[];
const check=(name,task)=>test(name,async()=>{try{await task();evidence.push({name,pass:true});}catch(error){evidence.push({name,pass:false,error:error.message});throw error;}});
const code=expected=>error=>{assert.equal(error.code,expected);return true;};
const basic={bloggerConnectionId:'blogger',websiteId:'blogger_'+BLOG,categoryIds:['gardening-outdoor'],topic:'',language:'en',trendRegion:'US',timezone:'UTC',dailyLimit:1,postingTimes:['19:00']};
const cfg=async uid=>data(await blogAutomationRef(db,uid).get());
const slots=async uid=>(await blogSlotsRef(db,uid).get()).docs.map(data);
const setup={aiConfigured:true,workloadConfigured:true};
async function fixture({enabled=true,quality,feedOptions={},aiOptions={},publishingOptions={}}={}){
 const f=await reviewedFixture(publishingOptions),time=new Date(f.now()+60*60000).toISOString().slice(11,16),settings={...basic,postingTimes:[time]},ai=automaticAI({quality,...aiOptions});
 const raw={requestId:randomUUID(),expectedRevision:null,settings,enabled,consent:enabled};
 await saveBlogAutomation(db,f.uid,raw,{now:f.now(),...setup});
 const send=async url=>{isolatedFirebase();if(String(url).startsWith('https://news.google.com/rss/search?'))return newsXML(f.now(),feedOptions);if(String(url).startsWith('https://trends.google.com/trending/rss?'))return trendXML(f.now(),{relevant:false});throw new Error('Unexpected synthetic trend host');};
 return {...f,settings,raw,ai,feedSend:send,process:extra=>processBlogAutomation(db,f.uid,{now:f.now,send,generationDependencies:ai.dependencies,...extra})};
}
async function clearCooldown(uid){const day=new Date().toISOString().slice(0,10),ref=accountRef(db,uid).collection('aiUsage').doc(day);if((await ref.get()).exists)await ref.update({last_text_at:new Date(Date.now()-6000)});}
async function queue(f){assert.equal((await f.process()).state,'article_generated');f.advance(1100);await clearCooldown(f.uid);const result=await f.process();assert.equal(result.state,'queued',JSON.stringify((await cfg(f.uid)).lastOutcome));return (await listPublishingJobs(db,f.uid)).jobs[0];}
async function pause(f){const current=await cfg(f.uid);return pauseBlogAutomation(db,f.uid,{requestId:randomUUID(),expectedRevision:current.revision},{now:f.now()});}
async function moveOtherDue(){for(const s of (await db.collection('blog_automations').get()).docs)if(data(s).nextRunAtUTC)await s.ref.update({nextRunAtUTC:new Date(Date.now()+10*86400000)});}
before(async()=>resetFirebase());
after(async()=>{await mkdir('.shots',{recursive:true});await writeFile('.shots/blog-automation-tests.json',JSON.stringify({mode:'Guarded local Firebase/Auth only; explicit synthetic trend, AI and Blogger transports. No production publishing or actual editorial assessment.',passed:evidence.filter(r=>r.pass).length,total:evidence.length,results:evidence},null,2)+'\n');await db.terminate();});

check('Recurring Blogger settings accept six editable minute slots, not Pinterest-only half-hour settings',()=>{
 const times=['08:05','10:35','13:05','15:35','18:05','20:35'],value=blogAutomationSettings({...basic,dailyLimit:6,postingTimes:times});assert.deepEqual(value.postingTimes,times);assert.equal(value.dailyLimit,6);
 for(const patch of [{dailyLimit:7},{categoryIds:[]},{categoryIds:['fake']},{categoryIds:['home-decor','food-recipes','fashion-style','diy-crafts']},{postingTimes:['25:00']},{dailyLimit:2,postingTimes:['08:00','08:30']},{dailyLimit:2,postingTimes:['00:15','23:30']},{timezone:'Not/Real'},{language:'xx'},{trendRegion:'XX'},{pinterestBoardId:'forbidden'},{topic:'<script>'}])assert.throws(()=>blogAutomationSettings({...basic,...patch}));
});
check('Recurring DST slots skip nonexistent times and use a repeated local slot once',()=>{
 assert.equal(nextBlogSlot({...basic,timezone:'America/New_York',postingTimes:['02:30']},'2027-03-14T06:00:00Z').toISOString(),'2027-03-15T06:30:00.000Z');
 const s={...basic,timezone:'America/New_York',postingTimes:['01:30']},one=nextBlogSlot(s,'2027-11-07T04:00:00Z');assert.equal(one.toISOString(),'2027-11-07T05:30:00.000Z');assert.equal(nextBlogSlot(s,new Date(ms(one)+1)).toISOString(),'2027-11-08T06:30:00.000Z');
});
check('Only fixed RSS hosts and bounded, quoted category/topic queries are constructed',()=>{
 const urls=categoryFeedURLs({...basic,topic:'balcony" OR (politics)'});assert.equal(new URL(urls.categoryNews).hostname,'news.google.com');assert.equal(new URL(urls.searchTrends).hostname,'trends.google.com');assert.match(new URL(urls.categoryNews).searchParams.get('q'),/when:2d/);assert.throws(()=>categoryFeedURLs({...basic,categoryIds:['unknown']}));
});
check('News evidence requires fresh category-relevant safe titles and multiple distinct publisher names',()=>{
 const now=Date.now();assert.equal(parseCategoryNews(newsXML(now),basic,now).length,2);
 for(const options of [{stale:true},{irrelevant:true},{unsafe:true}])assert.equal(parseCategoryNews(newsXML(now,options),basic,now).length,0);
 const news=parseCategoryNews(newsXML(now,{singlePublisher:true}),basic,now);assert.equal(rankCategorySignals({news,settings:basic,now}).length,0);
 for(const xml of ['<!DOCTYPE rss><rss/>','<!ENTITY x SYSTEM "file:///secret">','x'.repeat(900001)])assert.throws(()=>parseCategoryNews(xml,basic,now));
});
check('A general Google trend is not accepted merely because the user chose a category',()=>{
 const now=Date.now();assert.equal(parseCategorySearchTrends(trendXML(now,{relevant:false}),basic,now).length,0);assert.equal(parseCategorySearchTrends(trendXML(now),basic,now).length,1);assert.equal(parseCategorySearchTrends(trendXML(now,{stale:true}),basic,now).length,0);
});
check('Category-relevant search-trend confirmation outranks news-only signals without inventing search volumes',()=>{
 const now=Date.now(),news=parseCategoryNews(newsXML(now),basic,now),searchTrends=parseCategorySearchTrends(trendXML(now),basic,now),ranked=rankCategorySignals({news,searchTrends,settings:basic,now});assert.equal(ranked[0].signal,'google_search_trend');assert.match(ranked[0].ranking.method,/not measured search volume/);assert(!Object.hasOwn(ranked[0],'searchVolume'));
});
check('Seven-day topic dedup blocks reused clusters; no fixed editorial fallback is returned',async()=>{
 const now=Date.now(),send=async url=>String(url).includes('news.google.com')?newsXML(now):trendXML(now,{relevant:false}),first=await selectCategoryTrend(basic,[],{send,now});assert.equal(first.signal,'recent_category_news');assert(first.sources.length>=2);await assert.rejects(selectCategoryTrend(basic,[{key:first.topicKey,tokens:first.topicTokens}],{send,now}),code('category_trends_unavailable'));
});
check('A narrow owner topic must match the current evidence, not just the feed query',async()=>{
 const now=Date.now();assert.equal(parseCategoryNews(newsXML(now),{...basic,topic:'orchids'},now).length,0);assert.equal(parseCategoryNews(newsXML(now),{...basic,topic:'balcony'},now).length,2);
 const bad=newsXML(now).replaceAll('https://news.google.com/rss/articles/explicit-local-fixture-','https://127.0.0.1/');assert.equal(parseCategoryNews(bad,basic,now).length,0);
});
check('Public AI requests cannot inject privileged recurring source context or future-publication consent',()=>{
 assert.throws(()=>aiInput({task:'article',title:'Some ordinary article title',requestKey:randomUUID(),language:'en',consent:true,automationContext:{trusted:true}}));
});

const workloadConfig={configured:true,repository:'gmrony135/PinCraft',repositoryId:'1456649831',workflow:'gmrony135/PinCraft/.github/workflows/pincraft-reviewed-blogger.yml@refs/heads/main',audience:'https://pincraftly.vercel.app/api/internal/blog-automation/tick',deploymentSHA:'a'.repeat(40)};
let signing;
async function token(patch={},options={}){signing??=await generateKeyPair('RS256');const now=Math.floor(Date.now()/1000);return new SignJWT({repository_id:workloadConfig.repositoryId,repository:workloadConfig.repository,repository_visibility:'public',ref:'refs/heads/main',workflow_ref:workloadConfig.workflow,sha:workloadConfig.deploymentSHA,event_name:'schedule',run_id:'123456789',run_attempt:'1',jti:randomUUID(),...patch}).setProtectedHeader({alg:'RS256'}).setIssuer('https://token.actions.githubusercontent.com').setAudience(options.audience||workloadConfig.audience).setIssuedAt(now+(options.age||0)).setExpirationTime(now+(options.expiry??300)).sign(signing.privateKey);}
check('Signed GitHub OIDC accepts only the exact reviewed main workflow, public repo ID and deployed commit',async()=>{
 const value=await token(),identity=await verifyBlogWorkload('Bearer '+value,{config:workloadConfig,resolveKey:signing.publicKey});assert.match(identity.executionId,/github-blog-generation:/);assert.match(identity.deliveryKey,/^[a-f0-9]{64}$/);
});
check('Fork/private/PR/old-commit/legacy-workflow/wrong-audience and expired workloads are rejected',async()=>{
 for(const patch of [{repository:'evil/PinCraft'},{repository_id:'123'},{repository_visibility:'private'},{ref:'refs/pull/1/merge'},{event_name:'pull_request'},{workflow_ref:'gmrony135/PinCraft/.github/workflows/pincraft-automation.yml@refs/heads/main'},{sha:'b'.repeat(40)},{run_id:'bad'}])await assert.rejects(verifyBlogWorkload('Bearer '+await token(patch),{config:workloadConfig,resolveKey:signing.publicKey}),code('worker_unauthorized'));
 for(const options of [{audience:'https://evil.example'},{expiry:-120},{age:-1200}])await assert.rejects(verifyBlogWorkload('Bearer '+await token({},options),{config:workloadConfig,resolveKey:signing.publicKey}),code('worker_unauthorized'));
 await assert.rejects(verifyBlogWorkload('Bearer '+await token(),{config:{...workloadConfig,configured:false},resolveKey:signing.publicKey}),code('worker_unauthorized'));
});
check('One OIDC execution can claim only one generator invocation even with another token for the same run',async()=>{
 const identity=await verifyBlogWorkload('Bearer '+await token(),{config:workloadConfig,resolveKey:signing.publicKey});await claimBlogDelivery(db,identity);await assert.rejects(claimBlogDelivery(db,identity),code('worker_replayed'));
});
check('The CLI bridge refuses untrusted contexts and strips all nonaggregate response data',async()=>{
 let calls=0;assert.equal((await requestBlogAutomation({environment:{},send:()=>{calls++;}})).outcome,'not_trusted_actions');assert.equal(calls,0);
 const environment={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'gmrony135/PinCraft',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'schedule',ACTIONS_ID_TOKEN_REQUEST_URL:'https://pipelines.actions.githubusercontent.com/oidc',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'explicit-runtime-fixture'};
 const send=async(url,init)=>{calls++;if(calls===1){assert.equal(new URL(url).searchParams.get('audience'),workloadConfig.audience);return Response.json({value:'synthetic-'.repeat(40)});}assert.equal(String(url),workloadConfig.audience);assert.equal(init.body,'{}');return Response.json({ok:true,outcome:'ok',processed:1,queued:1,ownerUID:'must-not-leak',article:'must-not-leak',token:'must-not-leak'});};
 const result=await requestBlogAutomation({environment,send});assert.equal(result.queued,1);assert(!JSON.stringify(result).includes('must-not-leak'));assert.equal(calls,2);
 calls=0;assert.equal((await requestBlogAutomation({environment:{...environment,ACTIONS_ID_TOKEN_REQUEST_URL:'https://evil.example/steal'},send})).outcome,'oidc_unavailable');assert.equal(calls,0);
});

check('A website connection alone creates no recurring config and no automatic article',async()=>{
 const f=await reviewedFixture(),status=await blogAutomationStatus(db,f.uid);assert.equal(status.automation,null);assert.deepEqual(status.slots,[]);assert.equal((await listPublishingJobs(db,f.uid)).jobs.length,0);
});
check('Saving paused settings is real and side-effect-free; enable requires distinct recurring consent and server readiness',async()=>{
 const f=await fixture({enabled:false}),saved=await cfg(f.uid);assert.equal(saved.enabled,false);assert.equal(saved.nextRunAtUTC,undefined);assert.equal((await f.process()).processed,false);assert.equal(f.ai.calls.length,0);
 const base={...f.raw,requestId:randomUUID(),expectedRevision:saved.revision,enabled:true};await assert.rejects(saveBlogAutomation(db,f.uid,base,{...setup,now:f.now()}),code('recurring_consent_required'));
 await assert.rejects(saveBlogAutomation(db,f.uid,{...base,consent:true},{aiConfigured:false,workloadConfigured:true,now:f.now()}),code('ai_setup_required'));await assert.rejects(saveBlogAutomation(db,f.uid,{...base,consent:true},{aiConfigured:true,workloadConfigured:false,now:f.now()}),code('automation_scheduler_setup'));
 assert.equal((await cfg(f.uid)).enabled,false);assert.equal((await slots(f.uid)).length,0);
});
check('Owner-only settings are revision guarded and request-idempotent, not silently replaced',async()=>{
 const f=await fixture(),first=await cfg(f.uid),again=await saveBlogAutomation(db,f.uid,f.raw,{...setup,now:f.now()+5000});assert.equal(again.automation.revision,first.revision);assert.equal(ms((await cfg(f.uid)).nextSlotUTC),ms(first.nextSlotUTC));
 await assert.rejects(saveBlogAutomation(db,f.uid,{...f.raw,settings:{...f.settings,topic:'different'}},{...setup,now:f.now()}),code('request_changed'));
 await assert.rejects(saveBlogAutomation(db,f.uid,{...f.raw,requestId:randomUUID()},{...setup,now:f.now()}),code('automation_changed'));
 const foreign=await firebaseIdentity('foreign-auto-'+randomUUID());assert.equal((await blogAutomationStatus(db,foreign.id)).automation,null);await assert.rejects(saveBlogAutomation(db,foreign.id,f.raw,{...setup,now:f.now()}));assert.equal((await cfg(f.uid)).revision,first.revision);
});
check('The existing generator and its transactional quotas create a private article, then a separately checked Blogger-only job',async()=>{
 const f=await fixture(),job=await queue(f),saved=data(await db.collection('publish_jobs').doc(job.id).get());assert.equal(f.ai.calls.length,2);assert.deepEqual(f.ai.calls.map(c=>c.task),['article','quality']);assert.equal(job.source,'recurring_automation');assert.equal(job.hasManualPin,false);assert.equal(job.manualTaskId,null);assert.equal(saved.reviewedAt,null);assert(saved.recurringConsentAt);assert.equal(job.resultURL,null);assert.equal(job.automation.editorialReview.passed,true);assert(job.automation.evidence.sources.length>=2);
 const generated=(await slots(f.uid))[0];assert(generated.libraryDraftId);const library=data(await db.collection('pincraft_jobs').doc(generated.libraryDraftId).get());assert.equal(library.user_id,f.uid);assert.equal(library.topic_metadata.source,'recurring_automation');assert.equal(library.state,'draft');
 for(let i=0;i<2;i++)await processPublishingJob(db,job.id,{uid:f.uid,send:f.send,now:f.now});assert.equal((await listPublishingJobs(db,f.uid)).jobs[0].status,'scheduled');assert.equal(f.calls.public,0);
 f.advance(ms(generated.publishAtUTC)-f.now()+1);const live=await processPublishingJob(db,job.id,{uid:f.uid,send:f.send,now:f.now});assert.equal(live.job.status,'completed');assert.equal(live.job.verification,'blogger_live_verified');assert.equal((await listPublishingJobs(db,f.uid)).jobs.length,1);assert.equal(f.calls.draft,1);assert.equal(f.calls.publish,1);assert.equal(f.calls.public,1);
});
check('Concurrent preparation for one owner spends only one article request',async()=>{
 let enter,release;const entered=new Promise(r=>{enter=r;}),held=new Promise(r=>{release=r;}),f=await fixture({aiOptions:{hold:async task=>{if(task==='article'){enter();await held;}}}}),pending=f.process();await entered;
 try{assert.equal((await f.process()).processed,false);assert.equal(f.ai.calls.length,1);}finally{release();assert.equal((await pending).state,'article_generated');}assert.equal((await slots(f.uid)).length,1);
});
check('Pausing while an article is in flight discards publication authority rather than forging consent',async()=>{
 let enter,release;const entered=new Promise(r=>{enter=r;}),held=new Promise(r=>{release=r;}),f=await fixture({aiOptions:{hold:async task=>{if(task==='article'){enter();await held;}}}}),pending=f.process();await entered;await pause(f);release();assert.equal((await pending).state,'superseded');assert.equal((await cfg(f.uid)).enabled,false);assert.equal((await listPublishingJobs(db,f.uid)).jobs.length,0);assert.equal((await slots(f.uid))[0].state,'cancelled');
});
check('Pause is available with broken AI/OAuth readiness, and blocks a queued automatic Blogger mutation',async()=>{
 const f=await fixture(),job=await queue(f);await pause(f);const result=await processPublishingJob(db,job.id,{uid:f.uid,send:f.send,now:f.now});assert.equal(result.job.error.code,'automation_authorization_changed');assert.equal(f.calls.draft,0);assert.equal(f.calls.publish,0);
});
check('Pause after draft creation preserves its post ID but prevents the following publish mutation',async()=>{
 const f=await fixture(),job=await queue(f);await processPublishingJob(db,job.id,{uid:f.uid,send:f.send,now:f.now});await pause(f);const result=await processPublishingJob(db,job.id,{uid:f.uid,send:f.send,now:f.now});assert.equal(result.job.error.code,'automation_authorization_changed');assert(result.job.remoteId);assert.equal(f.calls.draft,1);assert.equal(f.calls.publish,0);
});
check('An already-registered Blogger schedule can still be verified after pause; pause does not pretend to unpublish',async()=>{
 const f=await fixture(),job=await queue(f);for(let i=0;i<2;i++)await processPublishingJob(db,job.id,{uid:f.uid,send:f.send,now:f.now});await pause(f);const slot=(await slots(f.uid))[0];f.advance(ms(slot.publishAtUTC)-f.now()+1);const result=await processPublishingJob(db,job.id,{uid:f.uid,send:f.send,now:f.now});assert.equal(result.job.status,'completed');assert.equal(f.calls.publish,1);
});
check('Reauthorizing settings skips already used upcoming instants instead of regenerating the same slot',async()=>{
 const f=await fixture(),job=await queue(f),previous=await cfg(f.uid);await saveBlogAutomation(db,f.uid,{...f.raw,requestId:randomUUID(),expectedRevision:previous.revision},{...setup,now:f.now()});const next=await cfg(f.uid);assert(ms(next.nextSlotUTC)>ms(job.publishAtUTC));assert.equal(next.publicationReservations.length,1);assert.equal(next.recentTopics.length,1);
});
check('A nonpassing editorial review keeps the private draft and skips, never fabricates a sixth successful post',async()=>{
 const f=await fixture({quality:()=>({...automaticQuality(),score:76})});assert.equal((await f.process()).state,'article_generated');f.advance(1100);await clearCooldown(f.uid);assert.equal((await f.process()).state,'skipped');assert.equal((await listPublishingJobs(db,f.uid)).jobs.length,0);const slot=(await slots(f.uid))[0];assert.equal(slot.editorialReview.passed,false);assert(slot.libraryDraftId);assert.equal(slot.error.code,'automation_quality_gate');
});
check('The editorial gate rejects any review/improve check even with a high score',()=>{
 for(const status of ['improve','review'])assert.equal(automaticEditorialReview({...automaticQuality(),score:100,checks:[...automaticQuality().checks,{label:'Claims',status,detail:'Not verified'}]}).passed,false);assert.equal(automaticEditorialReview({...automaticQuality(),score:81}).passed,false);assert.equal(automaticEditorialReview(automaticQuality()).passed,true);
});
check('Missing category evidence retries finitely and skips without any AI generation or fixed-topic fallback',async()=>{
 const f=await fixture({feedOptions:{irrelevant:true}});for(let i=0;i<3;i++){const result=await f.process();assert.equal(result.state,i===2?'skipped':'retry');f.advance(10*60000+1);}assert.equal(f.ai.calls.length,0);assert.equal((await listPublishingJobs(db,f.uid)).jobs.length,0);assert.equal((await slots(f.uid))[0].error.code,'category_trends_unavailable');
});
check('Existing account AI daily quotas stop recurring requests and do not trigger offline substitution',async()=>{
 const f=await fixture(),day=new Date().toISOString().slice(0,10);await accountRef(db,f.uid).collection('aiUsage').doc(day).set({text:aiLimits().user.text,image:0,active:[]});const result=await f.process();assert.equal(result.state,'skipped');assert.equal(f.ai.calls.length,0);assert.equal((await slots(f.uid))[0].error.code,'ai_daily_limit');assert.equal((await listPublishingJobs(db,f.uid)).jobs.length,0);
});
check('A missed slot never runs a late article or creates a catch-up burst',async()=>{
 const f=await fixture(),current=await cfg(f.uid);f.advance(ms(current.nextSlotUTC)-f.now()+60000);assert.equal((await f.process()).state,'skipped');assert.equal(f.ai.calls.length,0);assert(ms((await cfg(f.uid)).nextSlotUTC)>f.now());assert.equal((await slots(f.uid)).length,1);
});
check('A stored recurring job cannot be created with a forged slot lease or content authority',async()=>{
 const f=await fixture();await f.process();const slot=(await slots(f.uid))[0],current=await cfg(f.uid);await assert.rejects(createAutomatedPublishingJob(db,f.uid,{requestId:slot.jobId,article:slot.articlePayload,bloggerConnectionId:'blogger',websiteId:f.settings.websiteId,blogPublishAtUTC:new Date(slot.publishAtUTC).toISOString(),timezone:'UTC'},{now:f.now(),authorization:{revision:current.revision,slotId:slot.id,lease:randomUUID()}}),code('automation_authorization_changed'));assert.equal((await listPublishingJobs(db,f.uid)).jobs.length,0);
});
check('The hard six-per-rolling-day reservation survives settings changes and blocks a seventh automatic job',async()=>{
 const f=await fixture();await f.process();const current=await cfg(f.uid),at=ms(current.nextSlotUTC),publicationReservations=Array.from({length:6},(_,i)=>({jobId:randomUUID(),at:new Date(at-(i+1)*2*3600000)}));await blogAutomationRef(db,f.uid).update({publicationReservations});f.advance(1100);await clearCooldown(f.uid);assert.equal((await f.process()).state,'skipped');assert.equal((await slots(f.uid))[0].error.code,'automation_daily_limit');assert.equal((await cfg(f.uid)).publicationReservations.length,6);assert.equal((await listPublishingJobs(db,f.uid)).jobs.length,0);
});
check('A reconnected/removed website pauses the scheduler before spending AI quota',async()=>{
 await moveOtherDue();const f=await fixture();await connectionRef(db,f.uid,'blogger').update({revision:randomUUID()});const result=await runBlogAutomations(db,{now:f.now,send:f.feedSend,generationDependencies:f.ai.dependencies});assert.equal(result.blocked,1);assert.equal((await cfg(f.uid)).enabled,false);assert.equal(f.ai.calls.length,0);
});
check('A disabled owner cannot spend recurring AI quota or authorize any automatic Blogger work',async()=>{
 const f=await fixture();await firebaseAuth().updateUser(f.uid,{disabled:true});assert.equal((await f.process()).state,'blocked');assert.equal(f.ai.calls.length,0);assert.equal((await cfg(f.uid)).enabled,false);
});
check('Cached AI receipts recover a lost generation checkpoint without another provider call',async()=>{
 const f=await fixture(),faulty=new Proxy(db,{get(target,key){if(key==='runTransaction')return (task,options)=>target.runTransaction(tx=>task(new Proxy(tx,{get(t,k){if(k==='set')return (reference,value,...rest)=>{if(reference.path.includes('/blog_automation_slots/')&&f.ai.calls.length>0)throw new Error('Explicit local post-generation Firestore fault');return t.set(reference,value,...rest);};const value=Reflect.get(t,k,t);return typeof value==='function'?value.bind(t):value;}})),options);const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 await assert.rejects(processBlogAutomation(faulty,f.uid,{now:f.now,send:f.feedSend,generationDependencies:f.ai.dependencies}));assert.equal(f.ai.calls.length,1);assert.equal((await slots(f.uid))[0].state,'article');f.advance(AUTOMATION_LEASE_MS+1);assert.equal((await f.process()).state,'article_generated');assert.equal(f.ai.calls.length,1);assert.equal((await slots(f.uid))[0].state,'quality');
});
check('Automatic articles reject placeholder/repeated paragraphs and irrelevant content before a job can exist',()=>{
 const a=automaticArticle('A useful balcony garden container guide'),e={topicTokens:topicTokens('balcony garden container planting'),categoryIds:['gardening-outdoor']};const plain=[a.title,a.intro,...a.sections.flatMap(s=>s.paragraphs),a.conclusion].join(' '),article={...a,plainText:plain,wordCount:600};assert(validateAutomaticArticle(article,a.title,e));assert.throws(()=>validateAutomaticArticle({...article,conclusion:article.intro},a.title,e));assert.throws(()=>validateAutomaticArticle({...article,plainText:plain+' lorem ipsum'},a.title,e));
});
check('Public automation/slot receipts expose no AI credentials, private generation metadata or OAuth envelopes',async()=>{
 const f=await fixture();await f.process();const status=JSON.stringify(await blogAutomationStatus(db,f.uid));for(const forbidden of ['isolated-noncredential-fixture','isolated-blog-automation','encrypted_tokens','refreshToken','articleRequestKey','qualityRequestKey','leaseUntilUTC','"provider"','"model"'])assert(!status.includes(forbidden),forbidden);assert(status.includes('recent_category_news'));
});

check('Moving a new slot before six already-reserved future posts cannot evade the rolling ceiling',()=>{
 const at=Date.parse('2027-01-01T23:00:00Z'),future=Array.from({length:6},(_,i)=>new Date(at+(i+1)*2*3600000));assert(exceedsRollingBlogLimit(future,new Date(at)));assert(!exceedsRollingBlogLimit(future.slice(0,5),new Date(at)));
 assert(!exceedsRollingBlogLimit(Array.from({length:6},(_,i)=>new Date(at+i*4*3600000)),new Date(at+24*3600000)));
 assert(exceedsRollingBlogLimit([new Date('not a date')],new Date(at)));
});
check('A failed editorial topic is remembered rather than regenerated into another unreviewable article',async()=>{
 const f=await fixture({quality:()=>({...automaticQuality(),score:50})});await f.process();f.advance(1100);await clearCooldown(f.uid);assert.equal((await f.process()).state,'skipped');const used=f.ai.calls.length,current=await cfg(f.uid);assert.equal(current.recentTopics.length,1);f.advance(ms(current.nextRunAtUTC)-f.now()+1);assert.equal((await f.process()).state,'retry');assert.equal(f.ai.calls.length,used);
});

check('Expired seven-day topic history cannot suppress an otherwise fresh current signal forever',async()=>{
 const f=await fixture(),e=await selectCategoryTrend(f.settings,[],{send:f.feedSend,now:f.now()});await blogAutomationRef(db,f.uid).update({recentTopics:[{key:e.topicKey,tokens:e.topicTokens,title:e.topic,at:new Date(f.now()-7*86400000-1)}]});assert.equal((await f.process()).state,'article_generated');assert.equal(f.ai.calls.length,1);assert.equal((await cfg(f.uid)).recentTopics.length,1);
});
check('The transactional publisher also rejects a seventh slot preceding six future reservations',async()=>{
 const f=await fixture();await f.process();const current=await cfg(f.uid),at=ms(current.nextSlotUTC),publicationReservations=Array.from({length:6},(_,i)=>({jobId:randomUUID(),at:new Date(at+(i+1)*2*3600000)}));await blogAutomationRef(db,f.uid).update({publicationReservations});f.advance(1100);await clearCooldown(f.uid);assert.equal((await f.process()).state,'skipped');assert.equal((await slots(f.uid))[0].error.code,'automation_daily_limit');assert.equal((await listPublishingJobs(db,f.uid)).jobs.length,0);
});
check('A delayed runner must not even create a Blogger draft after the automatic publication deadline',async()=>{
 const f=await fixture(),job=await queue(f);f.advance(ms(job.publishAtUTC)-f.now()+1);const result=await processPublishingJob(db,job.id,{uid:f.uid,send:f.send,now:f.now});assert.equal(result.job.error.code,'automation_slot_missed');assert.equal(f.calls.draft,0);assert.equal(f.calls.publish,0);assert.equal(result.job.remoteId,null);
});
check('An automatic draft retains its real post ID if the publication deadline passes before publish',async()=>{
 const f=await fixture(),job=await queue(f);await processPublishingJob(db,job.id,{uid:f.uid,send:f.send,now:f.now});f.advance(ms(job.publishAtUTC)-f.now()-5000);const result=await processPublishingJob(db,job.id,{uid:f.uid,send:f.send,now:f.now});assert.equal(result.job.error.code,'automation_slot_missed');assert.equal(result.job.remoteId,POST);assert.equal(f.calls.draft,1);assert.equal(f.calls.publish,0);
});
check('Explicit Retry cannot turn a paused automatic job into per-article approval or resume a mutation',async()=>{
 const f=await fixture(),job=await queue(f);await pause(f);await processPublishingJob(db,job.id,{uid:f.uid,send:f.send,now:f.now});await retryPublishingJob(db,f.uid,job.id,{reconfirmConnection:true},{now:f.now()});const result=await processPublishingJob(db,job.id,{uid:f.uid,send:f.send,now:f.now});assert.equal(result.job.error.code,'automation_authorization_changed');assert.equal(f.calls.draft,0);assert.equal(f.calls.publish,0);assert.equal(data(await db.collection('publish_jobs').doc(job.id).get()).reviewedAt,null);
});
check('Reconnected original Blogger grants do not inherit the previous recurring destination authority',async()=>{
 const f=await fixture(),job=await queue(f),revision=randomUUID();await connectionRef(db,f.uid,'blogger').update({revision});await accountRef(db,f.uid).collection('websites').doc(f.settings.websiteId).update({connection_revision:revision});await processPublishingJob(db,job.id,{uid:f.uid,send:f.send,now:f.now});await retryPublishingJob(db,f.uid,job.id,{reconfirmConnection:true},{now:f.now()});const result=await processPublishingJob(db,job.id,{uid:f.uid,send:f.send,now:f.now});assert.equal(result.job.error.code,'automation_authorization_changed');assert.equal(f.calls.draft,0);assert.equal(f.calls.publish,0);
});
check('Marker-bound uncertain-draft inspection after pause recovers the ID but cannot authorize publishing',async()=>{
 const f=await fixture({publishingOptions:{draft:async()=>{throw new AutomationError('network_error','Explicit local lost draft response',{uncertain:true});}}}),job=await queue(f),uncertain=await processPublishingJob(db,job.id,{uid:f.uid,send:f.send,now:f.now});assert.equal(uncertain.job.status,'needs_review');await pause(f);const inspection=await reviewPublishingJob(db,f.uid,job.id,{action:'verify',remoteId:POST,inspected:true},{now:f.now(),send:f.send});assert.equal(inspection.job.remoteId,POST);const result=await processPublishingJob(db,job.id,{uid:f.uid,send:f.send,now:f.now});assert.equal(result.job.error.code,'automation_authorization_changed');assert.equal(f.calls.draft,1);assert.equal(f.calls.publish,0);
});
