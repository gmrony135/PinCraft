"use client";

import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ArrowRight,ArrowUpRight,CheckCircle2,ChevronDown,FileText,Globe,LoaderCircle,Pin,Plus,ShieldCheck,Trash2,X} from 'lucide-react';
import Modal from '../Modal';
import {usePublisher} from '../publishing/usePublisher';
import BlogAutomationSetup,{useBlogAutomation} from '../publishing/BlogAutomationSetup';
import {useWorkspace,WorkspaceFrame,Panel,EmptyState,ExternalLink,primaryClass,secondaryClass,fieldClass} from './WorkspaceUI';

export default function Connector(){
 const state=useWorkspace(),publisher=usePublisher(),recurring=useBlogAutomation(publisher),data=state.data;
 const [resources,setResources]=useState({}),[resourceBusy,setResourceBusy]=useState(''),[selection,setSelection]=useState({}),[confirmation,setConfirmation]=useState(null);
 const owner=useRef(null),connecting=useRef(false);owner.current=state.user?.id||null;
 useEffect(()=>{setResources({});setSelection({});setConfirmation(null);setResourceBusy('');connecting.current=false;},[state.user?.id]);
 useEffect(()=>{
  if(state.loading||!data)return;
  const query=new URLSearchParams(window.location.search),provider=query.get('integration'),result=query.get('result');
  if(!['blogger','pinterest'].includes(provider)||!result)return;
  const actual=data.profiles.some(p=>p.provider==='blogger'&&p.connected),messages={denied:'Permission was not granted. No Blogger connection was activated.',expired:'This authorization expired or was already used. Start Connect again.',sign_in_required:'Sign in again, then restart Blogger Connect.',setup_required:'Secure Blogger authorization is not configured yet.',subscription_required:'An approved subscription is required before adding another Google account.',connection_exists:'This account is already connected. Reconnect its existing connection.',publication_busy:'A reviewed publication is in flight. Wait until it finishes, then reconnect.'};
  if(provider==='blogger'&&result==='connected'&&actual)state.setNotice('Blogger access confirmed. Load your blogs and verify the website below.');
  else state.setError(messages[result]||'Authorization could not be confirmed. Pinterest remains manual.');
  query.delete('integration');query.delete('result');window.history.replaceState({},'',window.location.pathname+(query.size?'?'+query:'')+window.location.hash);
 },[state.loading,data]);
 async function connect(connectionId,addNew=false){
  if(!state.user)return state.openLogin();
  if(connecting.current||state.busy||resourceBusy||recurring.locked)return;
  const uid=state.user.id;connecting.current=true;state.setBusy('connect');state.setError('');state.setNotice('');
  try{
   const response=await fetch('/api/integrations/blogger/start',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({...(connectionId?{connectionId}:{}),addNew})}),result=await response.json();
   if(owner.current!==uid)return;
   if(!response.ok)throw new Error(result.error||'Blogger authorization could not be started.');
   const url=new URL(result.authorizationUrl);
   if(url.protocol!=='https:'||url.hostname!=='accounts.google.com')throw new Error('The Google consent destination could not be verified.');
   window.location.assign(url.href);
  }catch(issue){if(owner.current===uid)state.setError(issue.message);}
  finally{if(owner.current===uid){connecting.current=false;state.setBusy('');}}
 }
 async function loadBlogs(profile,cursor=null){
  if(!state.user||resourceBusy||state.busy||recurring.locked)return;
  const uid=state.user.id;setResourceBusy(profile.id);state.setError('');
  try{
   const query=new URLSearchParams({connectionId:profile.id});if(cursor)query.set('cursor',cursor);
   const response=await fetch('/api/integrations/blogger/resources?'+query,{credentials:'same-origin',cache:'no-store'}),result=await response.json();
   if(owner.current!==uid)return;
   if(!response.ok)throw new Error(result.error||'Your owned Blogger websites could not be loaded.');
   setResources(old=>({...old,[profile.id]:{...result,items:cursor?[...new Map([...(old[profile.id]?.items||[]),...result.items].map(item=>[item.id,item])).values()]:result.items}}));
  }catch(issue){if(owner.current===uid)state.setError(issue.message);}
  finally{if(owner.current===uid)setResourceBusy('');}
 }
 const profiles=data?.profiles.filter(p=>p.provider==='blogger')||[],legacyPinterest=data?.profiles.filter(p=>p.provider==='pinterest')||[];
 const capability=publisher.data?.providers.blogger||data?.infrastructure?.oauth.blogger,disabled=Boolean(state.busy||resourceBusy||recurring.locked),limits=data?.billing?.subscription?.limits||{websites:1},full=profiles.length>=limits.websites;
 const unlinkedSites=(data?.websites||[]).filter(site=>!profiles.some(profile=>profile.id===site.connectionId));
 const frameState={...state,error:state.error||publisher.error,busy:state.busy||resourceBusy||recurring.busy||(recurring.uncertain?'confirming saved settings':''),refresh:()=>{if(disabled)return;state.refresh();publisher.refresh();recurring.load();}};
 function websiteRow(site){
  const ready=site.connected&&!site.authorizationChanged;
  return <li key={site.id} className="flex min-w-0 flex-col justify-between gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center"><div className="min-w-0"><h4 className="break-words text-[12px] font-extrabold">{site.name}</h4><div className="break-all text-[11px]"><ExternalLink href={site.url}>{site.url}</ExternalLink></div><p className={`mt-1 text-[10.5px] ${ready?'text-emerald-700':'text-brand-700'}`}>{!site.connected?'Reconnect this account to continue':site.authorizationChanged?'Load your blogs and re-verify after reconnecting':'Owned blog verified'}</p></div><div className="flex shrink-0 flex-wrap gap-2">{ready&&<Link href={`/publish?website=${encodeURIComponent(site.id)}`} prefetch={false} className={secondaryClass}>Publish article<ArrowRight size={13} aria-hidden="true"/></Link>}<button type="button" disabled={disabled} onClick={()=>setConfirmation({kind:'website',site,ownerId:state.user.id})} aria-label={`Remove website ${site.name}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-neutral-200 text-neutral-400 hover:text-brand-700 disabled:opacity-50"><Trash2 size={15} aria-hidden="true"/></button></div></li>;
 }
 return <WorkspaceFrame state={frameState} eyebrow="Connector" title="Connect once. You’re in control." description="Blogger permissions and recurring posts live here. Publish a single reviewed article whenever you need; keep Pinterest uploads manual.">
  <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
   <Panel title="Blogger" description="Authorize your Google account, then choose a blog you administer.">
    {profiles.length>0?<ul className="mt-5 space-y-4">{profiles.map(profile=>{
     const sites=(data?.websites||[]).filter(site=>site.connectionId===profile.id);
     return <li key={profile.id} className="min-w-0 rounded-2xl border border-neutral-200 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-700"><FileText size={20} aria-hidden="true"/></span><div className="min-w-0"><h3 className="break-words text-[13px] font-extrabold">{profile.name||'Blogger account'}</h3><p className={`mt-1.5 flex items-center gap-1.5 text-[10.5px] font-bold ${profile.connected?'text-emerald-700':'text-brand-700'}`}>{profile.connected&&<CheckCircle2 size={13} aria-hidden="true"/>}{profile.connected?'Connected · offline access saved':'Reconnect required'}</p></div></div></div>
      {profile.lastError&&<p className="mt-3 text-[11px] leading-relaxed text-brand-700">{profile.lastError}</p>}
      <div className="mt-4 flex flex-wrap items-start gap-2">{profile.connected?<button type="button" disabled={disabled} onClick={()=>loadBlogs(profile)} className={secondaryClass}>{resourceBusy===profile.id?<LoaderCircle size={14} className="animate-spin" aria-hidden="true"/>:<Globe size={14} aria-hidden="true"/>}{sites.some(site=>site.authorizationChanged)?'Load blogs to re-verify':'Load my blogs'}</button>:<button type="button" disabled={disabled||!capability?.configured} onClick={()=>connect(profile.id)} className={primaryClass}>Reconnect Blogger<ArrowUpRight size={13} aria-hidden="true"/></button>}
       <details className="group"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-[11px] font-bold text-neutral-500 hover:bg-neutral-50">Manage permission<ChevronDown size={13} aria-hidden="true" className="group-open:rotate-180"/></summary><div className="max-w-sm space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-[11px] leading-relaxed text-neutral-600"><p>Google’s Blogger publishing scope lets PinCraft read and manage this account’s blogs and posts. Encrypted offline access supports saved jobs while your browser is closed. Connecting alone never authorizes a post.</p><div className="flex flex-wrap gap-2">{profile.connected&&<button type="button" disabled={disabled||!capability?.configured} onClick={()=>connect(profile.id)} className={secondaryClass}>Reconnect Blogger</button>}<button type="button" disabled={disabled} onClick={()=>setConfirmation({kind:'connection',profile,ownerId:state.user.id})} className={`${secondaryClass} !text-brand-700`}>Disconnect</button></div></div></details>
      </div>
      {resources[profile.id]&&<div className="mt-4 border-t border-neutral-100 pt-4">{resources[profile.id].items.length?<form onSubmit={async event=>{event.preventDefault();if(await state.mutate({connectionId:profile.id,blogId:selection[profile.id]},'Blogger website verified. You can publish a reviewed article or separately configure recurring posts below.','/api/publish/websites')){setSelection(old=>({...old,[profile.id]:''}));publisher.refresh();}}}><label className="block text-[11.5px] font-bold">Your live Blogger websites<select aria-label="Your live Blogger websites" required value={selection[profile.id]||''} onChange={event=>setSelection(old=>({...old,[profile.id]:event.target.value}))} className={fieldClass}><option value="">Choose an owned website</option>{resources[profile.id].items.map(blog=><option key={blog.id} value={blog.id}>{blog.name}</option>)}</select></label><button disabled={disabled||!selection[profile.id]} className={`${primaryClass} mt-3`}><Plus size={14} aria-hidden="true"/>Verify & add website</button></form>:<p className="text-[11px] leading-relaxed text-neutral-500">No live blogs with administrator access were returned on this page. Check the Google account you authorized.</p>}{resources[profile.id].nextCursor&&<button type="button" disabled={disabled} onClick={()=>loadBlogs(profile,resources[profile.id].nextCursor)} className={`${secondaryClass} mt-3`}>Load more blogs</button>}</div>}
      {sites.length>0&&<ul aria-label={`Verified blogs for ${profile.name||'Blogger account'}`} className="mt-5 divide-y divide-neutral-100 border-t border-neutral-100 pt-4">{sites.map(websiteRow)}</ul>}
     </li>;
    })}</ul>:<EmptyState Icon={FileText} title="No Blogger account connected">Use Google’s official consent screen. Your PinCraft sign-in is separate from Blogger publishing permission.</EmptyState>}
    {unlinkedSites.length>0&&<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="mb-3 text-[11px] font-bold text-amber-900">These saved websites need a connected Blogger account.</p><ul className="divide-y divide-amber-100">{unlinkedSites.map(websiteRow)}</ul></div>}
    <div className="mt-5">{full&&profiles.length>0?<Link href="/subscription" prefetch={false} className="inline-flex min-h-11 items-center gap-2 text-[11px] font-bold text-neutral-500">Plan capacity: {limits.websites} website{limits.websites===1?'':'s'} · additional sites<ArrowRight size={13} aria-hidden="true"/></Link>:<button type="button" disabled={disabled||Boolean(state.user)&&!capability?.configured} onClick={()=>connect(undefined,profiles.length>0)} className={primaryClass}><Plus size={15} aria-hidden="true"/>{profiles.length?'Add Blogger account':'Connect Blogger'}<ArrowUpRight size={13} aria-hidden="true"/></button>}</div>
    {!capability?.configured&&publisher.user&&!publisher.loading&&<p className="mt-3 text-[11px] leading-relaxed text-amber-800">Blogger’s secure Google authorization is not configured on this deployment. No connection will be claimed until real consent succeeds.</p>}
    <p className="mb-6 mt-3 text-[10.5px] leading-relaxed text-neutral-500">For a one-off post, use <strong>Publish article</strong> beside your blog, then review and choose <strong>Publish now</strong> or <strong>Schedule</strong>. No recurring permission is needed.</p>
    <BlogAutomationSetup publisher={publisher} model={recurring}/>
   </Panel>
   <div className="min-w-0 space-y-5">
    <Panel title="Pinterest · manual upload" description="Create in PinCraft. Upload or schedule in Pinterest itself.">
     <div className="mt-5 flex items-center gap-3 rounded-xl bg-brand-50 p-4 text-[12px] font-bold text-brand-800"><Pin size={20} className="shrink-0" aria-hidden="true"/>No Pinterest API connection required</div>
     <ol className="mt-5 space-y-4 text-[12px] leading-relaxed text-neutral-600">{[['Prepare your Pin','Use Pin Generator for copy and the artwork tool for an image.'],['Add the live article link','Optional Blogger-linked packs appear in Jobs only after the article is verified public.'],['Upload or schedule yourself','Sign in on Pinterest, select your board and use its native scheduler if available.']].map(([title,copy],index)=><li key={title} className="flex items-start gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-[10px] font-extrabold text-neutral-500">{index+1}</span><div><strong className="text-neutral-900">{title}</strong><p className="mt-1">{copy}</p></div></li>)}</ol>
     <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2"><ExternalLink href="https://www.pinterest.com/">Open Pinterest yourself</ExternalLink><Link href="/jobs" prefetch={false} className="inline-flex min-h-11 items-center gap-1 text-[11px] font-bold text-neutral-600">My manual Pin packs<ArrowRight size={13} aria-hidden="true"/></Link></div>
     <p className="mt-3 text-[10.5px] leading-relaxed text-neutral-500">A Pin target time is only a reminder. PinCraft does not log in, upload or schedule Pins for you; a URL you enter later is user-reported, not API-verified.</p>
     {legacyPinterest.length>0&&<div className="mt-5 border-t border-neutral-200 pt-4"><p className="text-[11px] leading-relaxed text-neutral-500">Older API permissions are not used. Remove the saved connection below, then check Pinterest’s Apps settings for remote revocation.</p>{legacyPinterest.map(profile=><button key={profile.id} type="button" disabled={disabled} onClick={()=>setConfirmation({kind:'connection',profile,ownerId:state.user.id})} className={`${secondaryClass} mt-3`}>Disconnect old saved permission</button>)}</div>}
    </Panel>
    <div className="flex items-start gap-3 rounded-2xl border border-neutral-200 p-5"><ShieldCheck size={20} className="mt-0.5 shrink-0 text-brand-600" aria-hidden="true"/><p className="text-[11px] leading-relaxed text-neutral-500">Only official Google consent is used for Blogger. Never share passwords, OTPs, wallet PINs or browser session files. Disconnect removes saved access, not published content.</p></div>
   </div>
  </div>
  {confirmation&&confirmation.ownerId===state.user?.id&&<Modal titleId="connector-confirm-title" onClose={()=>!state.busy&&setConfirmation(null)}><div className="relative p-6 sm:p-8"><button type="button" aria-label="Close confirmation" onClick={()=>setConfirmation(null)} disabled={Boolean(state.busy)} className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-xl text-neutral-500"><X size={18} aria-hidden="true"/></button><h2 id="connector-confirm-title" className="pr-8 text-[22px] font-extrabold">{confirmation.kind==='website'?'Remove this website?':'Disconnect this account?'}</h2><p className="mt-4 text-[12px] leading-relaxed text-neutral-600">Saved tokens are deleted on disconnect. Future jobs stop or require reconnection; an already-sent request may finish. Posts already scheduled in Blogger remain there. No published content is deleted. Remote revocation is reported only if confirmed.</p><div className="mt-6 flex flex-col gap-2 sm:flex-row"><button disabled={Boolean(state.busy)} type="button" className={primaryClass} onClick={async()=>{const ok=confirmation.kind==='website'?await state.mutate({action:'remove_website',id:confirmation.site.id,confirm:true},'Website removed. Future jobs cannot publish to it.'):await state.mutate({confirm:true,connectionId:confirmation.profile.id},'Saved permission removed locally. Check the service’s account permissions to confirm remote revocation.',`/api/integrations/${confirmation.profile.provider}/disconnect`);if(ok){setConfirmation(null);publisher.refresh();recurring.load();}}}>Confirm {confirmation.kind==='website'?'removal':'disconnect'}</button><button type="button" disabled={Boolean(state.busy)} className={secondaryClass} onClick={()=>setConfirmation(null)}>Cancel</button></div></div></Modal>}
 </WorkspaceFrame>;
}
