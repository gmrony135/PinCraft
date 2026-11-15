"use client";

import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ArrowRight,CalendarClock,CheckCircle2,ChevronDown,Clock3,Loader2,Pause,Play,Save} from 'lucide-react';
import {publishRequest} from './usePublisher';
import {defaultPublishingDestination} from '@/lib/publishing/composer-state.mjs';
import {CATEGORIES} from '@/lib/product.mjs';
import {BLOG_TREND_REGIONS,blogAutomationSettings,suggestedTimes} from '@/lib/publishing/blog-automation-policy.mjs';
import {EmptyState,ExternalLink,Feedback,fieldClass,primaryClass,secondaryClass,formatWhen} from '../workspace/WorkspaceUI';

const initialForm=()=>({bloggerConnectionId:'',websiteId:'',categoryIds:[],topic:'',language:'en',trendRegion:'BD',timezone:'Asia/Dhaka',dailyLimit:1,postingTimes:suggestedTimes(1)});
const stateLabels={select:'Finding a current topic',article:'Writing the article',images:'Saving the three required AI images',quality:'Editorial review pending',approved:'Preparing the Blogger job',queued:'Blogger job created — check Jobs for publication status',skipped:'Slot skipped',cancelled:'Stopped by owner or settings change'};

// Connector owns this model. Collapsing its editor never discards an uncertain
// request, and no second account loader or WorkspaceFrame is mounted here.
export function useBlogAutomation(publisher){
 const {user}=publisher,owner=useRef(null),sequence=useRef(0),operation=useRef(0),dirty=useRef(false),pending=useRef(null),saving=useRef(false),editRevision=useRef(null),observedRevision=useRef(undefined);
 owner.current=user?.id||null;
 const [snapshot,setSnapshot]=useState(null),[loading,setLoading]=useState(true),[form,setForm]=useState(initialForm),[consent,setConsent]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[uncertain,setUncertain]=useState(false);
 const load=useCallback(async({hydrate=false}={})=>{
  const uid=owner.current,id=++sequence.current;
  if(!uid){setSnapshot(null);setLoading(false);return;}
  try{
   const value=await publishRequest('automation');
   if(owner.current!==uid||sequence.current!==id)return;
   if(value.accountId!==uid)throw new Error('The saved settings owner could not be confirmed.');
   const nextRevision=value.automation?.revision||null;
   if(hydrate||observedRevision.current!==nextRevision)setConsent(false);
   observedRevision.current=nextRevision;setSnapshot(value);if(!pending.current)setError('');
   if(hydrate||!dirty.current){setForm(value.automation?.settings||initialForm());editRevision.current=nextRevision;dirty.current=false;}
  }catch(issue){if(owner.current===uid&&sequence.current===id)setError(issue.message);}
  finally{if(owner.current===uid&&sequence.current===id)setLoading(false);}
 },[]);
 useEffect(()=>{
  operation.current++;sequence.current++;pending.current=null;saving.current=false;dirty.current=false;editRevision.current=null;observedRevision.current=undefined;
  setSnapshot(null);setForm(initialForm());setConsent(false);setBusy('');setError('');setNotice('');setUncertain(false);setLoading(true);
  if(!publisher.authLoading)load({hydrate:true});
  const refresh=()=>{if(!document.hidden&&!saving.current)load();},timer=setInterval(refresh,60000);
  document.addEventListener('visibilitychange',refresh);
  return()=>{sequence.current++;clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
 },[publisher.authLoading,user?.id,load]);
 const data=snapshot&&user&&snapshot.accountId===user.id?snapshot:null,automation=data?.automation,locked=Boolean(busy)||uncertain;
 useEffect(()=>{
  if(!publisher.data||!data||locked||automation||dirty.current)return;
  setForm(previous=>{
   const next=defaultPublishingDestination(publisher.data,previous.bloggerConnectionId,previous.websiteId);
   return next.connectionId===previous.bloggerConnectionId&&next.websiteId===previous.websiteId?previous:{...previous,bloggerConnectionId:next.connectionId,websiteId:next.websiteId};
  });
 },[publisher.data,data,automation,locked]);
 function change(patch){if(saving.current||uncertain)return;dirty.current=true;setForm(previous=>({...previous,...patch}));setConsent(false);setNotice('');}
 let formIssue='';try{blogAutomationSettings(form);}catch(issue){formIssue=issue.message;}
 const readiness=data?.readiness,serverReady=Boolean(readiness?.textConfigured&&readiness?.imageDeliveryConfigured&&readiness?.workloadConfigured&&readiness?.bloggerConfigured),stale=Boolean(data&&(editRevision.current||null)!==(automation?.revision||null));
 const destinationReady=Boolean(publisher.data?.profiles?.some(p=>p.id===form.bloggerConnectionId&&p.provider==='blogger'&&p.connected)&&publisher.data?.websites?.some(s=>s.id===form.websiteId&&s.connectionId===form.bloggerConnectionId&&s.connected!==false&&!s.authorizationChanged));
 useEffect(()=>{setConsent(false);},[destinationReady]);
 async function persist(path,body,kind){
  if(!user)return publisher.openLogin();if(saving.current)return;
  const uid=user.id,op=++operation.current;saving.current=true;sequence.current++;setBusy(kind);setError('');setNotice('');pending.current={path,body,kind};
  try{
   const result=await publishRequest(path,{method:'POST',body});
   if(owner.current!==uid||operation.current!==op)return;
   if(result.accountId!==uid)throw new Error('The settings owner could not be confirmed. Refresh your account.');
   pending.current=null;setUncertain(false);dirty.current=false;setConsent(false);
   setNotice(kind==='pause'?'Recurring posts paused. New work is stopped; posts already scheduled inside Blogger remain there.':body.enabled?'Recurring posts enabled for these saved settings. Check Jobs for each article’s actual publication status.':'Settings saved in paused mode. No recurring generation or publication is authorized.');
   await load({hydrate:true});
  }catch(issue){
   if(owner.current!==uid||operation.current!==op)return;
   setError(issue.message);
   if(issue.status&&issue.status<500){pending.current=null;setUncertain(false);setConsent(false);if(issue.status===409)await load();}else setUncertain(true);
  }finally{if(owner.current===uid&&operation.current===op){saving.current=false;setBusy('');}}
 }
 function save(enabled){
  if(saving.current||uncertain||stale)return;
  if(formIssue||!destinationReady){setError(formIssue||'Choose a currently verified Blogger website above.');return;}
  if(enabled&&(!consent||!serverReady))return;
  persist('automation',{requestId:crypto.randomUUID(),expectedRevision:editRevision.current,settings:form,enabled,consent:enabled&&consent},enabled?'enable':'save');
 }
 function pause(){if(automation&&!locked)persist('automation/pause',{requestId:crypto.randomUUID(),expectedRevision:automation.revision},'pause');}
 function retry(){const saved=pending.current;if(saved&&!saving.current)persist(saved.path,saved.body,saved.kind);}
 return {data,automation,form,change,consent,setConsent,loading:loading||publisher.loading,locked,busy,error,notice,uncertain,stale,formIssue,destinationReady,serverReady,load,save,pause,retry};
}

export default function BlogAutomationSetup({publisher,model}){
 const [open,setOpen]=useState(false),{data,automation,form,change,consent,setConsent,loading,locked,busy,error,notice,uncertain,stale,formIssue,destinationReady,serverReady}=model;
 useEffect(()=>{setOpen(false);},[publisher.user?.id]);
 const sites=publisher.data?.websites||[],selectedSite=sites.find(s=>s.id===form.websiteId),profiles=publisher.data?.profiles||[];
 const runnerRecent=Date.parse(data?.heartbeat?.lastSeenAt||'')>Date.now()-45*60000;
 return <section id="blogger-recurring" aria-labelledby="blogger-recurring-heading" className="scroll-mt-24 border-t border-neutral-200 pt-6" data-testid="connector-recurring">
  <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><CalendarClock size={19} aria-hidden="true"/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 id="blogger-recurring-heading" className="text-[16px] font-extrabold">Recurring Blogger posts</h3><span data-testid="blog-automation-status" className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${data&&automation?.enabled?'bg-emerald-50 text-emerald-800':'bg-neutral-100 text-neutral-600'}`}>{!publisher.user?'Sign in to configure':!data?'Checking settings…':automation?.enabled?(runnerRecent?'Enabled':'Enabled · awaiting runner'):automation?'Paused':'Not configured'}</span></div><p className="mt-2 text-[12px] leading-relaxed text-neutral-500">Choose categories and a daily schedule. Once you explicitly enable it, the backend prepares and publishes articles without an open browser.</p>{automation?.nextSlotUTC&&<p className="mt-2 text-[11px] font-semibold text-neutral-700">Next planned slot: {formatWhen(automation.nextSlotUTC,automation.settings.timezone)} · {automation.settings.timezone}</p>}</div></div>
  <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={!publisher.user||loading||locked||!data} aria-expanded={open} aria-controls="blogger-recurring-editor" onClick={()=>setOpen(value=>!value)} className={secondaryClass}>{open?'Close settings':automation?'Edit recurring posts':'Set up recurring posts'}<ChevronDown size={14} aria-hidden="true" className={open?'rotate-180':''}/></button>{data&&automation?.enabled&&<button type="button" disabled={locked} onClick={model.pause} className={`${secondaryClass} !text-brand-700`}>{busy==='pause'?<Loader2 size={14} className="animate-spin" aria-hidden="true"/>:<Pause size={14} aria-hidden="true"/>}Pause recurring posts</button>}{publisher.user&&!data&&!loading&&<button type="button" disabled={locked} onClick={()=>model.load()} className={secondaryClass}>Retry saved settings</button>}</div>
  {publisher.user&&error&&<Feedback error>{error}</Feedback>}{publisher.user&&notice&&<Feedback>{notice}</Feedback>}
  {uncertain&&<div role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[12px] leading-relaxed text-amber-950"><p>The save response was not confirmed. Editing is locked to prevent a duplicate or unintended authorization. Retry the same request to confirm its saved result.</p><button type="button" disabled={Boolean(busy)} onClick={model.retry} className={`${secondaryClass} mt-3`}>Check or resume the same request</button></div>}
  <div id="blogger-recurring-editor">{open&&data&&<div className="mt-5 min-w-0 rounded-2xl border border-neutral-200 p-4 sm:p-5">
   <p className="text-[11px] leading-relaxed text-neutral-500">One recurring schedule per PinCraft account. Changes below do not take effect until saved; new active settings always require fresh authorization.</p>
   {stale&&<div role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-[11px] leading-relaxed text-amber-950"><p>The saved settings changed in another tab or request. Your unsaved edits have not overwritten them. Reload and review before saving again.</p><button type="button" disabled={locked} onClick={()=>model.load({hydrate:true})} className={`${secondaryClass} mt-3`}>Reload saved settings</button></div>}
   <fieldset disabled={locked||loading||stale} className="mt-5 min-w-0 space-y-6 disabled:opacity-60">
    <section className="space-y-4"><h4 className="text-[12px] font-extrabold uppercase tracking-wide text-neutral-800">1. Blog & content</h4>
     <label className="block text-[12px] font-bold">Blog for recurring posts<select aria-label="Automation verified blog" value={form.websiteId} onChange={e=>{const site=sites.find(s=>s.id===e.target.value);change({websiteId:site?.id||'',bloggerConnectionId:site?.connectionId||''});}} className={fieldClass}><option value="">Choose a verified blog</option>{form.websiteId&&!selectedSite&&<option value={form.websiteId} disabled>Saved blog — reconnect or re-verify above</option>}{sites.map(site=><option key={site.id} value={site.id} disabled={site.authorizationChanged||site.connected===false}>{site.name}{sites.length>1?' · '+(profiles.find(p=>p.id===site.connectionId)?.name||'Blogger'):''}{site.authorizationChanged?' · re-verify':site.connected===false?' · reconnect':''}</option>)}</select></label>
     <div><p className="text-[12px] font-bold">Content categories <span className="font-normal text-neutral-400">· choose 1–3</span></p><div className="mt-3 grid gap-2 sm:grid-cols-2">{CATEGORIES.map(category=><label key={category.id} className={`flex min-h-12 items-center gap-2.5 rounded-xl border p-3 text-[11px] leading-relaxed ${form.categoryIds.includes(category.id)?'border-brand-300 bg-brand-50':'border-neutral-200'}`}><input type="checkbox" aria-label={category.label} checked={form.categoryIds.includes(category.id)} disabled={!form.categoryIds.includes(category.id)&&form.categoryIds.length>=3} onChange={e=>change({categoryIds:e.target.checked?[...form.categoryIds,category.id]:form.categoryIds.filter(id=>id!==category.id)})} className="h-4 w-4 shrink-0 accent-[#E60023]"/><span className="font-semibold">{category.label}</span></label>)}</div></div>
     <label className="block text-[12px] font-bold">Topic focus <span className="font-normal text-neutral-400">(optional)</span><input aria-label="Automation topic focus" maxLength={120} value={form.topic} onChange={e=>change({topic:e.target.value})} placeholder="e.g. small apartments or balcony plants" className={fieldClass}/></label>
     <div className="grid gap-4 sm:grid-cols-2"><label className="text-[12px] font-bold">Article language<select aria-label="Automation article language" value={form.language} onChange={e=>change({language:e.target.value})} className={fieldClass}><option value="en">English</option><option value="bn">বাংলা · Bengali</option></select></label><label className="text-[12px] font-bold">Trend region<select aria-label="Automation trend region" value={form.trendRegion} onChange={e=>change({trendRegion:e.target.value})} className={fieldClass}>{BLOG_TREND_REGIONS.map(region=><option key={region}>{region}</option>)}</select></label></div>
    </section>
    <section className="space-y-4 border-t border-neutral-100 pt-5"><h4 className="text-[12px] font-extrabold uppercase tracking-wide text-neutral-800">2. Daily schedule</h4>
     <div className="grid gap-4 sm:grid-cols-2"><label className="text-[12px] font-bold">Audience timezone<input aria-label="Automation audience timezone" list="blog-automation-timezones" value={form.timezone} maxLength={100} onChange={e=>change({timezone:e.target.value})} className={fieldClass}/><datalist id="blog-automation-timezones">{['Asia/Dhaka','Asia/Kolkata','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Europe/London','Australia/Sydney','UTC'].map(zone=><option key={zone} value={zone}/>)}</datalist></label><label className="text-[12px] font-bold">Daily post ceiling<select aria-label="Automation daily post ceiling" value={form.dailyLimit} onChange={e=>{const dailyLimit=Number(e.target.value);change({dailyLimit,postingTimes:suggestedTimes(dailyLimit)});}} className={fieldClass}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>Up to {n} post{n===1?'':'s'}</option>)}</select></label></div>
     <div><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[12px] font-bold">Posting times</p><button type="button" className="min-h-11 text-[11px] font-bold text-brand-700" onClick={()=>change({postingTimes:suggestedTimes(form.dailyLimit)})}>Use suggested spread</button></div><div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">{form.postingTimes.map((time,index)=><label key={index} className="text-[11px] font-bold text-neutral-600">Slot {index+1}<input aria-label={'Automation posting time '+(index+1)} type="time" step={60} value={time} onChange={e=>change({postingTimes:form.postingTimes.map((t,i)=>i===index?e.target.value:t)})} className={fieldClass}/></label>)}</div><p className="mt-3 text-[10.5px] leading-relaxed text-neutral-500">At least one hour apart, in your chosen timezone. DST rules apply. Preparation can begin 90 minutes ahead; missed slots are not posted in a catch-up burst. Suggestions are not measured “best times.”</p></div>
    </section>
    <section className="border-t border-neutral-100 pt-5"><h4 className="text-[12px] font-extrabold uppercase tracking-wide text-neutral-800">3. Explicit permission</h4><label className="mt-4 flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50/40 p-4 text-[12px] leading-relaxed text-neutral-700"><input aria-label="Authorize recurring generation and Blogger publication" type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#E60023]"/><span><strong>I authorize recurring AI generation and Blogger publication for these settings.</strong> Future articles publish without my individual review, using my existing text and image AI allowances and the selected blog, categories, language and schedule. Each article requires three AI images; no image quota is increased. AI editorial checks are not verified fact-checking or plagiarism detection. No Pinterest posts are generated automatically. Three optimized WebP assets (up to 650 KB each) are stored in private image records and served through signed public HTTPS URLs for Blogger. Image storage and delivery use your available storage and data-transfer allowances; images are retained while public posts may reference them, so deleting them can break those posts.</span></label></section>
   </fieldset>
   {formIssue&&<p data-testid="automation-form-blocker" className="mt-4 text-[11px] font-semibold text-amber-800">{formIssue}</p>}
   {!destinationReady&&<p className="mt-3 text-[11px] leading-relaxed text-amber-800">Connect and verify your publishing blog in the account section above before saving.</p>}
   {!serverReady&&<p data-testid="automation-server-blocker" className="mt-4 rounded-xl bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">Enable is blocked until {[[data.readiness?.textConfigured,'live text AI'],[data.readiness?.imageDeliveryConfigured,'a stable HTTPS image origin and signing key'],[data.readiness?.workloadConfigured,'the guarded production scheduler'],[data.readiness?.bloggerConfigured,'Blogger OAuth/encrypted storage']].filter(([ok])=>!ok).map(([,label])=>label).join(', ')} is configured. Paused settings do not simulate readiness.</p>}
   <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap"><button type="button" disabled={locked||loading||stale||Boolean(formIssue)||!destinationReady||!consent||!serverReady} onClick={()=>model.save(true)} className={primaryClass}>{busy==='enable'?<Loader2 size={15} className="animate-spin" aria-hidden="true"/>:<Play size={15} aria-hidden="true"/>}{automation?.enabled?'Save & reauthorize recurring posts':'Enable recurring posts'}</button><button type="button" disabled={locked||loading||stale||Boolean(formIssue)||!destinationReady} onClick={()=>model.save(false)} className={secondaryClass}>{busy==='save'?<Loader2 size={15} className="animate-spin" aria-hidden="true"/>:<Save size={15} aria-hidden="true"/>}Save paused settings</button></div>
   <p className="mt-4 text-[10.5px] leading-relaxed text-neutral-500">Pause stops new generation and unsent Blogger actions. An in-flight request may finish; posts already scheduled in Blogger must be managed there. Nothing is deleted or unpublished.</p>
  </div>}</div>
  {publisher.user&&data&&<details className="mt-5 rounded-xl bg-neutral-50 p-4"><summary className="cursor-pointer text-[12px] font-bold text-neutral-700">Background status & recent activity</summary><div className="mt-4 space-y-4 text-[11px] leading-relaxed text-neutral-600">
   <p className="flex items-start gap-2"><Clock3 size={15} className="mt-0.5 shrink-0" aria-hidden="true"/><span>{data.heartbeat?.lastSeenAt?`Generator last checked ${formatWhen(data.heartbeat.lastSeenAt)} (${data.heartbeat.outcome}).`:'No generator check-in has been confirmed.'} {runnerRecent?'A recent check was observed.':'Configured does not mean an execution was observed.'} The scheduler is best effort and may be delayed.</span></p>
   <dl className="grid gap-2">{[['Live article AI',data.readiness?.textConfigured],['Durable article-image delivery',data.readiness?.imageDeliveryConfigured],['Guarded scheduler',data.readiness?.workloadConfigured],['Blogger server',data.readiness?.bloggerConfigured]].map(([label,ready])=><div key={label} className="flex justify-between gap-3"><dt>{label}</dt><dd className={ready?'font-bold text-emerald-700':'text-neutral-500'}>{ready?'Configured':'Not configured'}</dd></div>)}</dl>
   {automation?.lastOutcome&&<div className="rounded-lg border border-neutral-200 bg-white p-3"><p className="font-bold">Last outcome · {automation.lastOutcome.state.replaceAll('_',' ')} · {formatWhen(automation.lastOutcome.at)}</p><p className="mt-1">{automation.lastOutcome.message}</p>{automation.lastOutcome.error&&<p role="alert" className="mt-2 text-brand-700">{automation.lastOutcome.error.message}</p>}</div>}
   {data.usage&&<p>Today’s existing AI allowances: text <strong>{data.usage.used.text} / {data.usage.limits.text}</strong>, images <strong>{data.usage.used.image} / {data.usage.limits.image}</strong>. Each complete article consumes three image requests; no limits were raised. Article image requests share the same image quota as other PinCraft tools, so an exhausted limit means the slot is skipped with missing images—not a partial publication. Reset: {formatWhen(data.usage.resetAt,'UTC')} UTC.</p>}
   <p>The backend finds current category-relevant evidence and two to five relevant LIVE posts on your blog, creates a 1,000–1,600-word private draft plus its cover and two section images, then checks structure, duplication and an AI editorial score of at least 82/100. No suitable internal links, any missing image, or a failed gate means a saved draft and an explained skip, not a filler article. Scheduled articles omit external links entirely; source headlines remain topic signals, and no external-source review can pause a slot. Blogger receives signed public image URLs; image storage and delivery use your available service allowances. Assets are retained while published posts may use them. Only Blogger LIVE plus a public-page check yields a verified URL; the API is not claimed to set the SEO description.</p>
   {!data.slots?.length?<EmptyState Icon={CalendarClock} title="No recurring slots yet">Connecting an account or saving paused settings creates no automatic posts.</EmptyState>:<ul className="divide-y divide-neutral-200">{data.slots.map(slot=><li key={slot.id} className="min-w-0 py-4"><p className="break-words text-[12px] font-bold text-neutral-900">{slot.title||'Topic not selected yet'}</p><p className="mt-1">{stateLabels[slot.state]||slot.state} · {formatWhen(slot.publishAtUTC,automation?.settings.timezone)} {automation?.settings.timezone||''}</p>{(slot.imageCount||slot.internalLinkCount)>0&&<p className="mt-1 text-[10px] text-neutral-500">{slot.imageCount||0}/3 AI images saved · {slot.internalLinkCount||0} live internal links confirmed</p>}<div className="mt-2 flex flex-wrap gap-3">{slot.libraryDraftId&&<Link href={'/publish?draft='+encodeURIComponent(slot.libraryDraftId)} prefetch={false} className="inline-flex min-h-11 items-center gap-1 font-bold text-brand-700">Inspect draft<ArrowRight size={12} aria-hidden="true"/></Link>}{slot.jobId&&<Link href="/jobs" prefetch={false} className="inline-flex min-h-11 items-center gap-1 font-bold text-brand-700">Inspect Blogger job<ArrowRight size={12} aria-hidden="true"/></Link>}</div>{slot.error&&<p className="mt-2 break-words text-brand-700">{slot.error.message}</p>}{slot.evidence&&<details className="mt-3 rounded-lg border border-neutral-200 bg-white p-3"><summary className="cursor-pointer font-bold">Sources & editorial checks</summary><p className="mt-3 font-semibold">{slot.evidence.label} · {slot.evidence.region} · {formatWhen(slot.evidence.fetchedAt)}</p><p className="mt-2">{slot.evidence.limitations}</p><ul className="mt-3 space-y-3">{slot.evidence.sources.map(source=><li key={source.url}><p className="break-words">{source.title}</p><p>{source.publisher} · {formatWhen(source.publishedAt)}</p><ExternalLink href={source.url}>Open source</ExternalLink></li>)}</ul>{slot.editorialReview&&<div className="mt-3 border-t border-neutral-100 pt-3"><strong>{slot.editorialReview.passed?'Passed gates':'Did not pass'} · {slot.editorialReview.score??'unconfirmed'}/100</strong><p className="mt-2">{slot.editorialReview.summary}</p><p className="mt-2">{slot.editorialReview.limitations}</p></div>}</details>}</li>)}</ul>}
  </div></details>}
 </section>;
}
