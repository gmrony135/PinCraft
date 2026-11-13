"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpen, Cloud, FileText, Info, LoaderCircle, LockKeyhole, Pin, RefreshCw, Search } from "lucide-react";
import { useAuth } from "../providers/AppProvider";
import { normalizeLibraryArticle } from "@/lib/library-content";
import ContentCopyButton from "./ContentCopyButton";
import ArticleReader from "./ArticleReader";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3.5 text-[11.5px] font-bold disabled:opacity-40";
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
      setRecords((previous) => cursor ? [...new Map([...previous, ...data.items].map((item) => [item.id, item])).values()] : data.items);
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
  const visible = useMemo(() => records.filter((job) => (tab !== 'articles' || job.kind !== 'queued_pin') && `${job.content.title} ${job.topic} ${job.content.description}`.toLowerCase().includes(query.toLowerCase().trim())), [records, query, tab]);
  return <section className="mt-7 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm" aria-labelledby="cloud-library-heading" data-testid="cloud-library">
    <div className="flex flex-col justify-between gap-4 border-b border-neutral-100 p-5 sm:flex-row sm:items-center sm:px-6"><div><h2 id="cloud-library-heading" className="flex items-center gap-2 text-[19px] font-extrabold tracking-tight"><Cloud size={20} className="text-brand-600" aria-hidden="true" />Cloud Library</h2><p className="mt-1.5 text-[11.5px] leading-relaxed text-neutral-500">Full Auto results, saved privately to your account—even when this website is closed.</p></div>{user && <button type="button" onClick={() => load()} disabled={loading} className={`${button} w-fit shrink-0 border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50`}><RefreshCw size={13} className={loading ? "animate-spin" : ""} aria-hidden="true" />Refresh cloud content</button>}</div>
    {authLoading ? <p className="p-6 text-[12px] text-neutral-500">Checking your account…</p> : !user ? <div className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6"><p className="flex items-start gap-2 text-[12px] leading-relaxed text-neutral-600"><LockKeyhole size={16} className="mt-0.5 shrink-0 text-neutral-400" aria-hidden="true" />Sign in to see your private auto-generated Pins and Articles. Device saves and examples remain separate below.</p><button type="button" onClick={openLogin} className={`${button} shrink-0 bg-brand-50 text-brand-700`}>Sign in with Google</button></div> : <div className="p-5 sm:p-6">
      {error && <p role="alert" className="mb-4 rounded-xl bg-brand-50 p-3 text-[12px] leading-relaxed text-brand-800">{error} Use Refresh to retry. No examples are shown as cloud data.</p>}
      {message && <p className="mb-4 flex items-start gap-2 rounded-xl bg-neutral-50 p-3 text-[12px] leading-relaxed text-neutral-600"><Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{message}</p>}
      {loading && owner !== user.id ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading cloud content">{[1, 2, 3].map((id) => <div key={id} className="h-52 animate-pulse rounded-xl bg-neutral-100" />)}</div> : ready && owner === user.id ? <>
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="flex w-fit rounded-xl bg-neutral-100 p-1" role="group" aria-label="Cloud collection type">{["pins", "articles"].map((value) => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)} className={`${button} ${tab === value ? "bg-white text-brand-700 shadow-sm" : "text-neutral-600"}`}>{value === "pins" ? <Pin size={13} aria-hidden="true" /> : <FileText size={13} aria-hidden="true" />}{value === "pins" ? "Cloud Pins" : "Cloud Articles"}</button>)}</div><label className="relative sm:w-60"><span className="sr-only">Search loaded cloud content</span><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search loaded cloud content…" className="min-h-11 w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-9 pr-3 text-[16px] outline-none focus:border-brand-600 sm:text-[11px]" /></label></div>
        {visible.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visible.map((job) => <article key={job.id} className="flex min-w-0 flex-col rounded-xl border border-neutral-200 p-4 sm:p-5"><div className="flex items-start justify-between gap-2"><span className="min-w-0 text-[10px] font-bold leading-relaxed text-brand-700">{job.topic}</span><span className={`shrink-0 rounded-md px-2 py-1 text-[9px] font-bold ${tab === "pins" ? job.pin_url ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500" : job.blog_url ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>{tab === "pins" ? job.pin_url ? "Pin posted" : "Saved draft" : job.blog_url ? "Published" : "Saved draft"}</span></div><h3 className="mt-4 text-[16px] font-extrabold leading-relaxed tracking-tight">{job.content.title}</h3><p className="mb-4 mt-2 line-clamp-3 text-[11.5px] leading-relaxed text-neutral-500">{tab === "pins" ? job.content.description : job.content.intro}</p>{tab === "pins" && <p className="mb-4 text-[10px] leading-relaxed text-brand-700 [overflow-wrap:anywhere]">{job.content.hashtags.join(" ")}</p>}<div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3">{tab === "pins" ? <ContentCopyButton text={[job.content.title, job.content.description, job.content.hashtags.join(" ")].join("\n\n")} label="Copy Pin" /> : <button type="button" onClick={() => setReader({ ...normalizeLibraryArticle({ ...job.content, id: job.id }), storage: "cloud" })} className={`${button} bg-brand-600 text-white`}><BookOpen size={13} aria-hidden="true" />Read article</button>}{(tab === "pins" ? job.pin_url : job.blog_url) && <a href={tab === "pins" ? job.pin_url : job.blog_url} target="_blank" rel="noopener noreferrer" className={`${button} px-0 text-brand-700`}>View live<ArrowUpRight size={12} aria-hidden="true" /></a>}</div>{job.topic_metadata?.source === "google_trends" && <p className="mt-3 text-[9px] text-neutral-400">Topic source: Google Trends RSS · {job.topic_metadata.region}</p>}</article>)}</div> : <div className="rounded-xl border border-dashed border-neutral-200 px-5 py-8 text-center"><Cloud size={25} className="mx-auto text-neutral-300" aria-hidden="true" /><h3 className="mt-3 text-[14px] font-bold">{query ? "No matching loaded content" : "No cloud content yet"}</h3><p className="mt-2 text-[11.5px] leading-relaxed text-neutral-500">{query ? "Try a different search, or load more saved results below." : "A server-generated content pack appears here before publishing, so a provider failure will not lose the article."}</p><Link href="/dashboard" prefetch={false} className={`${button} mt-3 text-brand-700`}>Open Full Auto settings<ArrowUpRight size={13} aria-hidden="true" /></Link></div>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4"><p className="text-[10.5px] text-neutral-500">{records.length} cloud content pack{records.length === 1 ? "" : "s"} loaded · Only your account’s server data</p>{next && <button type="button" disabled={loading} onClick={() => load(next)} className={`${button} border border-neutral-200 text-neutral-700`}>{loading && <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />}Load more cloud content</button>}</div>
      </> : !message && !error && <p className="text-[12px] text-neutral-500">Cloud Library is waiting for its server configuration.</p>}
    </div>}
    {reader && user && owner === user.id && <ArticleReader key={reader.id} article={reader} onClose={() => setReader(null)} />}
  </section>;
}
