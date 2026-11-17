"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BarChart3, Clock3, Globe2, Loader2, RefreshCw, Sparkles, TrendingUp } from 'lucide-react';
import { useAuth } from '@/components/providers/AppProvider';
import { generateWithAI } from '@/lib/ai-client';
import { saveCloudDraft } from '@/lib/cloud-library';
import CopyButton from '@/components/CopyButton';

const REGIONS = [
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'CA', label: 'Canada' },
];
const inputClass = 'mt-1.5 min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 text-[14px] outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-50 disabled:bg-neutral-100';

function snapshotTime(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Not available';
  return `${new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }).format(date)} UTC`;
}
function estimatePercent(value) {
  if (value > 0) return `+${value}%`;
  if (value < 0) return `−${Math.abs(value)}%`;
  return '0%';
}
function estimateStatus(status) {
  if (status === 'baseline_building') return 'Waiting for the previous daily snapshot.';
  if (status === 'snapshot_gap') return 'No consecutive daily snapshot; no percentage shown.';
  if (status === 'no_matching_trend') return 'No matching trend in the previous daily snapshot.';
  if (status === 'traffic_bucket_unavailable') return 'A comparable traffic bucket is unavailable.';
  return 'Not enough comparable daily data.';
}
function resultText(output) {
  if (!output?.result?.ideas) return '';
  const lines = [`Trend: ${output.result.trend} · ${output.result.region}`, ''];
  output.result.ideas.forEach((idea, index) => {
    lines.push(`Idea ${index + 1}: ${idea.pinTitle}`, idea.concept, `Likely audience (hypothesis): ${idea.likelyAudience}`, `Format: ${idea.contentStrategy.format}`, `Hook: ${idea.contentStrategy.hook}`, `Visual direction: ${idea.contentStrategy.visualDirection}`, `Core takeaway: ${idea.contentStrategy.coreTakeaway}`, `Call to action: ${idea.contentStrategy.callToAction}`, `Keyword suggestions: ${idea.keywordSuggestions.join(', ')}`, '');
  });
  lines.push(output.result.note, 'No Pin was published or scheduled.');
  return lines.join('\n');
}

