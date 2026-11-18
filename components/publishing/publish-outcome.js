'use client';
// Durable record of the last publish attempt. It lives in sessionStorage, outside the
// composer, so a composer remount, a status poll or a re-render cannot erase the result.
// It is cleared only by Dismiss or by starting a new publish attempt.
import {useEffect, useState} from 'react';
import Link from 'next/link';

const KEY = 'pincraft-publish-outcome-v1';
const EVENT = 'pincraft-publish-outcome';
const stamp = () => new Date().toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit', second: '2-digit'});

function read() {
  try { const raw = window.sessionStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function write(value) {
  try {
    if (value) window.sessionStorage.setItem(KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function startPublishOutcome(uid, articleId, action) {
  write({uid, articleId, action, failed: false, jobId: null, lines: [{at: stamp(), text: `Clicked "${action}"`}]});
}
export function appendPublishLine(uid, text, jobId) {
  const current = read() || {uid, failed: false, jobId: null, lines: []};
  write({...current, jobId: jobId || current.jobId, lines: [...current.lines, {at: stamp(), text}]});
}
export function recordPublishFailure(uid, text) {
  const current = read() || {uid, failed: false, jobId: null, lines: []};
  write({...current, failed: true, lines: [...current.lines, {at: stamp(), text}]});
}
export function clearPublishOutcome() { write(null); }

export function PublishOutcomePanel({uid}) {
  const [value, setValue] = useState(null);
  useEffect(() => {
    const sync = () => setValue(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);
  if (!value || !uid || value.uid !== uid) return null;
  return (
    <section data-testid="publish-outcome-panel" role="status" aria-live="polite"
      className={`mt-5 rounded-xl border p-4 text-[12px] leading-relaxed ${value.failed ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-neutral-200 bg-white text-neutral-800'}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-extrabold">Last publish attempt: {value.action}</p>
        <button type="button" onClick={() => clearPublishOutcome()} className="min-h-9 rounded-lg border border-neutral-300 px-3 text-[11px] font-bold">Dismiss</button>
      </div>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[11px]">
        {value.lines.map((line, index) => <li key={index} data-testid="publish-outcome-line"><span className="text-neutral-500">{line.at} </span>{line.text}</li>)}
      </ol>
      {value.jobId && <p className="mt-2 text-[11px]">Saved job ID: <span className="font-mono" data-testid="publish-outcome-job-id">{value.jobId}</span> · <Link href="/jobs" prefetch={false} className="font-bold text-brand-700 underline">Open Jobs</Link></p>}
    </section>
  );
}
