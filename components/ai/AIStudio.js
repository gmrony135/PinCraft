"use client";

import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ArrowRight,Download,Loader2,RefreshCw,ShieldCheck,Sparkles} from 'lucide-react';
import {useAuth} from '../providers/AppProvider';
import {generateWithAI} from '@/lib/ai-client';
import CopyButton from '../CopyButton';
import ImageGenerator from './ImageGenerator';
import {GenerationReceipt} from './GenerationMode';

const field='mt-2 min-h-12 w-full min-w-0 rounded-xl border border-neutral-300 bg-white px-3.5 py-3 text-[16px] outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-50 disabled:bg-neutral-50 sm:text-[14px]';
function resultText(output) {
  if (!output) return '';
  const r = output.result;
  const body = output.task === 'keywords' ? [...r.groups.flatMap(group => [group.name, `Intent: ${group.intent}`, group.keywords.join(', '), '']), 'Hashtags', r.hashtags.join(' ')]
    : output.task === 'plan' ? r.days.flatMap(day => [`Day ${day.day}: ${day.topic}`, `Pin: ${day.pinTitle}`, `Article: ${day.articleTitle}`, `Keywords: ${day.keywords.join(', ')}`, day.hashtags.join(' '), ''])
    : [`Editorial score: ${r.score}/100 (not a search ranking)`, r.summary, '', ...r.checks.flatMap(check => [`${check.label} — ${check.status}`, check.detail, '']), 'Suggested title', r.improvedTitle, '', 'Suggested description', r.improvedDescription, '', r.hashtags.join(' ')];
  return ['PinCraft · AI-generated draft', '', ...body, '', r.note].join('\n');
}
export default function AIStudio({tool,initialUseCase='pin'}){
 const task=tool.id,{user,authLoading,openLogin}=useAuth();
 const [status,setStatus]=useState(null),[statusError,setStatusError]=useState(false),[statusVersion,setStatusVersion]=useState(0);
 const [topic,setTopic]=useState(''),[content,setContent]=useState(''),[language,setLanguage]=useState('en'),[useCase,setUseCase]=useState(initialUseCase);
 const [busy,setBusy]=useState(false),[imageBusy,setImageBusy]=useState(false),[error,setError]=useState(''),[output,setOutput]=useState(null);
 const [usage,setUsage]=useState(null),[usageError,setUsageError]=useState(''),[usageLoading,setUsageLoading]=useState(false);
 const owner=useRef(null),sequence=useRef(0),controller=useRef(null);owner.current=user?.id||null;
 useEffect(()=>{
  const abort=new AbortController();setStatusError(false);
  fetch('/api/ai/status',{cache:'no-store',signal:abort.signal}).then(response=>{if(!response.ok)throw new Error();return response.json();}).then(setStatus).catch(issue=>{if(issue.name!=='AbortError')setStatusError(true);});
  return()=>abort.abort();
 },[statusVersion]);
 const refreshUsage=useCallback(async()=>{
  const account=owner.current;if(!account)return;setUsageLoading(true);
  try{const response=await fetch('/api/ai/usage',{cache:'no-store',credentials:'same-origin'}),data=await response.json();if(owner.current!==account)return;if(!response.ok)throw new Error();setUsage(data);setUsageError('');}
  catch{if(owner.current===account)setUsageError('Usage could not be refreshed. Daily limits are still enforced. Try again.');}
  finally{if(owner.current===account)setUsageLoading(false);}
 },[]);
 useEffect(()=>{
  sequence.current++;controller.current?.abort();setBusy(false);setOutput(null);setTopic('');setContent('');setError('');setUsage(null);setUsageError('');setUsageLoading(false);if(user)refreshUsage();
  return()=>{sequence.current++;controller.current?.abort();};
 },[user?.id,refreshUsage]);
 async function generate(event){
  event.preventDefault();if(busy||authLoading)return;if(!user)return openLogin();
  if((task!=='quality'||topic.trim())&&topic.trim().length<3){setError('Enter a topic with at least 3 non-space characters.');return;}
  if(task==='quality'&&content.trim().length<40){setError('Enter at least 40 non-space characters to review.');return;}
  const account=user.id,request=++sequence.current;controller.current=new AbortController();setBusy(true);setError('');setOutput(null);
  try{const result=await generateWithAI(task,task==='quality'?{content:content.trim(),...(topic.trim()?{topic:topic.trim()}:{}),language}:{topic:topic.trim(),language},{signal:controller.current.signal});if(owner.current===account&&request===sequence.current)setOutput(result);}
  catch(issue){if(issue.name!=='AbortError'&&owner.current===account&&request===sequence.current)setError(issue.message);}
  finally{if(request===sequence.current){setBusy(false);refreshUsage();}}
 }
 const available=status&&(task==='image'?status.imageConfigured:status.textConfigured),exported=resultText(output);
 return <div className="container-x pb-14 pt-7 sm:pb-20 sm:pt-10" data-testid="studio-tool" data-tool={task}>
  <nav aria-label="Breadcrumb" className="flex min-h-11 items-center gap-2 text-[12px] text-neutral-500"><Link href="/content-studio" prefetch={false} className="font-semibold hover:text-brand-700">Content Studio</Link><span aria-hidden="true">/</span><span aria-current="page">{tool.label}</span></nav>
  <header className="mt-4"><h1 className="text-[34px] font-extrabold leading-tight tracking-[-0.04em] sm:text-[44px]">{tool.label}</h1><p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-neutral-500">{tool.description}</p><div className="mt-3 flex flex-wrap items-center gap-3"><p className={`flex items-center gap-1.5 text-[11px] font-semibold ${available?'text-emerald-700':'text-neutral-500'}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${available?'bg-emerald-500':'bg-neutral-300'}`}/>{status?available?'Available to request':'Temporarily unavailable':statusError?'Status unavailable':'Checking availability…'}</p>{statusError&&<button type="button" onClick={()=>setStatusVersion(value=>value+1)} className="inline-flex min-h-11 items-center gap-1.5 text-[11px] font-bold text-brand-700"><RefreshCw size={12} aria-hidden="true"/>Retry status</button>}</div></header>
  {!authLoading&&!user&&<div className="mt-5 flex flex-col justify-between gap-3 rounded-2xl border border-brand-100 bg-brand-50/40 p-4 sm:flex-row sm:items-center"><p className="max-w-xl text-[12px] leading-relaxed text-neutral-700">A verified account is required for live AI. Sign in with Email/Password or Google; daily allowances apply.</p><button type="button" onClick={openLogin} className="btn-primary shrink-0 !min-h-11 !px-4 !text-[12px]">Sign in / Create account</button></div>}
  <div className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
   <div className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
    <div>
     {task==='image'?<div className="space-y-4"><label className="block text-[12px] font-bold text-neutral-700">Image format<select aria-label="Image format" value={useCase} disabled={imageBusy} onChange={event=>setUseCase(event.target.value)} className={field}><option value="pin">Pinterest Pin · 1000 × 1500</option><option value="featured">Blog featured image · 1200 × 630</option></select></label><ImageGenerator initialPrompt="" useCase={useCase} editable onUsageChange={refreshUsage} onBusyChange={setImageBusy}/></div>:<form onSubmit={generate} className="space-y-4" aria-label={tool.label} aria-busy={busy}>
      <label className="block text-[12px] font-bold text-neutral-700">{task==='quality'?'Topic (optional)':'Topic or niche'}<input required={task!=='quality'} minLength={3} maxLength={160} value={topic} onChange={event=>setTopic(event.target.value)} disabled={busy} placeholder="Balcony gardening for small apartments" className={field}/></label>
      {task==='quality'&&<label className="block text-[12px] font-bold text-neutral-700">Your draft<textarea aria-label="Your draft" required minLength={40} maxLength={14000} rows={8} value={content} onChange={event=>setContent(event.target.value)} disabled={busy} className={`${field} resize-y leading-relaxed`} placeholder="Paste at least 40 characters to review…"/><span className="mt-1 block text-right text-[10px] font-normal text-neutral-400">{content.length.toLocaleString()} / 14,000 characters</span></label>}
      <label className="block text-[12px] font-bold text-neutral-700">Output language<select aria-label="Output language" value={language} onChange={event=>setLanguage(event.target.value)} disabled={busy} className={field}><option value="en">English</option><option value="bn">বাংলা</option></select></label>
      <button type="submit" disabled={busy||authLoading} className="btn-primary w-full !text-[13px]">{busy?<><Loader2 size={17} className="animate-spin" aria-hidden="true"/>Creating your result…</>:<><Sparkles size={17} aria-hidden="true"/>{task==='keywords'?'Generate keywords & hashtags':task==='plan'?'Create 7-day plan':'Review this draft'}</>}</button>
      <p className="text-[10.5px] leading-relaxed text-neutral-500">Generating sends your entered text to an AI service and uses your daily allowance. Failed requests also count. Never enter passwords, credentials or private personal data.</p>
      {busy&&<p role="status" className="rounded-xl bg-neutral-50 p-3 text-[11px] leading-relaxed text-neutral-500">Creating and checking your result. Please keep this tool open.</p>}
     </form>}
          {error && <p role="alert" className="mt-4 rounded-xl border border-brand-100 bg-brand-50 p-3.5 text-[12px] leading-relaxed text-brand-800">{error}</p>}
          {output && <div className="mt-6 min-w-0 break-words border-t border-neutral-100 pt-5 [overflow-wrap:anywhere]" data-testid="ai-studio-result"><GenerationReceipt generation={output.generation} />
            {output.task === 'keywords' && <><div className="space-y-3">{output.result.groups.map(group => <section key={group.name} className="rounded-xl bg-neutral-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-[14px] font-extrabold">{group.name}</h3><span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{group.intent}</span></div><div className="mt-3 flex flex-wrap gap-2">{group.keywords.map(keyword => <span key={keyword} className="max-w-full break-words rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[12px] text-neutral-600 [overflow-wrap:anywhere]">{keyword}</span>)}</div><CopyButton text={group.keywords.join(', ')} label="Copy keywords" className="mt-3 px-3 text-[11px]" /></section>)}</div><Hashtags tags={output.result.hashtags} /></>}
            {output.task === 'plan' && <ol className="space-y-3">{output.result.days.map(day => <li key={day.day} className="rounded-xl border border-neutral-200 p-4"><p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-700">Day {day.day}</p><h3 className="mt-2 text-[15px] font-extrabold">{day.topic}</h3><p className="mt-2 text-[12px] leading-relaxed text-neutral-600"><strong>Pin:</strong> {day.pinTitle}</p><p className="mt-2 text-[12px] leading-relaxed text-neutral-600"><strong>Article:</strong> {day.articleTitle}</p><p className="mt-3 text-[11px] text-neutral-500">{day.keywords.join(' · ')}</p><p className="mt-2 break-words text-[11px] leading-relaxed text-brand-700">{day.hashtags.join(' ')}</p><div className="mt-2 flex flex-wrap gap-x-4"><Link href={`/pin-generator?topic=${encodeURIComponent(day.topic)}`} prefetch={false} className="inline-flex min-h-11 items-center gap-2 text-[11px] font-bold text-brand-700">Create this Pin<ArrowRight size={12} aria-hidden="true" /></Link><Link href={`/article-writer?title=${encodeURIComponent(day.articleTitle)}&topic=${encodeURIComponent(day.topic)}&language=${language}`} prefetch={false} className="inline-flex min-h-11 items-center gap-2 text-[11px] font-bold text-brand-700">Use title in Article Writer<ArrowRight size={12} aria-hidden="true" /></Link></div></li>)}</ol>}
            {output.task === 'quality' && <><div className="rounded-xl bg-neutral-900 p-4 text-white"><p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">AI editorial score · not search ranking</p><p className="mt-2 text-[32px] font-extrabold">{output.result.score}<span className="text-[16px] text-neutral-500"> / 100</span></p><p className="mt-2 text-[12px] leading-relaxed text-neutral-300">{output.result.summary}</p></div><ul className="mt-4 space-y-3">{output.result.checks.map(check => <li key={check.label} className="rounded-xl border border-neutral-200 p-3.5"><p className="flex flex-wrap items-center justify-between gap-2 text-[12px] font-bold">{check.label}<span className={`rounded-full px-2 py-1 text-[9px] uppercase ${check.status === 'pass' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{check.status}</span></p><p className="mt-2 text-[12px] leading-relaxed text-neutral-500">{check.detail}</p></li>)}</ul><div className="mt-4 rounded-xl bg-neutral-50 p-4"><h3 className="text-[12px] font-extrabold">Suggested title & description</h3><p className="mt-2 text-[13px] font-bold">{output.result.improvedTitle}</p><p className="mt-2 text-[12px] leading-relaxed text-neutral-600">{output.result.improvedDescription}</p><CopyButton text={`${output.result.improvedTitle}\n\n${output.result.improvedDescription}`} label="Copy improved text" className="mt-3 px-3 text-[11px]" /></div><Hashtags tags={output.result.hashtags} /></>}
            <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">{output.result.note}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2"><CopyButton text={exported} label="Copy complete result" variant="soft" className="min-h-11 w-full rounded-xl !text-[12px]" /><a href={`data:text/plain;charset=utf-8,${encodeURIComponent(exported)}`} download={`pincraft-${output.task}.txt`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-200 px-3 text-[12px] font-bold text-neutral-700 hover:bg-neutral-50"><Download size={14} aria-hidden="true" />Download result</a></div>
          </div>}
        </div>
      </div>
      <aside className="min-w-0 space-y-4 lg:sticky lg:top-20">
       <section className="rounded-2xl border border-neutral-200 bg-white p-5"><div className="flex items-center justify-between gap-2"><h2 className="text-[13px] font-extrabold">Your daily AI allowance</h2>{user&&<button type="button" onClick={refreshUsage} disabled={usageLoading} aria-label="Refresh AI usage" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-neutral-400 hover:bg-neutral-50 disabled:opacity-50"><RefreshCw size={14} className={usageLoading?'animate-spin':''} aria-hidden="true"/></button>}</div>{usage?<><UsageMeter label="Text requests" used={usage.used.text} limit={usage.limits.text}/><UsageMeter label="Image requests" used={usage.used.image} limit={usage.limits.image}/><p className="mt-4 text-[10.5px] leading-relaxed text-neutral-400">Resets at 00:00 UTC. Website-wide limits and temporary interruptions may apply.</p></>:<p className="mt-3 text-[12px] leading-relaxed text-neutral-500">{user?usageError||'Checking your private usage…':`Daily cap: ${status?.limits?.user?.text||30} text and ${status?.limits?.user?.image||5} image requests. Sign in to see your usage.`}</p>}{usage&&usageError&&<p role="status" className="mt-3 text-[10.5px] leading-relaxed text-amber-800">{usageError}</p>}</section>
       <section className="rounded-2xl bg-neutral-950 p-5 text-white"><ShieldCheck size={21} className="text-brand-300" aria-hidden="true"/><h2 className="mt-3 text-[15px] font-extrabold">Create first. Review before publishing.</h2><p className="mt-3 text-[12px] leading-relaxed text-neutral-400">AI can make mistakes. Check facts, originality and suitability yourself. Availability is checked when you generate; a failed request shows an error, never a template labeled as live AI.</p><p className="mt-3 text-[12px] leading-relaxed text-neutral-400">This tool does not authorize posts or create publishing jobs.</p><Link href="/publish" prefetch={false} className="mt-3 inline-flex min-h-11 items-center gap-2 text-[12px] font-bold text-white">Publish a reviewed article<ArrowRight size={13} aria-hidden="true"/></Link></section>
      </aside>
    </div>
  </div>;
}
function UsageMeter({ label, used, limit }) { const percent = Math.min(100, Math.max(0, used / Math.max(1, limit) * 100)); return <div className="mt-4"><p className="flex justify-between gap-2 text-[11.5px] text-neutral-600"><span>{label}</span><strong>{used} / {limit}</strong></p><div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used} className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100"><div className={`h-full rounded-full ${used >= limit ? 'bg-brand-600' : 'bg-neutral-800'}`} style={{ width: `${percent}%` }} /></div></div>; }
function Hashtags({ tags }) { return <section className="mt-4 rounded-xl border border-neutral-200 p-4"><h3 className="text-[12px] font-extrabold">Hashtag suggestions</h3><p className="mt-3 break-words text-[12px] leading-loose text-brand-700">{tags.join(' ')}</p><CopyButton text={tags.join(' ')} label="Copy hashtags" variant="soft" className="mt-2 min-h-11 w-full rounded-xl !text-[12px]" /></section>; }