export default function TrendFinder() {
  const { user, authLoading, openLogin } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [region, setRegion] = useState('US');
  const [language, setLanguage] = useState('en');
  const [consent, setConsent] = useState(false);
  const [busyTrend, setBusyTrend] = useState(null);
  const [output, setOutput] = useState(null);
  const [historySave, setHistorySave] = useState({ status: 'idle', content: null, requestKey: null, message: '' });
  const historyEntry = useRef(null);
  const [aiError, setAiError] = useState('');
  const readController = useRef(null);
  const readSequence = useRef(0);
  const generationController = useRef(null);
  const generationSequence = useRef(0);
  const userIdRef = useRef(user?.id || null);
  const reportIsLoadedRef = useRef(false);
  userIdRef.current = user?.id || null;
  reportIsLoadedRef.current = Boolean(report);

  const loadLatest = useCallback(async () => {
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    const request = ++readSequence.current;
    setLoadError('');
    if (reportIsLoadedRef.current) setRefreshing(true); else setLoading(true);
    try {
      const response = await fetch('/api/trend-finder', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
      let data;
      try { data = await response.json(); } catch { throw new Error('The daily trend snapshot could not be read. Please try again.'); }
      if (!response.ok) throw new Error(data.error || 'Trend data is temporarily unavailable.');
      if (request === readSequence.current) setReport(data);
    } catch (error) {
      if (error.name !== 'AbortError' && request === readSequence.current) setLoadError(error.message || 'Trend data is temporarily unavailable.');
    } finally {
      if (request === readSequence.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    loadLatest();
    return () => { readSequence.current++; readController.current?.abort(); };
  }, [loadLatest]);

  useEffect(() => {
    generationSequence.current++;
    generationController.current?.abort();
    setBusyTrend(null);
    setOutput(null);
    historyEntry.current = null;
    setHistorySave({ status: 'idle', content: null, requestKey: null, message: '' });
    setAiError('');
    setConsent(false);
  }, [user?.id]);

  function trendHistoryContent(response, trendId) {
    return { historyType: 'trend_ideas', title: `${response.result.trend} Pin ideas`, topic: response.result.trend, category: `Trend Finder · ${response.result.region}`, region: response.result.region, trendId, language: response.result.language, result: response.result, generation: response.generation, description: response.result.note };
  }

  async function persistTrendHistory(entry, account, request, alreadySaved = false) {
    setHistorySave({ status: alreadySaved ? 'saved' : 'saving', content: entry.content, requestKey: entry.requestKey, message: '' });
    if (alreadySaved) return;
    try {
      await saveCloudDraft('history', entry.content, entry.requestKey);
      if (userIdRef.current === account && request === generationSequence.current) setHistorySave({ status: 'saved', content: entry.content, requestKey: entry.requestKey, message: '' });
    } catch (error) {
      if (userIdRef.current === account && request === generationSequence.current) setHistorySave({ status: 'error', content: entry.content, requestKey: entry.requestKey, message: error.message || 'The ideas are ready, but their private Library save could not be confirmed.' });
    }
  }

  async function retryTrendHistory() {
    if (!historyEntry.current || !user) return;
    await persistTrendHistory(historyEntry.current, user.id, generationSequence.current, false);
  }

  async function generateIdeas(trend) {
    setAiError('');
    if (!consent) { setAiError('Confirm the AI-use notice before generating ideas.'); return; }
    if (authLoading) return;
    if (!user) { openLogin(); return; }
    if (!report?.snapshotFresh) { setAiError('A fresh daily snapshot is required before generating ideas.'); return; }

    generationController.current?.abort();
    const controller = new AbortController();
    generationController.current = controller;
    const account = user.id;
    const request = ++generationSequence.current;
    setBusyTrend(trend.id);
    setOutput(null);
    historyEntry.current = null;
    setHistorySave({ status: 'idle', content: null, requestKey: null, message: '' });
    try {
      const result = await generateWithAI('trend_ideas', { region, trendId: trend.id, language }, { signal: controller.signal });
      if (userIdRef.current === account && request === generationSequence.current) {
        setOutput({ ownerId: account, region, trendId: trend.id, response: result });
        const entry = { content: trendHistoryContent(result, trend.id), requestKey: result.requestKey };
        historyEntry.current = entry;
        await persistTrendHistory(entry, account, request, result.library?.saved === true);
      }
    } catch (error) {
      if (error.name !== 'AbortError' && userIdRef.current === account && request === generationSequence.current) setAiError(error.message || 'AI ideas could not be confirmed. No substitute content was shown.');
    } finally {
      if (request === generationSequence.current) setBusyTrend(null);
    }
  }

  const regionData = report?.regions?.find(item => item.code === region);
  const trends = regionData?.trends || [];
  const visibleOutput = output && output.ownerId === user?.id && output.region === region ? output : null;

  return <div className="container-x pb-14 pt-8 sm:pb-20 sm:pt-11" data-testid="trend-finder-page">
    <header className="max-w-3xl">
      <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand-700"><TrendingUp size={15} aria-hidden="true" /> Trend discovery · Daily snapshots</p>
      <h1 className="mt-4 text-[34px] font-extrabold leading-[1.08] tracking-[-0.045em] sm:text-[48px]">AI Trend Finder Automation</h1>
      <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-neutral-600">Explore the latest daily capture of Google Trends’ Trending Now feed for the United States, United Kingdom and Canada. Get a transparent PinCraft estimate from daily snapshots, then turn selected topics into Pinterest Pin concepts.</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold text-neutral-500"><span className="inline-flex items-center gap-1.5"><Globe2 size={14} aria-hidden="true" /> Google Trends RSS only</span><span className="inline-flex items-center gap-1.5"><Clock3 size={14} aria-hidden="true" /> Collected once daily (UTC)</span><span className="inline-flex items-center gap-1.5"><BarChart3 size={14} aria-hidden="true" /> PinCraft estimate, not Google’s growth percentage</span></div>
    </header>

    <section className="mt-6 grid gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5" aria-label="Snapshot status">
      <div>
        <p className="text-[12px] font-extrabold text-neutral-900">Latest daily snapshot</p>
        {report?.snapshotDate ? <p className="mt-1 text-[11px] text-neutral-600">Captured {snapshotTime(report.capturedAt)} · Snapshot date {report.snapshotDate} (UTC)</p> : <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">{loading ? 'Checking for the first daily collection…' : 'No daily snapshot has been collected yet. No sample trend list is shown.'}</p>}
      </div>
      <button type="button" onClick={loadLatest} disabled={loading || refreshing} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-200 px-3.5 text-[11px] font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />{refreshing ? 'Reloading…' : 'Reload latest snapshot'}</button>
    </section>

    {loadError && <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[12px] leading-relaxed text-amber-900">{loadError} {report?.snapshotDate ? 'The previously loaded snapshot remains visible.' : ''}</p>}
    {report?.snapshotDate && !report.snapshotFresh && <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[12px] leading-relaxed text-amber-900">This snapshot is older than 48 hours. It is shown with its capture date, but idea generation is paused until a fresh daily collection is available.</p>}

    <div className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section className="min-w-0" aria-labelledby="trend-list-title">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div><p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Regional snapshot</p><h2 id="trend-list-title" className="mt-1 text-[23px] font-extrabold tracking-tight">Trending searches</h2></div>
          <a href={regionData?.sourceUrl || 'https://trends.google.com/trending/rss?geo=US'} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-[11px] font-bold text-brand-700">Open Google Trends RSS<ArrowUpRight size={13} aria-hidden="true" /></a>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Choose trend region">
          {REGIONS.map(item => <button key={item.code} type="button" aria-pressed={region === item.code} onClick={() => { setRegion(item.code); setAiError(''); }} className={`min-h-11 rounded-xl border px-4 text-[12px] font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-brand-600 ${region === item.code ? 'border-brand-600 bg-brand-600 text-white' : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50'}`} data-testid={`trend-region-${item.code}`}>{item.label}</button>)}
        </div>
        {aiError && <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[11px] leading-relaxed text-amber-900">{aiError}</p>}

        {loading && <div className="mt-4 space-y-3" aria-label="Loading trends">{[1, 2, 3].map(item => <div key={item} className="h-40 animate-pulse rounded-2xl border border-neutral-200 bg-white" />)}</div>}
        {!loading && report?.snapshotDate && trends.length === 0 && <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-6 text-[13px] text-neutral-500">No trend entries were saved for this region in the latest snapshot.</div>}
        {!loading && report?.snapshotDate && trends.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {trends.map((trend, index) => {
            const estimate = trend.pinCraftEstimate;
            const selectedOutput = visibleOutput?.trendId === trend.id ? visibleOutput.response : null;
            const copying = busyTrend === trend.id;
            return <article key={trend.id} className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5" data-testid="trend-card">
              <div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-neutral-50 text-[12px] font-extrabold text-neutral-500">{index + 1}</span><h3 className="min-w-0 flex-1 pt-1 text-[15px] font-extrabold leading-snug text-neutral-900">{trend.title}</h3></div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-neutral-50 px-3 py-2.5">
                <div><p className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-400">Google RSS approximate traffic</p><p className="mt-0.5 text-[12px] font-bold text-neutral-700">{trend.approxTraffic || 'Bucket unavailable'}</p></div>
                <div className="text-right"><p className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-400">PinCraft estimate</p>{estimate?.status === 'ready' ? <p className={`mt-0.5 text-[15px] font-extrabold ${estimate.percent > 0 ? 'text-emerald-700' : estimate.percent < 0 ? 'text-amber-700' : 'text-neutral-700'}`}>{estimatePercent(estimate.percent)}</p> : <p className="mt-0.5 text-[11px] font-bold text-neutral-600">No estimate yet</p>}</div>
              </div>
              {estimate?.status === 'ready' ? <p className="mt-2 text-[10px] leading-relaxed text-neutral-500">Compared with the {estimate.comparedDate} daily snapshot.</p> : <p className="mt-2 text-[10px] leading-relaxed text-neutral-500">{estimateStatus(estimate?.status)}{estimate?.comparedDate ? ` (${estimate.comparedDate})` : ''}</p>}
              <button type="button" onClick={() => generateIdeas(trend)} disabled={Boolean(busyTrend) || !report.snapshotFresh || authLoading} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-3 text-[11px] font-bold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Generate Pin ideas for ${trend.title}`}>
                {copying ? <><Loader2 size={15} className="animate-spin" aria-hidden="true" />Generating three ideas…</> : <><Sparkles size={15} aria-hidden="true" />Generate Pinterest Pin ideas</>}
              </button>
              {selectedOutput && <div className="mt-4 space-y-3 border-t border-neutral-100 pt-4" data-testid="trend-ideas-result">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-[10.5px] leading-relaxed text-emerald-900"><strong>AI-generated brainstorming.</strong> Review before using. This does not publish or schedule a Pin.</p><CopyButton text={resultText(selectedOutput)} label="Copy ideas" className="!min-h-11 !px-3 !text-[10px]" /></div>
                {selectedOutput.result.ideas.map((idea, ideaIndex) => <section key={`${idea.pinTitle}-${ideaIndex}`} className="rounded-xl border border-neutral-200 p-3.5">
                  <p className="text-[9px] font-extrabold uppercase tracking-wider text-brand-700">Pin idea {ideaIndex + 1}</p><h4 className="mt-1 text-[13px] font-extrabold leading-snug">{idea.pinTitle}</h4><p className="mt-2 text-[11px] leading-relaxed text-neutral-600">{idea.concept}</p>
                  <p className="mt-3 text-[10px] leading-relaxed"><strong className="text-neutral-800">Likely audience hypothesis:</strong> <span className="text-neutral-600">{idea.likelyAudience}</span></p>
                  <div className="mt-3 rounded-lg bg-neutral-50 p-3"><p className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-500">Content strategy</p><dl className="mt-2 space-y-1.5 text-[10px] leading-relaxed"><div><dt className="inline font-bold text-neutral-800">Format: </dt><dd className="inline text-neutral-600">{idea.contentStrategy.format}</dd></div><div><dt className="inline font-bold text-neutral-800">Hook: </dt><dd className="inline text-neutral-600">{idea.contentStrategy.hook}</dd></div><div><dt className="inline font-bold text-neutral-800">Visual: </dt><dd className="inline text-neutral-600">{idea.contentStrategy.visualDirection}</dd></div><div><dt className="inline font-bold text-neutral-800">Takeaway: </dt><dd className="inline text-neutral-600">{idea.contentStrategy.coreTakeaway}</dd></div><div><dt className="inline font-bold text-neutral-800">CTA: </dt><dd className="inline text-neutral-600">{idea.contentStrategy.callToAction}</dd></div></dl></div>
                  <p className="mt-3 text-[10px] leading-relaxed text-neutral-500"><strong className="text-neutral-700">Keyword suggestions:</strong> {idea.keywordSuggestions.join(' · ')}</p>
                </section>)}
                <p className="text-[10px] leading-relaxed text-neutral-500">{selectedOutput.result.note}</p>
                {historySave.status === 'saved' && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[10.5px] text-emerald-800">Automatically saved to your private My Library. No Pin was published or scheduled.</p>}
                {historySave.status === 'saving' && <p role="status" className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-[10.5px] text-neutral-600">Saving ideas to My Library…</p>}
                {historySave.status === 'error' && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10.5px] leading-relaxed text-amber-900">{historySave.message} <button type="button" onClick={retryTrendHistory} className="ml-1 min-h-9 font-extrabold underline underline-offset-2">Retry Library save</button></p>}
              </div>}
            </article>;
          })}
        </div>}
        {!loading && !report?.snapshotDate && !loadError && <div className="mt-4 rounded-2xl border border-dashed border-neutral-300 bg-white p-6"><h3 className="text-[14px] font-extrabold">Waiting for the first daily collection</h3><p className="mt-2 text-[12px] leading-relaxed text-neutral-500">The scheduled collector reads Google Trends RSS for all three regions once a day. This page does not invent sample trends or percentages while a snapshot is missing.</p></div>}
      </section>

      <aside className="space-y-4">
        {!authLoading && !user && <section className="rounded-2xl border border-brand-100 bg-brand-50/50 p-5"><h2 className="text-[14px] font-extrabold">Generate idea drafts</h2><p className="mt-2 text-[11px] leading-relaxed text-neutral-600">Browse public daily trends without signing in. A verified account is required to request AI-generated Pin concepts.</p><button type="button" onClick={openLogin} className="btn-primary mt-4 w-full !min-h-11 !text-[11px]">Sign in / Create account</button></section>}
        <section className="rounded-2xl border border-neutral-200 bg-white p-5"><div className="flex items-center gap-2"><Sparkles size={17} className="text-brand-700" aria-hidden="true"/><h2 className="text-[14px] font-extrabold">AI idea settings</h2></div><label className="mt-4 block text-[11px] font-bold text-neutral-700">Output language<select aria-label="Trend idea output language" value={language} onChange={event => { setLanguage(event.target.value); setOutput(null); setAiError(''); }} disabled={Boolean(busyTrend)} className={inputClass}><option value="en">English</option><option value="bn">বাংলা · Bengali</option></select></label>
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-[10.5px] leading-relaxed text-neutral-600"><input type="checkbox" checked={consent} disabled={Boolean(busyTrend) || authLoading} onChange={event => { setConsent(event.target.checked); setAiError(''); }} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"/><span>I agree to send the selected trend phrase, region and language to PinCraft’s configured AI service. Requests use shared AI limits. The generated text is for review only.</span></label>
          <p className="mt-3 text-[10px] leading-relaxed text-neutral-500">The audience is an AI hypothesis, not measured demographics. Google search activity is not Pinterest demand. No reach or virality is promised.</p>
        </section>
        <section className="rounded-2xl bg-neutral-950 p-5 text-white"><div className="flex items-center gap-2"><BarChart3 size={17} className="text-brand-300" aria-hidden="true"/><h2 className="text-[14px] font-extrabold">How the estimate works</h2></div><p className="mt-3 text-[10.5px] leading-relaxed text-neutral-300">{report?.estimateMethod || 'PinCraft compares lower-bound values from Google Trends RSS approximate-traffic buckets across consecutive daily snapshots.'}</p><details className="mt-3 rounded-xl border border-white/10 p-3"><summary className="cursor-pointer text-[10px] font-bold text-white">Important limitations</summary><ul className="mt-2 list-disc space-y-1 pl-4 text-[10px] leading-relaxed text-neutral-300"><li>This is not Google’s official growth percentage or exact search volume.</li><li>Bucket thresholds are coarse; a displayed change is only a PinCraft estimate.</li><li>No estimate is shown for a missing baseline, snapshot gap or unmatched trend.</li><li>Search trends do not guarantee Pinterest interest or reach.</li></ul></details><p className="mt-4 border-t border-white/10 pt-4 text-[10.5px] leading-relaxed text-neutral-300">Pinterest publishing remains manual. Ideas are drafts; this tool does not connect to Pinterest or publish Pins.</p></section>
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4"><p className="text-[10px] leading-relaxed text-neutral-500">Source: <a href="https://trends.google.com/trending/rss?geo=US" target="_blank" rel="noreferrer" className="font-bold text-brand-700 underline underline-offset-2">Google Trends Trending Now RSS</a>. The RSS feed can change between daily PinCraft captures.</p></div>
      </aside>
    </div>
  </div>;
}
