"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, ArrowUpRight, BookOpen, CalendarDays, CheckCircle2, CircleAlert,
  Code2, DollarSign, Eye, FileText, FlaskConical, Info, Monitor,
  MousePointer2, Pin, Save, ShieldCheck, Wallet,
} from "lucide-react";
import { AD_CODE_STORAGE_KEY, INCOME_HISTORY, INCOME_STATS, MAX_AD_CODE_LENGTH, formatIncome, isSavedAdCode, validateAdCode } from "@/lib/income";

const ICONS = { views: Eye, clicks: MousePointer2, earning: DollarSign };
const HISTORY_TOTAL = INCOME_HISTORY.reduce((sum, day) => sum + day.cents, 0);

export default function AdsterraIncome() {
  const [code, setCode] = useState("");
  const [savedCode, setSavedCode] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(AD_CODE_STORAGE_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (isSavedAdCode(parsed)) {
          const saved = { code: parsed.code, savedAt: parsed.savedAt };
          setCode(saved.code);
          setSavedCode(saved);
        } else {
          setFeedback({ type: "error", text: "Saved ad code could not be read. Paste your snippet again to replace it." });
        }
      }
    } catch {
      setFeedback({ type: "error", text: "We could not load saved ad code in this browser. You can still paste a new snippet." });
    } finally {
      setReady(true);
    }
  }, []);

  const dirty = savedCode ? code !== savedCode.code : Boolean(code);
  const status = !ready ? "Loading…" : !savedCode ? "No code saved" : dirty ? "Unsaved changes" : "Code saved locally";

  function handleSave(event) {
    event.preventDefault();
    if (!ready) return;
    const issue = validateAdCode(code);
    setFeedback(null);
    if (issue) {
      setError(issue);
      inputRef.current?.focus();
      return;
    }
    setError("");
    const next = { code, savedAt: new Date().toISOString() };
    try {
      // Store only as text. Never insert a pasted script into the page.
      window.localStorage.setItem(AD_CODE_STORAGE_KEY, JSON.stringify(next));
      setSavedCode(next);
      setFeedback({ type: "success", text: "Ad code saved on this device. Blog integration is not connected yet." });
    } catch {
      setFeedback({ type: "error", text: "Ad code could not be saved in this browser. Your snippet is still in the editor; please try again." });
    }
  }

  return (
    <div className="container-x pb-10 pt-7 sm:pb-14 sm:pt-9">
      <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-2 text-[12px] font-medium text-neutral-500">
        <Link href="/" prefetch={false} className="rounded-sm hover:text-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">Home</Link>
        <span aria-hidden="true" className="text-neutral-300">/</span>
        <span aria-current="page" className="text-neutral-700">Adsterra Income</span>
      </nav>

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.15em] text-brand-600"><Wallet aria-hidden="true" size={13} /> Your monetization hub</p>
          <h1 className="text-[34px] font-extrabold leading-[1.12] tracking-[-0.04em] text-neutral-900 sm:text-[43px]">Adsterra Income</h1>
          <p className="mt-2.5 text-[14px] leading-relaxed text-neutral-500 sm:text-[15.5px]">Your traffic is converting into income automatically</p>
        </div>
        <div className="shrink-0 sm:text-right">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[11.5px] font-bold text-neutral-600"><FlaskConical aria-hidden="true" size={13} /> Demo income</span>
          <p className="mt-1.5 text-[11px] text-neutral-500">Sample numbers · not live earnings</p>
        </div>
      </div>

      <section aria-label="Today's income overview, demo data" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {INCOME_STATS.map((stat) => {
          const Icon = ICONS[stat.key];
          const accent = stat.key === "earning";
          return (
            <div key={stat.key} data-testid={`income-stat-${stat.key}`} className={`min-w-0 rounded-2xl border p-4 shadow-sm sm:p-5 ${accent ? "col-span-2 border-brand-100 bg-brand-50/60 sm:col-span-1" : "border-neutral-200 bg-white"}`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className={`text-[12px] font-semibold sm:text-[13px] ${accent ? "text-brand-800" : "text-neutral-600"}`}>{stat.label}</h2>
                <span aria-hidden="true" className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${accent ? "bg-brand-600 text-white" : "bg-neutral-50 text-neutral-500"}`}><Icon size={16} strokeWidth={1.8} /></span>
              </div>
              <p className={`mt-4 text-[30px] font-extrabold leading-none tracking-[-0.04em] tabular-nums sm:text-[34px] ${accent ? "text-brand-700" : "text-neutral-900"}`}>{stat.value}</p>
              <p className={`mt-2.5 text-[10.5px] leading-relaxed sm:text-[11px] ${accent ? "text-brand-800/80" : "text-neutral-500"}`}>{stat.caption}</p>
            </div>
          );
        })}
      </section>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-labelledby="ad-setup-heading" className="min-w-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-5 py-5 sm:px-6">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><Code2 size={19} /></span>
              <div><h2 id="ad-setup-heading" className="text-[18px] font-extrabold tracking-tight">Ad Code Setup</h2><p className="mt-0.5 text-[12px] text-neutral-500">Keep your monetization snippet in one place.</p></div>
            </div>
            <span data-testid="ad-code-status" className={`rounded-full px-2.5 py-1.5 text-[10.5px] font-semibold ${savedCode && !dirty ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>{status}</span>
          </div>

          <form aria-label="Adsterra ad code settings" onSubmit={handleSave} className="p-5 sm:p-6">
            <label htmlFor="adsterra-code" className="mb-2.5 block text-[13px] font-bold text-neutral-800">Paste Your Adsterra Ad Code Here</label>
            <div className={`overflow-hidden rounded-xl border ${error ? "border-brand-600" : "border-neutral-200"} focus-within:border-brand-600 focus-within:ring-4 focus-within:ring-brand-50`}>
              <div aria-hidden="true" className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-[10px] font-semibold text-neutral-500">
                <span className="flex items-center gap-1.5"><Code2 size={12} /> HTML / JavaScript</span><span className="flex items-center gap-1"><ShieldCheck size={12} /> Stored as text</span>
              </div>
              <textarea
                ref={inputRef}
                id="adsterra-code"
                value={code}
                disabled={!ready}
                onChange={(event) => { setCode(event.target.value); setError(""); setFeedback(null); }}
                rows={8}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                aria-invalid={Boolean(error)}
                aria-describedby={`ad-code-help${error ? " ad-code-error" : ""}`}
                placeholder={'<!-- Paste the complete ad snippet\n     from your Adsterra account here. -->'}
                className="block min-h-[190px] w-full resize-y bg-white p-3.5 font-mono text-[16px] leading-[1.8] text-neutral-700 outline-none placeholder:text-neutral-500 disabled:opacity-50 sm:text-[13px]"
              />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-1.5 text-[10.5px]">
              <p id="ad-code-help" className="text-neutral-500">Paste the complete snippet, including any script tags.</p>
              <span className={`tabular-nums ${code.length > MAX_AD_CODE_LENGTH ? "font-bold text-brand-700" : "text-neutral-500"}`}>{code.length.toLocaleString("en-US")} / 50,000</span>
            </div>
            {error && <p role="alert" id="ad-code-error" className="mt-2 flex items-start gap-1.5 text-[12px] font-semibold text-brand-700"><CircleAlert aria-hidden="true" size={15} className="mt-0.5 shrink-0" />{error}</p>}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="submit" disabled={!ready} className="btn-primary w-full gap-2 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600 sm:w-auto"><Save aria-hidden="true" size={16} /> Save Ad Code</button>
              <span className="inline-flex items-center gap-1.5 text-[10.5px] text-neutral-500"><Monitor aria-hidden="true" size={13} /> Saves to this device</span>
            </div>
            {feedback && <p role={feedback.type === "error" ? "alert" : "status"} aria-atomic="true" className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12px] font-medium leading-relaxed ${feedback.type === "error" ? "bg-brand-50 text-brand-800" : "bg-emerald-50 text-emerald-800"}`}>{feedback.type === "error" ? <CircleAlert aria-hidden="true" size={15} className="mt-0.5 shrink-0" /> : <CheckCircle2 aria-hidden="true" size={15} className="mt-0.5 shrink-0" />}{feedback.text}</p>}
            {savedCode && <p className="mt-2.5 text-[10.5px] text-neutral-500">Last saved: {new Date(savedCode.savedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>}

            <div className="mt-5 flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50/40 p-3.5">
              <Info aria-hidden="true" size={15} className="mt-0.5 shrink-0 text-brand-600" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-brand-800">After blog integration is connected</p>
                <p className="mt-1 text-[12px] leading-relaxed text-neutral-700">Your Adsterra ads will show automatically on your Blog articles</p>
              </div>
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-neutral-500">For now, code is stored only in this browser and is never executed on this page. Blog ad rendering and live Adsterra reporting are not connected yet.</p>
          </form>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><Wallet size={19} /></span>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-700">The income journey</p>
            <h2 className="mt-2 text-[21px] font-extrabold leading-snug tracking-tight text-neutral-900">Good content.<br />Real readership.</h2>
            <p className="mt-2 text-[12px] leading-relaxed text-neutral-500">Build a collection worth visiting. Eligible ad impressions can become income once your blog and ads are connected.</p>
            <ol className="mt-5 space-y-4">
              {[[Pin, "Create engaging pins", "Give readers a reason to click."], [FileText, "Keep them reading", "Useful articles make visits count."], [DollarSign, "Monetize your content", "Connect approved ads to your blog."]].map(([Icon, title, description], index) => (
                <li key={title} className="flex items-start gap-3">
                  <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-600"><Icon size={14} /></span>
                  <div><p className="text-[12px] font-bold text-neutral-700">{index + 1}. {title}</p><p className="mt-0.5 text-[10.5px] leading-relaxed text-neutral-500">{description}</p></div>
                </li>
              ))}
            </ol>
            <Link href="/library" prefetch={false} className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-3 py-3 text-[12px] font-bold text-white transition-colors hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"><BookOpen aria-hidden="true" size={15} /> Open My Library <ArrowUpRight aria-hidden="true" size={14} /></Link>
          </div>
          <p className="flex items-start gap-2 px-1 text-[10.5px] leading-relaxed text-neutral-500"><ShieldCheck aria-hidden="true" size={14} className="mt-0.5 shrink-0" /> Never paste account passwords or API keys here. Only use your publisher ad snippet.</p>
        </aside>
      </div>

      <section aria-labelledby="income-history-heading" className="mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
          <div><h2 id="income-history-heading" className="text-[18px] font-extrabold tracking-tight">Income History</h2><p className="mt-1 text-[12.5px] text-neutral-500">A five-day snapshot of traffic and income.</p></div>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-[11px] font-semibold text-neutral-600"><CalendarDays aria-hidden="true" size={13} /> Last 5 days</span>
        </div>
        <p className="flex items-center gap-1.5 border-t border-neutral-100 px-5 py-2 text-[11px] text-neutral-500 sm:hidden">Swipe to see all columns <ArrowRight aria-hidden="true" size={12} /></p>
        <div role="region" aria-label="Income history table, scroll horizontally on small screens" tabIndex={0} data-testid="income-history-scroll" className="overflow-x-auto overscroll-x-contain focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600">
          <table className="w-full min-w-[480px] border-collapse text-left">
            <caption className="sr-only">Five days of demo views, clicks and earnings in US dollars.</caption>
            <thead><tr className="border-y border-neutral-100 bg-neutral-50/80 text-[10.5px] font-bold uppercase tracking-[0.09em] text-neutral-500"><th scope="col" className="px-5 py-3.5 sm:pl-6">Date</th><th scope="col" className="px-5 py-3.5 text-right">Views</th><th scope="col" className="px-5 py-3.5 text-right">Clicks</th><th scope="col" className="px-5 py-3.5 text-right sm:pr-6">Earning</th></tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {INCOME_HISTORY.map((day, index) => <tr key={day.date} className="transition-colors hover:bg-neutral-50/70"><th scope="row" className="px-5 py-4 text-[12px] font-semibold text-neutral-700 sm:pl-6"><span className="inline-flex items-center gap-2">{index === 0 && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand-600" />}{day.date}</span></th><td className="px-5 py-4 text-right text-[13px] font-semibold tabular-nums text-neutral-700">{day.views.toLocaleString("en-US")}</td><td className="px-5 py-4 text-right text-[13px] font-semibold tabular-nums text-neutral-700">{day.clicks.toLocaleString("en-US")}</td><td className="px-5 py-4 text-right text-[13px] font-bold tabular-nums text-brand-700 sm:pr-6">{formatIncome(day.cents)}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 bg-neutral-50/50 px-5 py-3.5 text-[11px] text-neutral-500 sm:px-6"><span className="inline-flex items-center gap-1.5"><FlaskConical aria-hidden="true" size={12} /> Demo data · USD</span><span>5-day demo total <strong className="ml-1.5 font-bold tabular-nums text-neutral-800">{formatIncome(HISTORY_TOTAL)}</strong></span></div>
      </section>
    </div>
  );
}
