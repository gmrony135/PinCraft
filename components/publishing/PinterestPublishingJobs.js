"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, Loader2, Pin, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../providers/AppProvider';
import CopyButton from '../CopyButton';

const btn = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3.5 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const field = 'mt-1.5 min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-[16px] font-normal outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-50 sm:text-[12px]';
const statusLabel = { pin_prepared: 'Pin Prepared', pinterest_opened: 'Pinterest Opened', user_confirmed: 'User Confirmed', published: 'Published · user-reported', failed: 'Failed' };
const pendingStatus = new Set(['pin_prepared', 'pinterest_opened', 'user_confirmed']);
function formatDate(value) { const date = value ? new Date(value) : null; return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—'; }

export default function PinterestPublishingJobs() {
  const { user, authLoading, openLogin } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('all');
  const [confirmed, setConfirmed] = useState({});
  const [pinURLs, setPinURLs] = useState({});
  const [linkChecked, setLinkChecked] = useState({});
  const [defaultURL, setDefaultURL] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const owner = useRef(null), sequence = useRef(0), pending = useRef(false);
  owner.current = user?.id || null;

  const load = useCallback(async () => {
    const uid = owner.current, request = ++sequence.current;
    if (!uid) { setData(null); setLoading(false); return; }
    try {
      const response = await fetch('/api/pinterest/publishing', { cache: 'no-store', credentials: 'same-origin' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Your private Pinterest jobs could not be loaded.');
      if (owner.current === uid && sequence.current === request && result.accountId === uid) {
        setData(result); setDefaultURL(result.settings?.defaultDestinationURL || ''); setError('');
      }
    } catch (issue) { if (owner.current === uid && sequence.current === request) setError(issue.message || 'Your private Pinterest jobs could not be loaded.'); }
    finally { if (owner.current === uid && sequence.current === request) setLoading(false); }
  }, []);

  useEffect(() => {
    setData(null); setLoading(true); setError(''); setNotice(''); setBusy(''); pending.current = false;
    setConfirmed({}); setPinURLs({}); setLinkChecked({});
    if (!authLoading) load();
    const refresh = () => { if (!document.hidden && !pending.current && owner.current) load(); };
    const timer = setInterval(refresh, 45000);
    document.addEventListener('visibilitychange', refresh);
    return () => { sequence.current++; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [authLoading, user?.id, load]);

  const rows = data && user && data.accountId === user.id ? data.jobs || [] : [];
  const counts = useMemo(() => ({
    pending: rows.filter(job => pendingStatus.has(job.status)).length,
    completed: rows.filter(job => job.status === 'published').length,
    failed: rows.filter(job => job.status === 'failed').length,
  }), [rows]);
  const visible = rows.filter(job => filter === 'all' || filter === 'pending' && pendingStatus.has(job.status) || filter === 'completed' && job.status === 'published' || filter === 'failed' && job.status === 'failed');

  async function post(body, jobId = '') {
    if (!user || pending.current) return;
    const uid = user.id; pending.current = true; setBusy(jobId || body.action); setError(''); setNotice('');
    try {
      const response = await fetch('/api/pinterest/publishing', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'The saved Pin job was not changed.');
      if (owner.current !== uid) return;
      if (result.job) setData(current => current && current.accountId === uid ? { ...current, jobs: current.jobs.map(job => job.id === result.job.id ? result.job : job) } : current);
      if (result.settings) { setData(current => current && current.accountId === uid ? { ...current, settings: result.settings } : current); setDefaultURL(result.settings.defaultDestinationURL || ''); }
      setNotice(body.action === 'opened' ? 'Pinterest Opened. This is not proof of a saved or published Pin.' : body.action === 'confirm' ? 'User Confirmed. PinCraft has not independently verified publication.' : body.action === 'published' ? 'Recorded as Published from your checked link. It is user-reported, not API-verified.' : body.action === 'retry' ? 'A bounded validation retry was scheduled. Nothing was sent to Pinterest.' : 'Your private Pin settings were saved.');
      await load();
    } catch (issue) { if (owner.current === uid) setError(issue.message || 'The saved Pin job was not changed.'); }
    finally { if (owner.current === uid) { pending.current = false; setBusy(''); } }
  }

  async function openPinterest(job) {
    // Opens only Pinterest's official user-facing Create/Save page. No page
    // inspection, login handling, board selection or Save clicks are automated.
    window.open(job.pinterestCreateURL, '_blank', 'noopener,noreferrer');
    await post({ action: 'opened', jobId: job.id }, job.id);
  }

  async function saveSettings(event) {
    event.preventDefault();
    if (!user || pending.current) return;
    setSettingsBusy(true);
    try { await post({ action: 'settings', defaultDestinationURL: defaultURL.trim() }); }
    finally { setSettingsBusy(false); }
  }

  return <section data-testid="pinterest-publishing-dashboard" className="container-x pb-12">
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Pin size={19} aria-hidden="true" /></span><div><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-brand-700">Pinterest · manual publishing workflow</p><h2 className="mt-1 text-[20px] font-extrabold tracking-tight text-neutral-900">Your Pin jobs</h2><p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-neutral-600">Every Pin, setting, history item and status belongs to your signed-in account. You choose the board and click Save in Pinterest. PinCraft never handles your Pinterest password, login session, cookies or publishing clicks.</p></div></div>
        <Link href="/pin-generator" prefetch={false} className={`${btn} shrink-0 bg-brand-600 text-white hover:bg-brand-700`}>Prepare a Pin</Link>
      </div>

      {!authLoading && !user ? <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-[12px] font-bold text-amber-950">Sign in to see your private Pinterest jobs.</p><button type="button" onClick={openLogin} className={`${btn} mt-3 bg-neutral-900 text-white hover:bg-black`}><ShieldCheck size={14} aria-hidden="true" />Sign in</button></div> : (error && !data) ? <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-sm font-bold">Pin jobs could not be loaded</p><p className="mt-2 text-xs">{error}</p><p className="mt-2 text-xs">Counts and empty-state results are unavailable until loading succeeds.</p><button type="button" onClick={load} className={`${btn} mt-3 bg-white border border-red-200`}>Retry loading Pin jobs</button></div> : loading ? <p role="status" className="mt-5 flex items-center gap-2 py-8 text-[12px] text-neutral-500"><Loader2 size={15} className="animate-spin" />Loading your private Pin jobs…</p> : <>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[[Clock3, 'Pending', counts.pending], [CheckCircle2, 'Completed · user-reported', counts.completed], [AlertTriangle, 'Failed', counts.failed]].map(([Icon, label, count]) => <div key={label} className="rounded-xl border border-neutral-200 bg-white p-3.5"><div className="flex items-center gap-2 text-neutral-500"><Icon size={15} aria-hidden="true" /><span className="text-[10px] font-bold">{label}</span></div><p className="mt-2 text-[22px] font-extrabold text-neutral-900">{count}</p></div>)}
        </div>

        <form onSubmit={saveSettings} className="mt-4 rounded-xl border border-neutral-200 bg-white p-4">
          <h3 className="text-[12px] font-extrabold text-neutral-900">Private publishing default</h3><p className="mt-1 text-[10.5px] leading-relaxed text-neutral-500">Save a destination URL for your next Pin. It remains private to your account until you prepare a Pin.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"><label className="min-w-0 flex-1 text-[11px] font-bold text-neutral-700">Default destination URL<input aria-label="Private default Pinterest destination URL" type="url" maxLength={2048} value={defaultURL} onChange={event => setDefaultURL(event.target.value)} className={field} placeholder="https://example.com/your-page" /></label><button type="submit" disabled={settingsBusy || Boolean(busy)} className={`${btn} shrink-0 border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50`}>{settingsBusy ? <Loader2 size={14} className="animate-spin" /> : null}Save private default</button></div>
        </form>

        <div className="mt-5 flex flex-wrap items-center gap-2" aria-label="Filter Pinterest jobs">
          {[['all', 'All'], ['pending', 'Pending'], ['completed', 'Completed'], ['failed', 'Failed']].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`${btn} min-h-9 px-3 ${filter === value ? 'bg-neutral-900 text-white' : 'border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}>{label}</button>)}
          <span className="ml-auto text-[10px] text-neutral-400">Latest {data?.limit || 100} jobs · no sample activity</span>
        </div>

        {visible.length ? <div className="mt-3 grid gap-3">{visible.map(job => <article key={job.id} data-testid={`pinterest-job-${job.id}`} className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
          <div className="grid gap-4 md:grid-cols-[140px_minmax(0,1fr)]">
            <div><a href={job.imageURL} target="_blank" rel="noopener noreferrer" aria-label={`View processed Pin image ${job.id}`}><img src={job.imageURL} alt={`Prepared Pinterest artwork: ${job.title}`} width="1000" height="1500" loading="lazy" className="mx-auto max-h-64 w-auto rounded-xl border border-neutral-100 bg-neutral-50 object-contain md:max-h-56" /></a><a href={job.imageURL} download={`pincraft-${job.id}.webp`} className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-neutral-200 px-2 text-[10px] font-bold text-neutral-700 hover:bg-neutral-50">Download prepared image</a></div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold ${job.status === 'published' ? 'bg-emerald-50 text-emerald-800' : job.status === 'failed' ? 'bg-red-50 text-red-800' : 'bg-neutral-100 text-neutral-700'}`}>{statusLabel[job.status] || job.status}</span><span className="text-[10px] text-neutral-400">Created {formatDate(job.createdAt)}</span></div>
              <h3 className="mt-3 break-words text-[15px] font-extrabold text-neutral-900">{job.title}</h3><p className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-neutral-600">{job.description}</p>
              <div className="mt-3 flex flex-wrap gap-2"><CopyButton text={job.title} label="Copy saved Pin title" className="min-h-10 px-3 text-[10px]" /><CopyButton text={job.description} label="Copy saved Pin description" className="min-h-10 px-3 text-[10px]" /><CopyButton text={job.destinationURL} label="Copy saved destination URL" className="min-h-10 px-3 text-[10px]" /></div>
              <p className="mt-3 break-all text-[10px] text-neutral-500">Destination: <a href={job.destinationURL} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">{job.destinationURL}</a></p>
              <details className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3"><summary className="cursor-pointer text-[10px] font-bold text-neutral-700">Image validation and activity history</summary><p className="mt-2 text-[10px] leading-relaxed text-neutral-500">Processed {job.image.width} × {job.image.height} {job.image.format} · source {job.image.sourceFormat || 'unknown'} {job.image.sourceWidth || '?'} × {job.image.sourceHeight || '?'} · {job.image.byteSize ? `${Math.round(job.image.byteSize / 1024)} KB` : 'size unavailable'} · metadata stripped: {job.image.metadataStripped ? 'yes' : 'no'}</p><p className="mt-1 text-[10px] text-neutral-500">GitHub Actions validation: {job.validationStatus === 'passed' ? `checked ${formatDate(job.validationAtUTC)}` : job.validationStatus === 'failed' ? 'failed' : job.validationStatus === 'processing' ? 'in progress' : 'pending'}. {job.attempts}/{job.maxAttempts} attempts.</p>{job.activity?.length > 0 && <ol className="mt-3 space-y-2 border-l border-neutral-200 pl-3">{[...job.activity].reverse().map((event, index) => <li key={`${event.event}-${event.atUTC}-${index}`} className="relative"><span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-brand-500" /><p className="text-[10px] font-bold text-neutral-700">{event.message}</p><time dateTime={event.atUTC} className="text-[9px] text-neutral-400">{formatDate(event.atUTC)}</time></li>)}</ol>}</details>
              {job.error && <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-[10.5px] leading-relaxed text-red-800"><p>{job.error.message}</p>{job.status !== 'failed' && <p className="mt-1">This is a background validation result. Your manual status, {statusLabel[job.status] || job.status}, is retained; it is not a Pinterest API verification.</p>}{job.status === 'failed' && <p className="mt-1 font-bold">No Pinterest save was attempted by this workflow.</p>}{job.canRetry ? <button type="button" onClick={() => post({ action: 'retry', jobId: job.id }, job.id)} disabled={Boolean(busy)} className={`${btn} mt-3 border border-red-200 bg-white text-red-900 hover:bg-red-100`}>{busy === job.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={13} />}Retry validation ({job.maxAttempts - job.attempts} left)</button> : job.status === 'failed' ? <p className="mt-2 text-[10px]">No safe retry remains. Fix or choose the image again in Pin Generator to create a new reviewed job.</p> : null}</div>}
              {job.status === 'failed' && !job.error && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-[10.5px] leading-relaxed text-red-800">Validation failed. No Pinterest save was attempted by this workflow. Prepare a new reviewed job in Pin Generator.</p>}

              {job.status === 'pin_prepared' && <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/40 p-3"><p className="text-[10.5px] leading-relaxed text-neutral-700">Pinterest can prefill the supported image, destination URL and description. Review the form, choose your own board and click Save yourself. The title is available above to copy if Pinterest does not prefill it.</p><button type="button" onClick={() => openPinterest(job)} disabled={Boolean(busy)} className={`${btn} mt-3 bg-brand-600 text-white hover:bg-brand-700`}>{busy === job.id ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}Open Pinterest Create</button></div>}

              {job.status === 'pinterest_opened' && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-[10.5px] leading-relaxed text-amber-950">Pinterest was opened, but this alone is not confirmation. After you review the Pin, choose a board and personally click Save, return here and confirm that action.</p><label className="mt-3 flex items-start gap-2 text-[10.5px] leading-relaxed text-neutral-700"><input type="checkbox" checked={Boolean(confirmed[job.id])} onChange={event => setConfirmed(value => ({ ...value, [job.id]: event.target.checked }))} className="mt-0.5 h-4 w-4 shrink-0 accent-[#E60023]" />I selected a board and clicked Save in Pinterest for this Pin.</label><button type="button" disabled={!confirmed[job.id] || Boolean(busy)} onClick={() => post({ action: 'confirm', jobId: job.id, confirmedSaved: true }, job.id)} className={`${btn} mt-3 bg-neutral-900 text-white hover:bg-black`}>{busy === job.id ? <Loader2 size={14} className="animate-spin" /> : null}Confirm I clicked Save</button></div>}

              {job.status === 'user_confirmed' && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-[10.5px] leading-relaxed text-amber-950">User Confirmed is still separate from Published. Paste the actual Pin URL and confirm that it opens the Pin; PinCraft records your report but does not call Pinterest to verify it.</p><label className="mt-3 block text-[10.5px] font-bold text-neutral-700">Your Pinterest Pin URL<input aria-label={`Pinterest Pin URL ${job.id}`} type="url" maxLength={2048} value={pinURLs[job.id] || ''} onChange={event => setPinURLs(value => ({ ...value, [job.id]: event.target.value }))} className={field} placeholder="https://www.pinterest.com/pin/123456789012345/" /></label><label className="mt-3 flex items-start gap-2 text-[10.5px] leading-relaxed text-neutral-700"><input type="checkbox" checked={Boolean(linkChecked[job.id])} onChange={event => setLinkChecked(value => ({ ...value, [job.id]: event.target.checked }))} className="mt-0.5 h-4 w-4 shrink-0 accent-[#E60023]" />I checked this Pin URL and believe it is the correct Pin I just saved.</label><button type="button" disabled={!linkChecked[job.id] || !pinURLs[job.id]?.trim() || Boolean(busy)} onClick={() => post({ action: 'published', jobId: job.id, pinURL: pinURLs[job.id], confirmedPublic: true }, job.id)} className={`${btn} mt-3 bg-emerald-700 text-white hover:bg-emerald-800`}>{busy === job.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}Record as Published · user-reported</button></div>}

              {job.status === 'published' && job.reportedPinURL && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-[11px] font-extrabold text-emerald-900">Published · reported by you</p><a href={job.reportedPinURL} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-10 items-center gap-1 break-all text-[10.5px] font-bold text-emerald-800 underline">Open user-reported Pin <ExternalLink size={12} /></a><p className="mt-2 text-[10px] leading-relaxed text-emerald-900">This status reflects your confirmation and supplied Pin URL. It is not verified through Pinterest’s API.</p></div>}



              <p className="mt-3 break-all font-mono text-[9px] text-neutral-400">Job ID: {job.id}</p>
            </div>
          </div>
        </article>)}</div> : <div className="mt-4 rounded-xl border-2 border-dashed border-neutral-200 bg-white p-7 text-center"><Pin size={22} className="mx-auto text-neutral-300" aria-hidden="true" /><p className="mt-3 text-[12px] font-bold text-neutral-700">{user ? filter === 'all' ? 'No Pinterest jobs yet' : `No ${filter} Pinterest jobs` : 'Sign in to see Pinterest jobs'}</p><p className="mt-1 text-[10.5px] leading-relaxed text-neutral-500">Prepare a reviewed image, copy and destination from Pin Generator. No example activity is shown here.</p>{filter === 'all' && user && <Link href="/pin-generator" prefetch={false} className={`${btn} mt-3 bg-brand-600 text-white hover:bg-brand-700`}>Open Pin Generator</Link>}</div>}
      </>}

      {data?.workflow?.lastSeenAt && <p className="mt-4 text-[10px] leading-relaxed text-neutral-500">GitHub Actions Node validation last ran {formatDate(data.workflow.lastSeenAt)} ({data.workflow.outcome || 'unknown'}; {data.workflow.verified} verified, {data.workflow.failed} failed). It only audits saved Pin files and statuses; it never publishes Pins.</p>}
      {error && data && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] leading-relaxed text-red-800">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] leading-relaxed text-emerald-900">{notice}</p>}
      <p className="mt-5 border-t border-neutral-200 pt-4 text-[10px] leading-relaxed text-neutral-500">Pin Prepared, Pinterest Opened, User Confirmed and Published are separate states. Published is explicitly user-reported, not Pinterest API-verified. Playwright tests cover PinCraft only; they never log in to or operate Pinterest.</p>
    </div>
  </section>;
}
