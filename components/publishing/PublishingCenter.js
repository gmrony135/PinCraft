"use client";

import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {ArrowRight,BookOpen,CheckCircle2,Clock3,FileText,Loader2,ShieldCheck} from 'lucide-react';
import {usePublisher} from './usePublisher';
import PublishComposer from './PublishComposer';
import {articleToHTML} from '@/lib/publishing/review-content.mjs';
import {articleHTML} from '@/lib/publishing/article-format.mjs';
import {WorkspaceFrame,Panel,Feedback,fieldClass,primaryClass,secondaryClass,formatWhen} from '../workspace/WorkspaceUI';

// This is only an entrypoint to the existing reviewed publishing contract.
// Loading a draft, pasting text and opening review NEVER save/publish a job.
export default function PublishingCenter(){
 const publisher=usePublisher(),{user,data}=publisher,params=useSearchParams();
 const requestedDraft=params.get('draft')||'',preferredWebsiteId=params.get('website')||'';
 const owner=useRef(null),sequence=useRef(0);owner.current=user?.id||null;
 const [source,setSource]=useState(requestedDraft?'library':'paste');
 const [input,setInput]=useState(null),[chosen,setChosen]=useState(null),[prepared,setPrepared]=useState(null),[error,setError]=useState('');
 const [library,setLibrary]=useState(null),[libraryBusy,setLibraryBusy]=useState(false),[libraryError,setLibraryError]=useState('');
 const form=user&&input?.owner===user.id?input:{title:'',body:''};
 const article=user&&prepared?.owner===user.id?prepared.article:null;
 const drafts=user&&library?.owner===user.id?library.items:[],cursor=user&&library?.owner===user.id?library.nextCursor:null;
 const selectedDraft=user&&chosen?.owner===user.id?chosen.id:requestedDraft;
 const loadLibrary=useCallback(async(nextCursor=null)=>{
  const uid=owner.current,seq=++sequence.current;if(!uid)return;
  setLibraryBusy(true);setLibraryError('');
  try{
   const response=await fetch('/api/library'+(nextCursor?'?cursor='+encodeURIComponent(nextCursor):''),{credentials:'same-origin',cache:'no-store'}),result=await response.json();
   if(owner.current!==uid||sequence.current!==seq)return;
   if(!response.ok||!result.ready)throw new Error(result.error||result.message||'Your private article drafts could not be loaded.');
   const items=(result.items||[]).filter(row=>row.kind==='article_draft'&&row.content?.title);
   setLibrary(previous=>({owner:uid,items:nextCursor&&previous?.owner===uid?[...new Map([...previous.items,...items].map(row=>[row.id,row])).values()]:items,nextCursor:result.nextCursor||null}));
  }catch(issue){if(owner.current===uid&&sequence.current===seq)setLibraryError(issue.message||'Your private drafts could not be loaded.');}
  finally{if(owner.current===uid&&sequence.current===seq)setLibraryBusy(false);}
 },[]);
 useEffect(()=>{sequence.current++;setInput(null);setChosen(null);setPrepared(null);setLibrary(null);setError('');setLibraryError('');setLibraryBusy(false);if(!publisher.authLoading&&user)loadLibrary();return()=>{sequence.current++;};},[publisher.authLoading,user?.id,loadLibrary]);
 useEffect(()=>{
  // Only the signed-in owner's fetched Library response can resolve this hint.
  if(!requestedDraft||article||!user||library?.owner!==user.id)return;
  const row=drafts.find(item=>item.id===requestedDraft);if(!row)return;
  try{articleHTML(articleToHTML(row.content));setPrepared({owner:user.id,article:{...row.content,id:row.id}});setSource('library');}catch(issue){setError(issue.message);}
 },[requestedDraft,library,article,user?.id]);
 function prepare(event){
  event.preventDefault();setError('');if(!user)return publisher.openLogin();
  try{
   let value;
   if(source==='library'){
    const row=drafts.find(item=>item.id===selectedDraft);if(!row)throw new Error('Choose your saved article draft, or paste the complete article.');
    value={...row.content,id:row.id};
   }else{
    if(!form.title.trim()||form.title.trim().length>200)throw new Error('Enter your article title, up to 200 characters.');
    if(!form.body.trim())throw new Error('Paste your complete article. No example or generated substitute will be published.');
    value={id:crypto.randomUUID(),title:form.title.trim(),plainText:form.body,description:form.body.replace(/\s+/g,' ').slice(0,320)};
   }
   articleHTML(articleToHTML(value));setPrepared({owner:user.id,article:value});
  }catch(issue){setError(issue.message);}
 }
 const profiles=(data?.profiles||[]).filter(p=>p.connected),sites=(data?.websites||[]).filter(s=>s.connected!==false&&!s.authorizationChanged);
 const seen=data?.cron?.lastSeenAt,runnerRecent=Boolean(seen&&Date.now()-Date.parse(seen)<45*60000);
 const state={...publisher,refresh:()=>{publisher.refresh();if(user)loadLibrary();}};
 return <WorkspaceFrame state={state} eyebrow="Publish article" title="Connect. Review. Publish." description="Publish your own complete article to your verified Blogger website, now or on a schedule. This page does not generate replacement content or publish just because a website was connected." action={<Link href="/jobs" prefetch={false} className={secondaryClass}>Jobs & manual Pin packs<ArrowRight size={14}/></Link>}>
  <div className="grid gap-3 sm:grid-cols-3" data-testid="publishing-connection-readiness">
   <section className="rounded-2xl border border-neutral-200 bg-white p-4"><ShieldCheck size={19} className="text-brand-600"/><h2 className="mt-3 text-[12px] font-extrabold">Blogger authorization</h2><p className="mt-2 text-[11px] leading-relaxed text-neutral-600">{data?`${profiles.length} connected account(s)`:'Sign in to check your account.'}</p></section>
   <section className="rounded-2xl border border-neutral-200 bg-white p-4"><CheckCircle2 size={19} className="text-brand-600"/><h2 className="mt-3 text-[12px] font-extrabold">Verified publishing website</h2><p className="mt-2 text-[11px] leading-relaxed text-neutral-600">{data?`${sites.length} ready website(s)`:'No connection state assumed.'}</p><Link href="/connector" prefetch={false} className="mt-2 inline-flex min-h-11 items-center text-[11px] font-bold text-brand-700">{sites.length?'View connection':'Connect or re-verify Blogger'}</Link></section>
   <section className="rounded-2xl border border-neutral-200 bg-white p-4"><Clock3 size={19} className="text-brand-600"/><h2 className="mt-3 text-[12px] font-extrabold">Background runner</h2><p className="mt-2 text-[11px] leading-relaxed text-neutral-600">{seen?`Last check: ${formatWhen(seen)} (${data.cron.lastOutcome}).`:'No actual runner heartbeat confirmed.'}</p><p className="mt-2 text-[10.5px] leading-relaxed text-neutral-500">{runnerRecent?'Recent check observed.':'A stale or absent check is not proof that cron is running.'} Saved jobs can continue with the browser closed; GitHub cron is best effort.</p></section>
  </div>
  {!article?<Panel className="mt-6" title="1. Choose the actual article" description="Paste existing text or load a private saved draft. The next screen is review only; nothing is published yet.">
   <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Article source"><button type="button" aria-pressed={source==='paste'} onClick={()=>{setSource('paste');setError('');}} className={source==='paste'?primaryClass:secondaryClass}><FileText size={15}/>Paste existing article</button><button type="button" aria-pressed={source==='library'} onClick={()=>{setSource('library');setError('');}} className={source==='library'?primaryClass:secondaryClass}><BookOpen size={15}/>Saved Cloud Library</button></div>
   <form onSubmit={prepare} className="mt-5 space-y-4">
    {source==='paste'?<><label className="block text-[12px] font-bold">Article title<input aria-label="Existing article title" value={form.title} maxLength={200} onChange={e=>setInput({owner:user?.id,title:e.target.value,body:form.body})} className={fieldClass}/></label><label className="block text-[12px] font-bold">Complete article text<textarea aria-label="Complete existing article" rows={14} value={form.body} maxLength={60000} onChange={e=>setInput({owner:user?.id,title:form.title,body:e.target.value})} className={fieldClass}/><span className="mt-2 block text-[11px] font-normal leading-relaxed text-neutral-500">Plain text or simple Markdown headings/lists. Text is safely formatted, not treated as executable HTML. You can review/edit the exact HTML next.</span></label></>:<>
     {libraryBusy&&<p role="status" className="flex items-center gap-2 text-[12px] text-neutral-500"><Loader2 size={15} className="animate-spin"/>Loading your saved articles…</p>}
     {libraryError&&<Feedback error>{libraryError}<button type="button" onClick={()=>loadLibrary()} className={`${secondaryClass} ml-2`}>Retry draft loading</button></Feedback>}
     {drafts.length?<label className="block text-[12px] font-bold">Private article draft<select aria-label="Saved article draft" value={selectedDraft} onChange={e=>setChosen({owner:user?.id,id:e.target.value})} className={fieldClass}><option value="">Choose a saved article</option>{drafts.map(row=><option key={row.id} value={row.id}>{row.content.title}</option>)}</select></label>:!libraryBusy&&<p className="rounded-xl bg-neutral-50 p-4 text-[12px] leading-relaxed text-neutral-600">No article drafts loaded from your Cloud Library. Paste your real article instead, or use the existing Article Writer and save its result. No sample articles are inserted.</p>}
     {requestedDraft&&!drafts.some(row=>row.id===requestedDraft)&&!libraryBusy&&<p className="text-[11px] leading-relaxed text-neutral-500">The requested draft is not in your loaded private articles. Load more if available; a different owner’s draft is never opened.</p>}
     {cursor&&<button type="button" disabled={libraryBusy} onClick={()=>loadLibrary(cursor)} className={secondaryClass}>Load more private drafts</button>}
    </>}
    {error&&<Feedback error>{error}</Feedback>}
    <div className="flex flex-wrap gap-3"><button type="submit" disabled={publisher.authLoading} className={primaryClass}>Review this article<ArrowRight size={15}/></button><Link href="/article-writer" prefetch={false} className={secondaryClass}>Open existing Article Writer</Link></div>
   </form>
  </Panel>:<>
   <p className="mt-6 rounded-xl border border-neutral-200 bg-white p-4 text-[12px] leading-relaxed text-neutral-600"><strong className="text-neutral-900">2. Review & authorize your content.</strong> Your article is loaded below. A single available owned blog is selected for you, but publication still requires your explicit review. Pin artwork stays on your own device. <Link href="/jobs" prefetch={false} className="font-bold text-brand-700 underline">Check existing Jobs before starting another submission.</Link></p>
   <PublishComposer key={`${user?.id}:${article.id}`} article={article} initialOpen preferredWebsiteId={preferredWebsiteId}/>
  </>}
 </WorkspaceFrame>;
}
