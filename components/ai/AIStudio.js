"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, CheckCircle2, ClipboardCheck, ImagePlus, KeyRound, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../providers/AppProvider';
import { generateWithAI } from '@/lib/ai-client';
import CopyButton from '../CopyButton';
import ImageGenerator from './ImageGenerator';
import { GenerationReceipt } from './GenerationMode';

const tools = [
  { id: 'image', label: 'Image generator', Icon: ImagePlus },
  { id: 'keywords', label: 'SEO & hashtags', Icon: KeyRound },
  { id: 'plan', label: '7-day content plan', Icon: CalendarDays },
  { id: 'quality', label: 'Content review', Icon: ClipboardCheck },
];
const field = 'mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-3 text-[16px] outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-50 sm:text-[14px]';
export default function AIStudio() {
  const { user, authLoading, openLogin } = useAuth();
  const [task, setTask] = useState('image'), [status, setStatus] = useState(null), [topic, setTopic] = useState(''), [content, setContent] = useState(''), [language, setLanguage] = useState('en'), [useCase, setUseCase] = useState('pin');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [output, setOutput] = useState(null), [usage, setUsage] = useState(null), [usageError, setUsageError] = useState('');
  const owner = useRef(null), sequence = useRef(0), controller = useRef(null);
  owner.current = user?.id || null;
  useEffect(() => { const abort = new AbortController(); fetch('/api/ai/status', { cache: 'no-store', signal: abort.signal }).then(r => r.ok ? r.json() : null).then(setStatus).catch(() => {}); return () => abort.abort(); }, []);
  const refreshUsage = useCallback(async () => {
    const account = owner.current; if (!account) return;
    try { const response = await fetch('/api/ai/usage', { cache: 'no-store', credentials: 'same-origin' }); const data = await response.json(); if (owner.current !== account) return; if (!response.ok) throw new Error(data.error); setUsage(data); setUsageError(''); }
    catch { if (owner.current === account) setUsageError('Usage could not be checked. Live AI remains subject to server-side Firebase setup and budget checks.'); }
  }, []);
  useEffect(() => { sequence.current++; controller.current?.abort(); setBusy(false); setOutput(null); setError(''); setUsage(null); setUsageError(''); if (user) refreshUsage(); return () => { sequence.current++; controller.current?.abort(); }; }, [user?.id, refreshUsage]);
  async function generate(event) {
    event.preventDefault(); if (busy || authLoading) return;
    if (!user) return openLogin();
    const account = user.id, request = ++sequence.current;
    controller.current = new AbortController(); setBusy(true); setError(''); setOutput(null);
    try {
      const result = await generateWithAI(task, task === 'quality' ? { content: content.trim(), ...(topic.trim() ? { topic: topic.trim() } : {}), language } : { topic: topic.trim(), language }, { signal: controller.current.signal });
      if (owner.current === account && request === sequence.current) setOutput(result);
    } catch (issue) { if (issue.name !== 'AbortError' && owner.current === account && request === sequence.current) setError(issue.message); }
    finally { if (request === sequence.current) { setBusy(false); refreshUsage(); } }
  }
  const active = tools.find(tool => tool.id === task);
  return <div className="container-x pb-14 pt-8 sm:pb-20 sm:pt-12">
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div><span className="eyebrow"><Sparkles size={14} aria-hidden="true" />The AI workspace</span><h1 className="mt-4 text-[36px] font-extrabold leading-tight tracking-[-0.04em] sm:text-[48px]">More ideas. Less busywork.</h1><p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-neutral-500">Create artwork, find keyword clusters, plan your next week, and improve your drafts. Live AI, with automatic fallback and honest limits.</p></div>
      <Link href="/pin-generator" prefetch={false} className="inline-flex min-h-11 shrink-0 items-center gap-2 text-[12px] font-bold text-brand-700">Pin & article generators<ArrowRight size={15} aria-hidden="true" /></Link>
    </div>
    <div className="mt-7 grid gap-3 sm:grid-cols-3">{[
      ['Gemini', 'Primary text generation', status?.textProviders?.includes('gemini')],
      ['Groq', 'Alternate text generation', status?.textProviders?.includes('groq')],
      ['Cloudflare', 'FLUX image generation', status?.imageConfigured],
    ].map(([name, description, configured]) => <div key={name} className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${configured ? 'bg-emerald-500' : 'bg-neutral-300'}`} aria-hidden="true" /><div><p className="text-[13px] font-extrabold">{name}</p><p className="mt-1 text-[11px] text-neutral-500">{description}</p><p className="mt-2 text-[10px] font-bold text-neutral-500">{status ? configured ? 'Server credentials configured' : 'Server setup required' : 'Checking configuration…'}</p></div></div>)}</div>
    <p className="mt-2 text-[10.5px] leading-relaxed text-neutral-500">Configured does not guarantee available quota. Requests are checked when you generate; no provider key is sent to your browser.</p>
    {!authLoading && !user && <div className="mt-5 flex flex-col justify-between gap-3 rounded-2xl border border-brand-100 bg-brand-50/40 p-4 sm:flex-row sm:items-center"><p className="max-w-2xl text-[12px] leading-relaxed text-neutral-700"><strong>A verified account is required for live AI.</strong> Sign in with Email/Password or Google. The Pin and Article tools also offer a separate free offline-template mode.</p><button type="button" onClick={openLogin} className="btn-primary shrink-0 !min-h-11 !px-4 !text-[12px]">Sign in / Create account</button></div>}
    <div className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div role="group" aria-label="AI tool" className="grid grid-cols-2 gap-2 border-b border-neutral-100 p-3 sm:grid-cols-4">{tools.map(({ id, label, Icon }) => <button key={id} type="button" disabled={busy} onClick={() => { setTask(id); setOutput(null); setError(''); }} aria-pressed={task === id} className={`flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-center text-[11px] font-bold disabled:opacity-50 ${task === id ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-50'}`}><Icon size={16} aria-hidden="true" />{label}</button>)}</div>
        <div className="p-4 sm:p-6">
          <h2 className="text-[21px] font-extrabold tracking-tight">{active.label}</h2>
          {task === 'image' ? <div className="mt-4 space-y-4"><label className="block text-[12px] font-bold text-neutral-700">Image format<select aria-label="Image format" value={useCase} onChange={event => setUseCase(event.target.value)} className={field}><option value="pin">Pinterest Pin · 1000 × 1500</option><option value="featured">Blog featured image · 1200 × 630</option></select></label><ImageGenerator initialPrompt="" useCase={useCase} editable onUsageChange={refreshUsage} /></div> : <form onSubmit={generate} className="mt-4 space-y-4">
            <label className="block text-[12px] font-bold text-neutral-700">{task === 'quality' ? 'Topic (optional)' : 'Topic or niche'}<input required={task !== 'quality'} minLength={3} maxLength={160} value={topic} onChange={event => setTopic(event.target.value)} disabled={busy} placeholder="Balcony gardening for small apartments" className={field} /></label>
            {task === 'quality' && <label className="block text-[12px] font-bold text-neutral-700">Your draft<textarea aria-label="Your draft" required minLength={40} maxLength={14000} rows={8} value={content} onChange={event => setContent(event.target.value)} disabled={busy} className={`${field} resize-y leading-relaxed`} placeholder="Paste at least 40 characters to review clarity, structure and unsupported claims…" /><span className="mt-1 block text-right text-[10px] font-normal text-neutral-400">{content.length.toLocaleString()} / 14,000 characters</span></label>}
            <label className="block text-[12px] font-bold text-neutral-700">Output language<select aria-label="Output language" value={language} onChange={event => setLanguage(event.target.value)} disabled={busy} className={field}><option value="en">English</option><option value="bn">বাংলা</option></select></label>
            <button type="submit" disabled={busy || authLoading} className="btn-primary w-full !text-[13px]">{busy ? <><Loader2 size={17} className="animate-spin" aria-hidden="true" />Generating with fallback…</> : <><Sparkles size={17} aria-hidden="true" />{task === 'keywords' ? 'Generate keywords & hashtags' : task === 'plan' ? 'Create 7-day plan' : 'Review this draft'}</>}</button>
            <p className="text-[10.5px] leading-relaxed text-neutral-500">Clicking Generate sends the entered text to the configured AI provider and may use provider quota. Failed requests count toward the app’s daily request cap. Never enter passwords, API keys or private personal data.</p>
          </form>}
          {error && <p role="alert" className="mt-4 rounded-xl border border-brand-100 bg-brand-50 p-3.5 text-[12px] leading-relaxed text-brand-800">{error}</p>}
          {output && <div className="mt-6 border-t border-neutral-100 pt-5" data-testid="ai-studio-result"><GenerationReceipt generation={output.generation} />
            {output.task === 'keywords' && <><div className="space-y-3">{output.result.groups.map(group => <section key={group.name} className="rounded-xl bg-neutral-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-[14px] font-extrabold">{group.name}</h3><span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{group.intent}</span></div><div className="mt-3 flex flex-wrap gap-2">{group.keywords.map(keyword => <span key={keyword} className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[12px] text-neutral-600">{keyword}</span>)}</div></section>)}</div><Hashtags tags={output.result.hashtags} /></>}
            {output.task === 'plan' && <ol className="space-y-3">{output.result.days.map(day => <li key={day.day} className="rounded-xl border border-neutral-200 p-4"><p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-700">Day {day.day}</p><h3 className="mt-2 text-[15px] font-extrabold">{day.topic}</h3><p className="mt-2 text-[12px] leading-relaxed text-neutral-600"><strong>Pin:</strong> {day.pinTitle}</p><p className="mt-2 text-[12px] leading-relaxed text-neutral-600"><strong>Article:</strong> {day.articleTitle}</p><p className="mt-3 text-[11px] text-neutral-500">{day.keywords.join(' · ')}</p><p className="mt-2 break-words text-[11px] leading-relaxed text-brand-700">{day.hashtags.join(' ')}</p><Link href={`/article-writer?title=${encodeURIComponent(day.articleTitle)}&topic=${encodeURIComponent(day.topic)}`} prefetch={false} className="mt-2 inline-flex min-h-11 items-center gap-2 text-[11px] font-bold text-brand-700">Use title in Article Writer<ArrowRight size={12} aria-hidden="true" /></Link></li>)}</ol>}
            {output.task === 'quality' && <><div className="rounded-xl bg-neutral-900 p-4 text-white"><p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">AI editorial score · not search ranking</p><p className="mt-2 text-[32px] font-extrabold">{output.result.score}<span className="text-[16px] text-neutral-500"> / 100</span></p><p className="mt-2 text-[12px] leading-relaxed text-neutral-300">{output.result.summary}</p></div><ul className="mt-4 space-y-3">{output.result.checks.map(check => <li key={check.label} className="rounded-xl border border-neutral-200 p-3.5"><p className="flex flex-wrap items-center justify-between gap-2 text-[12px] font-bold">{check.label}<span className={`rounded-full px-2 py-1 text-[9px] uppercase ${check.status === 'pass' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{check.status}</span></p><p className="mt-2 text-[12px] leading-relaxed text-neutral-500">{check.detail}</p></li>)}</ul><div className="mt-4 rounded-xl bg-neutral-50 p-4"><h3 className="text-[12px] font-extrabold">Suggested title & description</h3><p className="mt-2 text-[13px] font-bold">{output.result.improvedTitle}</p><p className="mt-2 text-[12px] leading-relaxed text-neutral-600">{output.result.improvedDescription}</p></div><Hashtags tags={output.result.hashtags} /></>}
            <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">{output.result.note}</p>
            <div className="mt-3"><CopyButton text={JSON.stringify(output.result, null, 2)} label="Copy complete result" variant="soft" className="min-h-11 w-full rounded-xl !text-[12px]" /></div>
          </div>}
        </div>
      </div>
      <aside className="space-y-4 lg:sticky lg:top-20">
        <section className="rounded-2xl bg-neutral-950 p-5 text-white"><ShieldCheck size={22} className="text-brand-400" aria-hidden="true" /><h2 className="mt-3 text-[16px] font-extrabold">Fallback, not fiction.</h2><p className="mt-3 text-[12px] leading-relaxed text-neutral-400">Text uses Gemini first, then Groq and a second Groq model when needed. Images try FLUX.1, then FLUX.2 klein. The successful provider and model appear with your result.</p><p className="mt-3 text-[12px] leading-relaxed text-neutral-400">If all options fail, you see an error. Safety refusals are never bypassed. No fake success, no silent switch to offline templates.</p></section>
        <section className="rounded-2xl border border-neutral-200 p-5"><h2 className="text-[13px] font-extrabold">Your daily AI budget</h2>{usage ? <><p className="mt-3 text-[12px] text-neutral-600">Text: <strong>{usage.used.text} / {usage.limits.text}</strong></p><p className="mt-2 text-[12px] text-neutral-600">Images: <strong>{usage.used.image} / {usage.limits.image}</strong></p><p className="mt-3 text-[10.5px] leading-relaxed text-neutral-400">Resets at 00:00 UTC. Site-wide and provider limits also apply.</p></> : <p className="mt-3 text-[12px] leading-relaxed text-neutral-500">{user ? usageError || 'Checking your private usage…' : `Default per-account cap: ${status?.limits?.user?.text || 30} text requests and ${status?.limits?.user?.image || 5} image requests per UTC day. Sign in to see usage.`}</p>}</section>
        <section className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5"><CheckCircle2 size={18} className="text-neutral-400" aria-hidden="true" /><p className="mt-3 text-[12px] leading-relaxed text-neutral-600">Planning is not publishing. Nothing in AI Studio authorizes an external post or creates a scheduled job. Use the Dashboard’s separate consent and account connections.</p><Link href="/dashboard" prefetch={false} className="mt-2 inline-flex min-h-11 items-center gap-2 text-[12px] font-bold text-brand-700">Open Dashboard<ArrowRight size={13} aria-hidden="true" /></Link></section>
      </aside>
    </div>
  </div>;
}
function Hashtags({ tags }) { return <section className="mt-4 rounded-xl border border-neutral-200 p-4"><h3 className="text-[12px] font-extrabold">Hashtag suggestions</h3><p className="mt-3 break-words text-[12px] leading-loose text-brand-700">{tags.join(' ')}</p><CopyButton text={tags.join(' ')} label="Copy hashtags" variant="soft" className="mt-2 min-h-11 w-full rounded-xl !text-[12px]" /></section>; }
