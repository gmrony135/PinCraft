"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Bookmark, FileText, FolderHeart, Info, Monitor, Pin, Search, Sparkles, Wallet, X } from "lucide-react";
import { LIBRARY_PAGE_SIZE, LIBRARY_STORAGE_KEY, createDemoLibrary, filterLibrary, partitionLibrary } from "@/lib/library-content";
import ContentCopyButton from "./ContentCopyButton";
import ArticleReader from "./ArticleReader";
import { LIBRARY_UPDATED_EVENT } from "@/lib/library";
import CloudLibrary from "./CloudLibrary";

const TABS = [{ id: "pins", label: "Saved Pins", Icon: Pin }, { id: "articles", label: "Saved Articles", Icon: FileText }];

export default function MyLibrary() {
  const demos = useMemo(createDemoLibrary, []);
  const [saved, setSaved] = useState({ pins: [], articles: [] });
  const [ready, setReady] = useState(false);
  const [warning, setWarning] = useState("");
  const [tab, setTab] = useState("pins");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [reader, setReader] = useState(null);
  const tabRefs = useRef([]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "articles") setTab("articles");
    function refresh() {
      try {
        const raw = window.localStorage.getItem(LIBRARY_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) throw new Error("Invalid library");
        setSaved(partitionLibrary(parsed));
        setWarning("");
      } catch {
        setSaved({ pins: [], articles: [] });
        setWarning("Your saved library could not be loaded. Showing examples instead; your stored data has not been changed.");
      } finally {
        setReady(true);
      }
    }
    const onStorage = (event) => { if (event.key === LIBRARY_STORAGE_KEY || event.key === null) { refresh(); setPage(0); } };
    refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener(LIBRARY_UPDATED_EVENT, refresh);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(LIBRARY_UPDATED_EVENT, refresh); };
  }, []);

  const isDemo = saved[tab].length === 0;
  const collection = isDemo ? demos[tab] : saved[tab];
  const filtered = filterLibrary(collection, query);
  const pageCount = Math.max(1, Math.ceil(filtered.length / LIBRARY_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * LIBRARY_PAGE_SIZE, (currentPage + 1) * LIBRARY_PAGE_SIZE);

  function selectTab(next) { setTab(next); setQuery(""); setPage(0); }
  function tabKey(event, index) {
    const next = event.key === "ArrowRight" ? (index + 1) % TABS.length : event.key === "ArrowLeft" ? (index + TABS.length - 1) % TABS.length : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    selectTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  return (
    <div data-testid="library-root" data-ready={ready} className="container-x pb-10 pt-7 sm:pb-14 sm:pt-9">
      <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-2 text-[12px] font-medium text-neutral-500"><Link href="/" prefetch={false} className="rounded-sm hover:text-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">Home</Link><span aria-hidden="true" className="text-neutral-300">/</span><span aria-current="page" className="text-neutral-700">My Library</span></nav>

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div><p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.15em] text-brand-600"><FolderHeart aria-hidden="true" size={13} /> Your collection</p><h1 className="text-[34px] font-extrabold leading-[1.12] tracking-[-0.04em] text-neutral-900 sm:text-[43px]">My Library</h1><p className="mt-2.5 text-[14px] leading-relaxed text-neutral-500 sm:text-[15.5px]">All your saved Pins and Articles</p></div>
        <Link href="/adsterra-income" prefetch={false} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-[12px] font-bold text-neutral-700 transition-colors hover:border-brand-200 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"><Wallet aria-hidden="true" size={15} /> Adsterra Income <ArrowUpRight aria-hidden="true" size={14} /></Link>
      </div>

      <CloudLibrary />
      <div className="mb-3 mt-8"><h2 className="text-[19px] font-extrabold tracking-tight">Device saves & examples</h2><p className="mt-1 text-[11.5px] leading-relaxed text-neutral-500">Manual tool saves stay in this browser. Example collections below are never uploaded or counted as cloud results.</p></div>

      <section aria-label="Your saved collections" className="mt-7 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-4 border-b border-neutral-100 p-4 sm:px-6 sm:py-4 md:flex-row md:items-center">
          <div role="tablist" aria-label="Library collections" className="inline-flex min-w-0 rounded-xl bg-neutral-100/80 p-1">
            {TABS.map(({ id, label, Icon }, index) => <button key={id} ref={(element) => { tabRefs.current[index] = element; }} id={`library-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`library-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => selectTab(id)} onKeyDown={(event) => tabKey(event, index)} className={`inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-[11px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 sm:flex-none sm:px-4 sm:text-[12px] ${tab === id ? "bg-white text-brand-700 shadow-sm" : "text-neutral-600 hover:text-neutral-900"}`}><Icon aria-hidden="true" size={14} className="hidden min-[380px]:block" />{label}<span aria-hidden="true" className={`ml-0.5 grid min-w-5 place-items-center rounded-md px-1.5 py-0.5 text-[10px] ${tab === id ? "bg-brand-50 text-brand-700" : "bg-neutral-200/60 text-neutral-600"}`}>{ready ? (saved[id].length || demos[id].length) : "–"}</span></button>)}
          </div>
          <div className="relative w-full md:max-w-[250px]"><Search aria-hidden="true" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" /><input type="search" value={query} disabled={!ready} aria-label="Search library" placeholder="Search your collection…" onChange={(event) => { setQuery(event.target.value); setPage(0); }} className="h-11 w-full appearance-none rounded-xl border border-neutral-200 bg-white pl-10 pr-11 text-[16px] text-neutral-800 outline-none placeholder:text-neutral-500 focus:border-brand-600 focus:ring-4 focus:ring-brand-50 sm:text-[12px] [&::-webkit-search-cancel-button]:appearance-none" />{query && <button type="button" onClick={() => { setQuery(""); setPage(0); }} aria-label="Clear search" className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-r-xl text-neutral-500 outline-none hover:text-neutral-800 focus-visible:ring-2 focus-visible:ring-brand-600"><X aria-hidden="true" size={15} /></button>}</div>
        </div>

        {warning && <p role="alert" className="mx-5 mt-5 flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-3 text-[12px] leading-relaxed text-brand-800 sm:mx-6"><Info aria-hidden="true" size={15} className="mt-0.5 shrink-0" />{warning}</p>}
        {TABS.map(({ id, label }) => <div key={id} role="tabpanel" id={`library-panel-${id}`} aria-labelledby={`library-tab-${id}`} hidden={tab !== id} tabIndex={0} className="p-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 sm:p-6">
          {tab === id && <>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-[18px] font-extrabold tracking-tight">{label}</h2><p className="mt-1 text-[12px] text-neutral-500">{id === "pins" ? "A title worth saving is a pin worth creating." : "Your next great read is already here."}</p></div><span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1.5 text-[10.5px] font-semibold text-neutral-600">{isDemo ? <Sparkles aria-hidden="true" size={12} /> : <Monitor aria-hidden="true" size={12} />}{isDemo ? "Demo collection" : "Saved on this device"}</span></div>
            {!ready ? <div aria-label="Loading saved collection" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-60 animate-pulse rounded-xl bg-neutral-100" />)}</div> : <>
              {isDemo && <div className="mb-5 flex items-start gap-2 rounded-xl border border-neutral-200 bg-neutral-50/70 px-3.5 py-3 text-[11.5px] leading-relaxed text-neutral-600"><Info aria-hidden="true" size={14} className="mt-0.5 shrink-0" /><p>No saved {id} yet. These six examples are previews, not items saved to your library. <Link href={id === "pins" ? "/pin-generator" : "/article-writer"} prefetch={false} className="font-bold text-brand-700 underline decoration-brand-200 underline-offset-2">{id === "pins" ? "Create your first pin" : "Write your first article"}</Link></p></div>}
              {visible.length ? <div data-testid="library-card-grid" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visible.map((item, index) => id === "pins" ? <PinCard key={item.id} item={item} number={currentPage * LIBRARY_PAGE_SIZE + index + 1} /> : <ArticleCard key={item.id} item={item} onRead={() => setReader(item)} />)}</div> : <div className="rounded-xl border-2 border-dashed border-neutral-200 px-5 py-12 text-center"><Search aria-hidden="true" size={26} className="mx-auto text-neutral-500" /><h3 className="mt-3 text-[16px] font-bold text-neutral-800">No matching {id}</h3><p className="mt-1 text-[12px] text-neutral-500">Try another title or topic.</p><button type="button" onClick={() => { setQuery(""); setPage(0); }} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-neutral-100 px-4 text-[12px] font-bold text-neutral-700 hover:bg-neutral-200">Clear search</button></div>}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4 text-[11px] text-neutral-500"><span aria-live="polite">{filtered.length ? `${currentPage * LIBRARY_PAGE_SIZE + 1}–${Math.min((currentPage + 1) * LIBRARY_PAGE_SIZE, filtered.length)} of ${filtered.length}` : "0"} {isDemo ? "examples" : `saved ${id}`}</span>{pageCount > 1 && <div className="flex items-center gap-2"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label="Previous library page" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-neutral-200 px-3 font-bold text-neutral-700 disabled:opacity-40"><ArrowLeft aria-hidden="true" size={13} /> Previous</button><button type="button" disabled={currentPage + 1 === pageCount} onClick={() => setPage(currentPage + 1)} aria-label="Next library page" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-neutral-200 px-3 font-bold text-neutral-700 disabled:opacity-40">Next <ArrowRight aria-hidden="true" size={13} /></button></div>}</div>
            </>}
          </>}
        </div>)}
      </section>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-[11px] text-neutral-500"><p className="flex items-center gap-1.5"><Monitor aria-hidden="true" size={13} /> Manual tool saves stay on this device. Full Auto results appear in Cloud Library above.</p><Link href={tab === "pins" ? "/pin-generator" : "/article-writer"} prefetch={false} className="inline-flex min-h-11 items-center gap-1.5 font-bold text-brand-700">{tab === "pins" ? "Generate a new pin" : "Write a new article"}<ArrowRight aria-hidden="true" size={13} /></Link></div>
      {reader && <ArticleReader key={reader.id} article={reader} onClose={() => setReader(null)} />}
    </div>
  );
}

