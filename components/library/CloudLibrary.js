"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpen, Cloud, FileText, Info, LoaderCircle, LockKeyhole, Pin, RefreshCw, Search } from "lucide-react";
import { useAuth } from "../providers/AppProvider";
import { normalizeLibraryArticle } from "@/lib/library-content";
import ContentCopyButton from "./ContentCopyButton";
import ArticleReader from "./ArticleReader";
import StableLibraryImage from "./StableLibraryImage";
import SavedArtworkPostInfo from "./SavedArtworkPostInfo";

const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3.5 text-[11.5px] font-bold disabled:opacity-40";
const imageURL = id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id) ? `/api/library/image-assets/${id}` : '';

function recordGroup(job) {
  const content = job?.content || {};
  if (job?.kind === 'article_draft' || (job?.kind === 'generated' && (Array.isArray(content.sections) || content.intro || content.plainText))) return 'articles';
  if (['pin_draft', 'queued_pin'].includes(job?.kind) || (job?.kind === 'generated' && content.title)) return 'pins';
  if (job?.kind === 'history_draft' && ['pin_artwork', 'pin_info'].includes(content.historyType)) return 'pins';
  return 'other';
}

function publicationStatus(job) {
  if (job?.state === 'failed') return { label: 'Error', tone: 'bg-rose-50 text-rose-700' };
  if (job?.state === 'attention') return { label: 'Needs review', tone: 'bg-amber-50 text-amber-800' };
  if (job?.state === 'retry') return { label: 'Retry scheduled', tone: 'bg-amber-50 text-amber-800' };
  if (job?.state === 'cancelled') return { label: 'Cancelled', tone: 'bg-neutral-100 text-neutral-600' };
  if (job?.state === 'queued' || job?.state === 'pending' || job?.state === 'generating' || job?.state === 'generated' || job?.state === 'posting' || job?.state === 'publishing') return { label: job.state === 'queued' ? 'Queued' : job.state === 'posting' || job.state === 'publishing' ? 'Publishing' : 'Pending', tone: 'bg-blue-50 text-blue-700' };
  if (job?.blog_url && job?.pin_url) return { label: 'Published · article + Pin', tone: 'bg-emerald-50 text-emerald-700' };
  if (job?.state === 'blog_published' || job?.blog_url) return { label: job?.pin_url ? 'Pin published' : 'Article published · Pin pending', tone: job?.pin_url ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800' };
  if (job?.pin_url || job?.state === 'success') return { label: job?.pin_url ? 'Pin published' : 'Published', tone: 'bg-emerald-50 text-emerald-700' };
  if (job?.kind === 'history_draft') return { label: 'Draft · private history', tone: 'bg-neutral-100 text-neutral-600' };
  if (['pin_draft', 'article_draft'].includes(job?.kind) || job?.state === 'draft') return { label: 'Draft', tone: 'bg-neutral-100 text-neutral-600' };
  return { label: 'Draft', tone: 'bg-neutral-100 text-neutral-600' };
}

function savedAt(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
}

function HistoryDetails({ content }) {
  const result = content?.result;
  if (content?.historyType === 'pin_info') return <div className="mt-3 rounded-lg bg-white p-3"><p className="text-[10.5px] leading-relaxed text-neutral-600">{content.description}</p><p className="mt-2 break-words text-[10px] text-brand-700">{content.hashtags?.join(' ')}</p></div>;
  if (!result || typeof result !== 'object') return null;
  if (content.historyType === 'trend_ideas') return <div className="mt-3 space-y-3">{result.ideas?.map((idea, index) => <section key={`${index}-${idea.pinTitle}`} className="rounded-lg border border-neutral-200 bg-white p-3"><p className="text-[9px] font-extrabold uppercase tracking-wider text-brand-700">Idea {index + 1}</p><h4 className="mt-1 text-[12px] font-extrabold">{idea.pinTitle}</h4><p className="mt-2 text-[10.5px] leading-relaxed text-neutral-600">{idea.concept}</p><p className="mt-2 text-[10px] text-neutral-500"><strong>Audience hypothesis:</strong> {idea.likelyAudience}</p><p className="mt-2 text-[10px] leading-relaxed text-neutral-500"><strong>Visual:</strong> {idea.contentStrategy?.visualDirection}</p><p className="mt-2 break-words text-[10px] text-brand-700">{idea.keywordSuggestions?.join(' · ')}</p></section>)}</div>;
  if (content.historyType === 'keywords') return <div className="mt-3 space-y-2">{result.groups?.map(group => <section key={group.name} className="rounded-lg bg-white p-3"><p className="text-[11px] font-extrabold">{group.name} <span className="ml-1 text-[9px] font-semibold uppercase text-neutral-400">{group.intent}</span></p><p className="mt-2 text-[10.5px] leading-relaxed text-neutral-600">{group.keywords?.join(' · ')}</p></section>)}<p className="break-words text-[10.5px] text-brand-700">{result.hashtags?.join(' ')}</p></div>;
  if (content.historyType === 'plan') return <ol className="mt-3 space-y-2">{result.days?.map(day => <li key={day.day} className="rounded-lg bg-white p-3"><p className="text-[9px] font-extrabold uppercase text-brand-700">Day {day.day} · {day.topic}</p><p className="mt-1 text-[10.5px] leading-relaxed"><strong>Pin:</strong> {day.pinTitle}</p><p className="mt-1 text-[10.5px] leading-relaxed"><strong>Article:</strong> {day.articleTitle}</p><p className="mt-1 text-[10px] text-neutral-500">{day.keywords?.join(' · ')}</p></li>)}</ol>;
  if (content.historyType === 'quality') return <div className="mt-3 rounded-lg bg-white p-3"><p className="text-[12px] font-extrabold">Editorial score · {result.score}/100</p><p className="mt-2 text-[10.5px] leading-relaxed text-neutral-600">{result.summary}</p><ul className="mt-3 space-y-2">{result.checks?.map(check => <li key={check.label} className="text-[10px] leading-relaxed"><strong>{check.label} · {check.status}</strong><span className="block text-neutral-500">{check.detail}</span></li>)}</ul><p className="mt-3 text-[10.5px] font-bold">Suggested title: {result.improvedTitle}</p><p className="mt-1 text-[10px] leading-relaxed text-neutral-500">The original pasted draft is not retained in this history item.</p></div>;
  if (content.historyType === 'pin_info') return <div className="mt-3 rounded-lg bg-white p-3"><p className="text-[10.5px] leading-relaxed text-neutral-600">{content.description}</p><p className="mt-2 break-words text-[10px] text-brand-700">{content.hashtags?.join(' ')}</p></div>;
  return null;
}

export default function CloudLibrary() {
  const { user, authLoading, openLogin } = useAuth();
  const [records, setRecords] = useState([]);
  const [owner, setOwner] = useState(null);
  const [ready, setReady] = useState(false);
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState("pins");
  const [query, setQuery] = useState("");
  const [reader, setReader] = useState(null);
  const sequence = useRef(0);

  const load = useCallback(async (cursor = null) => {
    if (!user) return;
    const id = ++sequence.current;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/library${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store", credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Cloud Library could not be loaded.");
      if (id !== sequence.current) return;
      setReady(data.ready); setOwner(user.id); setMessage(data.message || ""); setNext(data.nextCursor);
      setRecords(previous => cursor ? [...new Map([...previous, ...data.items].map(item => [item.id, item])).values()] : data.items);
    } catch (failure) { if (id === sequence.current) setError(failure.message || "Cloud Library is unavailable."); }
    finally { if (id === sequence.current) setLoading(false); }
  }, [user?.id]);

  useEffect(() => {
    setRecords([]); setOwner(null); setNext(null); setReady(false); setReader(null); setMessage(""); setError("");
    if (!authLoading && user) load();
    const refresh = () => load();
    window.addEventListener("pincraft:cloud-library-updated", refresh);
    return () => { sequence.current++; window.removeEventListener("pincraft:cloud-library-updated", refresh); };
  }, [authLoading, user?.id, load]);

  const visible = useMemo(() => records.filter(job => {
    if (recordGroup(job) !== tab) return false;
    const content = job.content || {};
    const search = `${content.title || ''} ${job.topic || ''} ${content.description || ''} ${content.intro || ''} ${JSON.stringify(content.result || '')}`.toLocaleLowerCase();
    return search.includes(query.toLocaleLowerCase().trim());
  }), [records, query, tab]);

  return <section className="mt-7 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm" aria-labelledby="cloud-library-heading" data-testid="cloud-library">
    <div className="flex flex-col justify-between gap-4 border-b border-neutral-100 p-5 sm:flex-row sm:items-center sm:px-6"><div><h2 id="cloud-library-heading" className="flex items-center gap-2 text-[19px] font-extrabold tracking-tight"><Cloud size={20} className="text-brand-600" aria-hidden="true" />Cloud Library</h2><p className="mt-1.5 text-[11.5px] leading-relaxed text-neutral-500">Your Pins, articles, artwork and AI results are saved privately as history. External publication status is shown separately.</p></div>{user && <button type="button" onClick={() => load()} disabled={loading} className={`${button} w-fit shrink-0 border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50`}><RefreshCw size={13} className={loading ? "animate-spin" : ""} aria-hidden="true" />Refresh cloud content</button>}</div>
    {authLoading ? <p className="p-6 text-[12px] text-neutral-500">Checking your account…</p> : !user ? <div className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6"><p className="flex items-start gap-2 text-[12px] leading-relaxed text-neutral-600"><LockKeyhole size={16} className="mt-0.5 shrink-0 text-neutral-400" aria-hidden="true" />Sign in to see your private cloud history. Device saves are separate from account content.</p><button type="button" onClick={openLogin} className={`${button} shrink-0 bg-brand-50 text-brand-700`}>Sign in / Create account</button></div> : <div className="p-5 sm:p-6">
      {error && <p role="alert" className="mb-4 rounded-xl bg-brand-50 p-3 text-[12px] leading-relaxed text-brand-800">{error} Use Refresh to retry. No examples are shown as cloud data.</p>}
      {message && <p className="mb-4 flex items-start gap-2 rounded-xl bg-neutral-50 p-3 text-[12px] leading-relaxed text-neutral-600"><Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{message}</p>}
      {loading && owner !== user.id ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading cloud content">{[1, 2, 3].map(id => <div key={id} className="h-52 animate-pulse rounded-xl bg-neutral-100" />)}</div> : ready && owner === user.id ? <>
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="flex w-fit flex-wrap rounded-xl bg-neutral-100 p-1" role="group" aria-label="Cloud collection type">{[["pins", "Cloud Pins", Pin], ["articles", "Cloud Articles", FileText], ["other", "Other history", BookOpen]].map(([value, label, Icon]) => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)} className={`${button} ${tab === value ? "bg-white text-brand-700 shadow-sm" : "text-neutral-600"}`}><Icon size={13} aria-hidden="true" />{label}</button>)}</div><label className="relative sm:w-60"><span className="sr-only">Search loaded cloud content</span><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden="true" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search loaded history…" className="min-h-11 w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-9 pr-3 text-[16px] outline-none focus:border-brand-600 sm:text-[11px]" /></label></div>
        {visible.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visible.map((job,index) => {
          const content = job.content || {}, status = publicationStatus(job), historyImage = imageURL(content.imageAssetId), cover = content.images?.find(image => image.role === 'cover' && image.assetId);
          const article = tab === 'articles';
          const copyText = [content.titles?.length ? content.titles.join("\n") : content.title, content.description, (content.hashtags || []).join(" ")].filter(Boolean).join("\n\n");
          return <article key={job.id} className="flex min-w-0 flex-col break-words rounded-xl border border-neutral-200 p-4 [overflow-wrap:anywhere] sm:p-5">
            <div className="flex items-start justify-between gap-2"><span className="min-w-0 text-[10px] font-bold leading-relaxed text-brand-700">{content.category || job.topic || 'Saved history'}</span><span className={`shrink-0 rounded-md px-2 py-1 text-[9px] font-bold ${status.tone}`}>{status.label}</span></div>
            <h3 className="mt-4 text-[16px] font-extrabold leading-relaxed tracking-tight">{content.title || job.topic}</h3>
            {content.generation?.kind === 'ai' && <p className="mt-1.5 text-[9.5px] font-semibold text-neutral-400">AI-generated · Review before use</p>}
            {content.historyType && <p className="mt-1 text-[9.5px] text-neutral-400">{content.historyType.replaceAll('_', ' ')} · Private history</p>}
            {savedAt(job.created_at) && <p className="mt-1 text-[9px] text-neutral-400">Saved {savedAt(job.created_at)}</p>}
            {job.scheduled_at && ['queued', 'pending', 'generating', 'generated', 'posting', 'publishing'].includes(job.state) && <p className="mt-1 text-[9px] text-blue-700">Scheduled {savedAt(job.scheduled_at)}</p>}
            {job.completed_at && ['success', 'blog_published'].includes(job.state) && <p className="mt-1 text-[9px] text-emerald-700">Confirmed {savedAt(job.completed_at)}</p>}
            {job.state === 'retry' && job.retry_at && <p role="status" className="mt-2 rounded-lg bg-amber-50 p-2.5 text-[10px] leading-relaxed text-amber-900">Automatic retry scheduled for {savedAt(job.retry_at)}.</p>}
            {job.error_message && ['failed', 'attention', 'retry'].includes(job.state) && <p role="status" className={`mt-3 rounded-lg p-3 text-[10.5px] leading-relaxed ${job.state === 'failed' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-900'}`}>{job.error_message}</p>}
            {job.uncertain_step && <p role="status" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10px] leading-relaxed text-amber-900">The {job.uncertain_step === 'pin' ? 'Pinterest' : 'Blogger'} result may have completed. Check that destination before further action; automatic reposting is blocked until you review it.</p>}
            {job.state === 'failed' && (job.blog_url || job.pin_url) && <p className="mt-2 text-[10px] leading-relaxed text-neutral-500">A previously confirmed external publication remains linked below; the later job step failed.</p>}
            {historyImage && <><StableLibraryImage eager={index<3} src={historyImage} alt={content.title || 'Saved AI artwork'} portrait /><a href={historyImage} download="pincraft-artwork.webp" className="mt-2 inline-flex min-h-10 items-center text-[10px] font-bold text-brand-700 underline underline-offset-2">Download saved artwork</a></>}
            {!historyImage && cover && <StableLibraryImage eager={index<3} src={`/api/library/article-images/${cover.assetId}`} alt={cover.altText || 'Article cover image'} />}
            {content.description && <p className="mt-3 text-[11.5px] leading-relaxed text-neutral-500">{content.description}</p>}
            {article && content.intro && <p className="mb-3 mt-2 line-clamp-3 text-[11.5px] leading-relaxed text-neutral-500">{content.intro}</p>}
            {!article && !content.description && !historyImage && <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">{content.historyType === 'plan' ? 'Seven-day content plan draft.' : content.historyType === 'quality' ? 'AI editorial review. The pasted source draft is not stored.' : 'Saved privately for later review.'}</p>}
            {tab === 'pins' && content.titles?.length > 1 && <details className="mt-3 rounded-lg bg-neutral-50 p-3"><summary className="min-h-8 cursor-pointer text-[11px] font-bold text-neutral-600">Saved Pin details · {content.titles.length} titles</summary><ol className="mt-2 list-decimal space-y-2 pl-4 text-[11px] leading-relaxed text-neutral-600">{content.titles.map((title, index) => <li key={`${index}-${title}`}>{title}</li>)}</ol>{content.keywords?.length > 0 && <p className="mt-3 break-words text-[10.5px] text-neutral-500"><strong>Keywords:</strong> {content.keywords.join(', ')}</p>}{content.imagePrompt && <div className="mt-3"><p className="text-[10.5px] font-bold text-neutral-600">Image prompt</p><p className="mt-1 text-[10.5px] leading-relaxed text-neutral-500">{content.imagePrompt}</p><ContentCopyButton text={content.imagePrompt} label="Copy image prompt" /></div>}</details>}
            {tab === 'other' && <details className="mt-3 rounded-lg bg-neutral-50 p-3"><summary className="min-h-8 cursor-pointer text-[11px] font-bold text-neutral-600">Open saved result</summary><HistoryDetails content={content} /></details>}
            {tab === 'pins' && content.historyType === 'pin_info' && <details className="mt-3 rounded-lg bg-neutral-50 p-3"><summary className="min-h-8 cursor-pointer text-[11px] font-bold text-neutral-600">Pinterest Post Info</summary><HistoryDetails content={content} /></details>}
            {tab === 'pins' && content.historyType === 'pin_artwork' && content.useCase === 'pin' && <SavedArtworkPostInfo key={content.imageAssetId} artwork={content} />}
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3">
              {article ? <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setReader({ ...normalizeLibraryArticle({ ...content, id: job.id }), storage: "cloud" })} className={`${button} bg-brand-600 text-white`}><BookOpen size={13} aria-hidden="true" />Read article</button>{job.kind === "article_draft" && job.state === 'draft' && <Link href={`/publish?draft=${encodeURIComponent(job.id)}`} prefetch={false} className={`${button} border border-neutral-200 text-brand-700`}>Review & publish<ArrowUpRight size={12} aria-hidden="true" /></Link>}</div> : tab === 'pins' && copyText ? <ContentCopyButton text={copyText} label="Copy Pin" /> : <span className="text-[10px] text-neutral-400">Private history</span>}
              <div className="flex flex-wrap gap-x-3 gap-y-1">{job.blog_url && <a href={job.blog_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 text-[10px] font-bold text-brand-700">View live article<ArrowUpRight size={11} aria-hidden="true" /></a>}{job.pin_url && <a href={job.pin_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 text-[10px] font-bold text-brand-700">View live Pin<ArrowUpRight size={11} aria-hidden="true" /></a>}</div>
            </div>
            {job.topic_metadata?.source === "google_trends" && <p className="mt-3 text-[9px] text-neutral-400">Topic source: Search trends · {job.topic_metadata.region}</p>}
          </article>;
        })}</div> : <div className="rounded-xl border border-dashed border-neutral-200 px-5 py-8 text-center"><Cloud size={25} className="mx-auto text-neutral-300" aria-hidden="true" /><h3 className="mt-3 text-[14px] font-bold">{query ? "No matching loaded history" : tab === 'pins' ? 'No Pin history yet' : tab === 'articles' ? 'No article history yet' : 'No other generated history yet'}</h3><p className="mt-2 text-[11.5px] leading-relaxed text-neutral-500">{query ? "Try a different search, or load more saved results below." : "Generated content is saved privately here as history. Saving does not queue or publish it."}</p><Link href={tab === 'pins' ? '/pin-generator' : tab === 'articles' ? '/article-writer' : '/content-studio'} prefetch={false} className={`${button} mt-3 text-brand-700`}>Choose a creation tool<ArrowUpRight size={13} aria-hidden="true" /></Link></div>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4"><p className="text-[10.5px] text-neutral-500">{records.length} cloud history item{records.length === 1 ? "" : "s"} loaded · Only your account’s server data</p>{next && <button type="button" disabled={loading} onClick={() => load(next)} className={`${button} border border-neutral-200 text-neutral-700`}>{loading && <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />}Load more history</button>}</div>
      </> : !message && !error && <p className="text-[12px] text-neutral-500">Cloud Library is temporarily unavailable. Your saved content has not been changed.</p>}
    </div>}
    {reader && user && owner === user.id && <ArticleReader key={reader.id} article={reader} onClose={() => setReader(null)} />}
  </section>;
}
