'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { GoogleAuthProvider, getAuth, getRedirectResult, signInWithRedirect, signOut } from 'firebase/auth';
import BillingReview from './BillingReview';

const REFRESH_MS = 30000;
const NA = <span className="na">Not recorded</span>;
const fmt = value => (typeof value === 'number' ? value.toLocaleString('en-US') : '—');
const when = iso => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' }) : '—');
const clock = ms => new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Asia/Dhaka' });

// Same-origin auth domain (this site proxies /__/auth), so redirect sign-in works in phone browsers.
function clientAuth(config) {
  const authDomain = typeof window !== 'undefined' ? window.location.host : config.authDomain;
  const app = getApps()[0] || initializeApp({ apiKey: config.apiKey, authDomain, projectId: config.projectId, appId: config.appId });
  return getAuth(app);
}

const REFUSED = 'Sign-in was not allowed. Use the owner Google account in Chrome or Safari, then try again.';
const FAILED = 'Sign-in did not complete. Open this page in Chrome or Safari (not inside another app) and try again.';

export default function AdminApp({ firebase }) {
  const [view, setView] = useState('checking'); // checking | login | dashboard
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [billing, setBilling] = useState(null);
  const [billingError, setBillingError] = useState('');
  const [billingNotice, setBillingNotice] = useState('');
  const applyBilling = useCallback((result, message) => {
    if (result && result.requests) { setBilling(result); setBillingError(''); setBillingNotice(message || ''); }
  }, []);
  const [updated, setUpdated] = useState(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/metrics', { cache: 'no-store', credentials: 'same-origin' });
      if (!mounted.current) return;
      if (response.status === 401) { setView('login'); setData(null); return; }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setData(null);
        setError(body.message || 'Live data could not be read just now. It refreshes automatically.');
        return;
      }
      setData(await response.json());
      setError('');
      setUpdated(Date.now());
      setView('dashboard');
      const billingResponse = await fetch('/api/billing', { cache: 'no-store', credentials: 'same-origin' }).catch(() => null);
      const billingBody = billingResponse && billingResponse.ok ? await billingResponse.json().catch(() => null) : null;
      if (mounted.current) {
        setBilling(billingBody);
        setBillingError(billingBody ? '' : 'Payment reviews could not be read just now. They refresh automatically.');
      }
    } catch {
      if (mounted.current) { setData(null); setError('Live data could not load just now. No figures are shown from an earlier read, and this page retries automatically.'); }
    }
  }, []);

  // Returning from Google's redirect: exchange the Firebase result for the owner session cookie, then load.
  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const auth = clientAuth(firebase);
        const result = await getRedirectResult(auth);
        if (result && result.user) {
          setBusy(true);
          const idToken = await result.user.getIdToken(true);
          const response = await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken }), cache: 'no-store', credentials: 'same-origin' });
          if (!response.ok) { await signOut(auth).catch(() => {}); setError(REFUSED); setView('login'); setBusy(false); return; }
        }
      } catch {
        if (mounted.current) setError(FAILED);
      }
      if (mounted.current) { setBusy(false); load(); }
    })();
    return () => { mounted.current = false; };
  }, [load]);

  // Auto-refresh while the dashboard is open and the tab is visible.
  useEffect(() => {
    if (view !== 'dashboard') return undefined;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [view, load]);

  async function signIn() {
    setBusy(true); setError('');
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      // Full-page redirect: works on phones where popups are blocked. The result is read on return.
      await signInWithRedirect(clientAuth(firebase), provider);
    } catch {
      setError(FAILED);
      setBusy(false);
    }
  }

  async function signOutAll() {
    setBusy(true);
    await fetch('/api/session', { method: 'DELETE', cache: 'no-store' }).catch(() => {});
    try { await signOut(clientAuth(firebase)); } catch {}
    setData(null); setView('login'); setBusy(false);
  }

  if (view === 'checking') return <main className="wrap"><p className="muted">Checking access…</p></main>;

  if (view === 'login') {
    return (
      <main className="wrap">
        <div className="login">
          <h1>PinCraft Admin</h1>
          <p>Owner sign-in only.</p>
          {error && <p className="banner error" role="alert">{error}</p>}
          <button className="btn primary" onClick={signIn} disabled={busy || !firebase.apiKey}>{busy ? 'Signing in…' : 'Sign in with Google'}</button>
          {!firebase.apiKey && <p className="banner error" style={{ marginTop: 14 }}>Sign-in is not configured on this site.</p>}
        </div>
      </main>
    );
  }

  if (!data) {
    return <main className="wrap"><p className="muted">Loading live data…</p>{error && <p className="banner error">{error}</p>}</main>;
  }

  const s = data.summary;
  const L = data.limits;
  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>PinCraft Admin</h1>
          <div className="sub">Owner only · not indexed · Today (Asia/Dhaka): {data.today}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="live"><span className="dot" />Live · auto-refresh 30s</span>
          <span className="sub">Last read {updated ? clock(updated) : '—'}</span>
          <button className="btn" onClick={load} disabled={busy}>Refresh now</button>
          <button className="btn" onClick={signOutAll} disabled={busy}>Sign out</button>
        </div>
      </header>

      {error && <div className="banner error" role="alert">{error}</div>}

      <section className="grid" aria-label="Summary">
        <Stat label="Total users" value={fmt(s.totalUsers)} hint="Registered accounts" />
        <Stat label="Active users today" value={fmt(s.activeUsersToday)} hint="Any AI usage today" />
        <Stat label="Pins generated today" value={fmt(s.pinPacksToday)} hint="Pin idea packs today" />
        <Stat label="API requests today" value={fmt(s.aiRequestsToday)} hint="Text + image requests" />
      </section>

      <section className="grid" aria-label="Activity">
        <Stat label="Active 7 days" value={fmt(s.activeUsers7d)} hint="Users with AI usage" />
        <Stat label="Active 30 days" value={fmt(s.activeUsers30d)} hint="Users with AI usage" />
        <Stat label="Pin Queue items" value={fmt(s.pinQueueItems)} hint={`${fmt(s.pinQueuePostedToday)} posted today`} />
        <Stat label="Automation jobs" value={fmt(data.jobs.total)} hint={Object.entries(data.jobs.byState).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'None'} />
      </section>

      <section className="card" aria-labelledby="users-h">
        <h2 id="users-h">Users <span className="tag">{fmt(data.users.length)} · plan = Free unless a paid plan is recorded</span></h2>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Last sign-in</th><th>Plan</th><th>Telegram verified</th></tr></thead>
            <tbody>
              {data.users.map(u => (
                <tr key={u.uid}>
                  <td>{u.name}</td>
                  <td>{u.email || '—'}</td>
                  <td>{when(u.joined)}</td>
                  <td>{when(u.lastSignIn)}</td>
                  <td>{u.plan}</td>
                  <td><span className={`pill ${u.telegramVerified ? 'yes' : 'no'}`}>{u.telegramVerified ? 'Yes' : 'No'}</span></td>
                </tr>
              ))}
              {data.users.length === 0 && <tr><td colSpan={6} className="muted">No users yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" aria-labelledby="usage-h">
        <h2 id="usage-h">Per-user usage <span className="tag">today against daily limits · totals since sign-up records</span></h2>
        <p className="sub" style={{ margin: '4px 0 8px' }}>Limits per user per day: {L.pinPacks} pin packs · {L.text} text requests · {L.image} image requests. Articles are counted within text requests.</p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th className="num">Pin packs today</th>
                <th className="num">Text today</th>
                <th className="num">Image today</th>
                <th className="num">Pin packs total</th>
                <th className="num">Text total</th>
                <th className="num">Image total</th>
                <th className="num">Pin Queue</th>
                <th>Last active day</th>
              </tr>
            </thead>
            <tbody>
              {data.usage.map(u => (
                <tr key={u.uid}>
                  <td>{u.name}<div className="sub">{u.email || ''}</div></td>
                  <td className="num">{over(u.usageToday.pinPacks, L.pinPacks)}</td>
                  <td className="num">{over(u.usageToday.text, L.text)}</td>
                  <td className="num">{over(u.usageToday.image, L.image)}</td>
                  <td className="num">{fmt(u.usageTotal.pinPacks)}</td>
                  <td className="num">{fmt(u.usageTotal.text)}</td>
                  <td className="num">{fmt(u.usageTotal.image)}</td>
                  <td className="num">{fmt(u.pinQueueItems)}<div className="sub">{fmt(u.pinQueuePostedToday)} posted today</div></td>
                  <td>{u.lastActiveDay || '—'}</td>
                </tr>
              ))}
              {data.usage.length === 0 && <tr><td colSpan={9} className="muted">No usage yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" aria-labelledby="api-h">
        <h2 id="api-h">AI provider usage</h2>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Provider</th><th className="num">Requests</th><th className="num">Cost</th><th>Note</th></tr></thead>
            <tbody>
              {data.providers.map(p => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="num">{typeof p.requests === 'number' ? fmt(p.requests) : NA}</td>
                  <td className="num">{NA}</td>
                  <td className="muted" style={{ whiteSpace: 'normal' }}>{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sub" style={{ marginTop: 8 }}>Shown instead: PinCraft’s own AI requests today are <strong>{fmt(s.aiRequestsToday)}</strong> (text {fmt(s.textRequestsToday)} + image {fmt(s.imageRequestsToday)}). Cost needs the provider billing dashboards.</p>
      </section>


      <BillingReview billing={billing} error={billingError} notice={billingNotice} onUpdate={applyBilling} onError={setBillingError} />

      <section className="card">
        <h2>Notes</h2>
        <ul className="notes">{data.notes.map(n => <li key={n}>{n}</li>)}</ul>
      </section>
    </main>
  );
}

function over(value, limit) {
  const text = `${fmt(value)} / ${limit}`;
  return <span style={value >= limit ? { color: '#991b1b', fontWeight: 700 } : undefined}>{text}</span>;
}

function Stat({ label, value, hint }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="hint">{hint}</div>
    </div>
  );
}