function PinCard({ item, number }) {
  return (
    <article data-testid="library-pin-card" className="flex min-w-0 flex-col rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-brand-200 sm:p-5">
      <div className="flex items-center justify-between gap-2"><span className="inline-flex min-w-0 items-center gap-1.5 text-[10.5px] font-semibold text-brand-700"><span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50"><Pin size={15} strokeWidth={1.8} /></span><span className="truncate">{item.category}</span></span><span aria-hidden="true" className="text-[11px] font-semibold tabular-nums text-neutral-400">{String(number).padStart(2, "0")}</span></div>
      <h3 title={item.title} className="mt-4 line-clamp-3 min-h-[48px] text-[16px] font-extrabold leading-[1.5] tracking-[-0.015em] text-neutral-900 [overflow-wrap:anywhere]">{item.title}</h3>
      <p className="mb-5 mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-neutral-500 [overflow-wrap:anywhere]">{item.description || "A saved title, ready for your next Pinterest pin."}</p>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-neutral-100 pt-3"><ContentCopyButton text={item.title} ariaLabel={`Copy pin title: ${item.title}`} /><span className="text-[10.5px] text-neutral-500">{item.isDemo ? "Example pin" : "Saved pin"}</span></div>
    </article>
  );
}

function ArticleCard({ item, onRead }) {
  return (
    <article data-testid="library-article-card" className="flex min-w-0 flex-col rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-brand-200 sm:p-5">
      <div className="flex items-center justify-between gap-2"><span className="inline-flex min-w-0 items-center gap-1.5 text-[10.5px] font-semibold text-neutral-600"><span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-neutral-100"><FileText size={15} strokeWidth={1.8} /></span><span className="truncate">{item.category}</span></span><Bookmark aria-hidden="true" size={14} className="shrink-0 text-brand-600" /></div>
      <h3 title={item.title} className="mt-4 line-clamp-3 min-h-[48px] text-[16px] font-extrabold leading-[1.5] tracking-[-0.015em] text-neutral-900 [overflow-wrap:anywhere]">{item.title}</h3>
      <p className="mb-5 mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-neutral-500 [overflow-wrap:anywhere]">{item.intro || "Open this article to read the full post in your library."}</p>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-neutral-100 pt-3"><span className="text-[10.5px] leading-relaxed text-neutral-500">{item.wordCount > 0 ? <>{item.wordCount.toLocaleString("en-US")} words<br />{item.readMinutes} min read</> : "Title saved"}</span><button type="button" onClick={onRead} aria-label={`Read article: ${item.title}`} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 text-[12px] font-bold text-white outline-none transition-colors hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"><BookOpen aria-hidden="true" size={14} /> Read</button></div>
    </article>
  );
}
