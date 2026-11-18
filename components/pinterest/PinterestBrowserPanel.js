"use client";
import { useEffect, useRef, useState } from 'react';
import PinterestLogo from './PinterestLogo';
import { PINTEREST_ACCOUNT, PINTEREST_MAX_PINS_PER_DAY } from '@/lib/pinterest-browser/policy.mjs';

const MAX_UPLOAD_BYTES = 512 * 1024;
const STATUS_LABEL = {
  missing: 'No session saved',
  present: 'Session saved, not yet verified',
  verified: 'Session verified',
  expired: 'Session expired',
  unverified: 'Account not confirmed',
  error: 'Last check failed',
};
const STATUS_TONE = {
  verified: 'bg-emerald-50 text-emerald-800',
  present: 'bg-sky-50 text-sky-800',
  missing: 'bg-neutral-100 text-neutral-700',
  expired: 'bg-amber-50 text-amber-900',
  unverified: 'bg-amber-50 text-amber-900',
  error: 'bg-amber-50 text-amber-900',
};

// Browser-based posting for @SlimGlowLifex. The owner signs in on their own computer;
// only the exported session file is uploaded here. No password field exists anywhere in this panel.
export default function PinterestBrowserPanel() {
  const [status, setStatus] = useState(null), [loadError, setLoadError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const input = useRef(null);

  async function load() {
    try {
      const response = await fetch('/api/pinterest-browser/session', { cache: 'no-store', credentials: 'same-origin' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Pinterest status could not be loaded.');
      setStatus(body); setLoadError('');
    } catch (error) { setLoadError(error.message); }
  }
  useEffect(() => { load(); }, []);

  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setMessage('');
    if (file.size > MAX_UPLOAD_BYTES) { setMessage('That file is too large for a session export. Upload slimglow-session.json only.'); return; }
    let parsed;
    try { parsed = JSON.parse(await file.text()); } catch { setMessage('That file is not a session export (JSON). Upload slimglow-session.json only.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/pinterest-browser/session', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storageState: parsed }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'The session could not be saved.');
      setMessage('Session saved (encrypted). The runner will verify it on its next run.');
      await load();
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }

  const tone = STATUS_TONE[status?.status] || STATUS_TONE.error;
  return (
    <section aria-labelledby="pinterest-browser-heading" className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5" data-testid="pinterest-browser-panel">
      <div className="flex items-start gap-4">
        <PinterestLogo size={44} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 id="pinterest-browser-heading" className="text-[16px] font-extrabold">Pinterest automation</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-neutral-600">
            Account:{' '}
            <a href={PINTEREST_ACCOUNT.profileURL} target="_blank" rel="noopener noreferrer" className="font-bold text-brand-700 underline">@{PINTEREST_ACCOUNT.handle}</a>
            {' '}· up to {PINTEREST_MAX_PINS_PER_DAY} pins per day · posts only to this account
          </p>

          {loadError && <p role="alert" className="mt-3 text-[12px] text-amber-900">{loadError}</p>}
          {status && (
            <div className="mt-3 space-y-2 text-[12px] leading-relaxed text-neutral-700">
              <p data-testid="pinterest-browser-status">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${tone}`}>{STATUS_LABEL[status.status] || 'Unknown'}</span>
              </p>
              <p data-testid="pinterest-browser-next-step"><strong>Next step:</strong> {status.nextStep}</p>
              {status.detail && <p className="text-neutral-500">Runner detail: {status.detail}</p>}
              <p className="text-neutral-500">Pins posted today: {status.postedToday} of {status.dailyLimit}{status.uploadedAt ? ` · session uploaded ${new Date(status.uploadedAt).toLocaleString()}` : ''}</p>
            </div>
          )}

          <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-[12px] font-bold">Upload the SlimGlow session export</p>
            <p className="mt-1 text-[11px] leading-relaxed text-neutral-600">
              Upload only the file <code>slimglow-session.json</code>. It holds login cookies, not a password. Never paste a password or verification code here.
            </p>
            <input ref={input} type="file" accept="application/json,.json" aria-label="Upload Pinterest session file" onChange={upload} disabled={busy || !status} className="mt-3 block text-[12px]" />
            {busy && <p className="mt-2 text-[11px] text-neutral-500">Saving encrypted session…</p>}
            {message && <p role="status" className="mt-2 text-[11px] text-neutral-700">{message}</p>}
          </div>

          <details className="mt-4 rounded-xl bg-white p-4 text-[12px] leading-relaxed text-neutral-700">
            <summary className="cursor-pointer font-bold">How to export the session (on your own computer)</summary>
            <ol className="ml-5 mt-3 list-decimal space-y-2">
              <li>Install Node.js 20 or newer. In the PinCraft project folder, run <code>cd workers/pinterest-browser</code>, then <code>npm install</code> and <code>npx playwright install chromium</code>.</li>
              <li>Run <code>npm run export-session</code>. A browser window opens at Pinterest&apos;s sign-in page.</li>
              <li>Sign in to <strong>@SlimGlowLifex</strong> yourself. Type your password and complete any 2FA or CAPTCHA in that window only.</li>
              <li>Go back to the terminal and press Enter. The file is written only if your own profile shows the owner controls.</li>
              <li>Upload <code>slimglow-session.json</code> with the control above, then delete the file from your computer.</li>
            </ol>
            <p className="mt-3"><strong>If Pinterest asks for a verification code or CAPTCHA:</strong> complete it yourself in the browser window. Do not share codes with anyone. If sign-in keeps failing, wait an hour and try again from your normal home network without a VPN.</p>
            <p className="mt-3 text-neutral-500">The session file is a login. Keep it private and delete it after upload.</p>
          </details>
        </div>
      </div>
    </section>
  );
}
