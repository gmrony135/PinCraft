'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import BillingReview from './BillingReview';
import { KEY_STATUS_LABEL } from '../lib/key-slots.mjs';
import { attentionItems, ALL_CLEAR, KEY_FILTERS, keyCounts, keyRows, matchesQuery, providerLimitHits, usageBarPercent, usageLevel } from '../lib/clarity.mjs';

const REFRESH_MS = 30000;
const NA = <span className="na">Not recorded</span>;
const fmt = value => (typeof value === 'number' ? value.toLocaleString('en-US') : '—');
const when = iso => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' }) : '—');
const ago = iso => { if (!iso) return '—'; const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); if (mins < 60) return `${mins} min ago`; const hours = Math.floor(mins / 60); return `${hours} hour${hours === 1 ? '' : 's'} ago`; };
const clock = ms => new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Asia/Dhaka' });

const REFUSED = 'Sign-in was not allowed. Check the Gmail address and PIN, then try again.';

// Plain-language lines in Bengali. Headings and numbers stay English.
const BN = {
  attention: 'এক নজরে দেখুন কোন বিষয়ে নজর দরকার। লিংকে ট্যাপ করলে সেই অংশে যাবে।',
  summary: 'আজকের মূল সংখ্যা। ছোট লেখায় আগের দিনের তুলনা।',
  activity: 'গত ৭ ও ৩০ দিনে কতজন ব্যবহার করেছে, পিন কিউ এবং অটোমেশন জবের অবস্থা।',
  newUsers: 'গত ২৪ ঘণ্টায় নতুন নিবন্ধিত ব্যবহারকারী এবং তাদের আজকের ব্যবহার।',
  users: 'সব নিয়মিত ব্যবহারকারী, আজকের ব্যবহার সহ। নাম বা ইমেইল দিয়ে খুঁজুন।',
  usage: 'প্রতিজনের আজকের ও মোট ব্যবহার। বার হলুদ মানে ৮০% পার হয়েছে, লাল মানে দৈনিক সীমা শেষ।',
  api: 'প্রতিটি AI সেবায় আজ কতবার অনুরোধ গেছে এবং কতবার সীমায় আটকেছে।',
  keys: 'কোন চাবি (slot) কতবার চলেছে, কোনটা সীমায় শেষ বা সেট করা নেই। চাবির মান কখনো দেখানো হয় না।',
  payments: 'অপেক্ষমাণ পেমেন্ট যাচাই করে অনুমোদন বা বাতিল করুন। অনুমোদনের আগে বিকাশ বা নগদে লেনদেন নিশ্চিত করুন।',
  notes: 'এই তথ্যগুলো কীভাবে পড়া হয়, তার নোট।',
};

const SECTIONS = [
  ['summary', 'Summary'], ['new', 'New users'], ['users', 'Users'], ['usage', 'Usage'], ['keys', 'AI keys'], ['payments', 'Payments'],
];

export default function AdminApp() {
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
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [query, setQuery] = useState('');
  const [keyFilter, setKeyFilter] = useState('all');
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

  // On open: if the owner session cookie is valid, load the dashboard; otherwise show the login form.
  useEffect(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; };
  }, [load]);

  // Auto-refresh while the dashboard is open and the tab is visible.
  useEffect(() => {
    if (view !== 'dashboard') return undefined;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [view, load]);

  async function signIn(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    let response = null;
    try {
      response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), pin }),
        cache: 'no-store',
        credentials: 'same-origin',
      });
    } catch {
      response = null;
    }
    setPin('');
    if (!response) { setError('Sign-in is unavailable right now. Try again in a few minutes.'); setBusy(false); return; }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message || REFUSED);
      setBusy(false);
      return;
    }
    setBusy(false);
    setView('checking');
    load();
  }

  async function signOutAll() {
    setBusy(true);
    await fetch('/api/session', { method: 'DELETE', cache: 'no-store', credentials: 'same-origin' }).catch(() => {});
    setData(null); setEmail(''); setPin(''); setView('login'); setBusy(false);
  }

  if (view === 'checking') return <main className="wrap"><p className="muted">Checking access…</p></main>;

  if (view === 'login') {
    return (
      <main className="wrap">
        <div className="login">
          <h1>PinCraft Admin</h1>
          <p>Owner sign-in only.</p>
          {error && <p className="banner error" role="alert">{error}</p>}
          <form onSubmit={signIn} noValidate>
            <label htmlFor="admin-email">Gmail address</label>
            <input id="admin-email" type="email" name="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />
            <label htmlFor="admin-pin">4-digit PIN</label>
            <input id="admin-pin" type="password" name="pin" autoComplete="current-password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} disabled={busy} />
            <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
        </div>
      </main>
    );
  }

  if (!data) {
    return <main className="wrap"><p className="muted">Loading live data…</p>{error && <p className="banner error">{error}</p>}</main>;
  }

  const s = data.summary;
  const L = data.limits;
  const y = s.yesterday || { activeUsers: 0, pinPacks: 0, aiRequests: 0 };
  const items = attentionItems({ data, billing, billingError });
  const counts = keyCounts(data.keySlots?.providers || []);
  const keys = keyRows(data.keySlots?.providers || [], keyFilter);
  const hits = providerLimitHits(data.keySlots?.providers || []);
  const newUsers = data.newUsers.filter(u => matchesQuery(u, query));
  const users = data.users.filter(u => matchesQuery(u, query));
  const usageRows = data.usage.filter(u => matchesQuery(u, query));

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>PinCraft Admin</h1>
          <div className="sub">Owner only · not indexed · Today (Asia/Dhaka): {data.today}</div>
        </div>
        <div className="head-actions">
          <span className="live"><span className="dot" />Live · auto-refresh 30s</span>
          <span className="sub">Last read {updated ? clock(updated) : '—'}</span>
          <button className="btn big" onClick={load} disabled={busy}>Refresh now</button>
          <button className="btn big" onClick={signOutAll} disabled={busy}>Sign out</button>
        </div>
      </header>

      <nav className="jump" aria-label="Sections">
        {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>

      {error && <div className="banner error" role="alert">{error}</div>}

      <section className="attn" id="attention" aria-labelledby="attn-h">
        <h2 id="attn-h">Attention needed</h2>
        <p className="bn" lang="bn">{BN.attention}</p>
        {items.length === 0 ? (
          <p className="allclear">{ALL_CLEAR}</p>
        ) : (
          <ul className="attn-list">
            {items.map(item => <li key={item.id} className={`attn-item ${item.tone}`}><a href={`#${item.target}`}>{item.text} <span aria-hidden="true">→</span></a></li>)}
          </ul>
        )}
      </section>

      <section id="summary" className="grid" aria-label="Summary">
        <Stat label="Total users" value={fmt(s.totalUsers)} hint="Registered accounts" />
        <Stat label="Active users today" value={fmt(s.activeUsersToday)} hint={`of ${fmt(s.totalUsers)} total · yesterday ${fmt(y.activeUsers)}`} />
        <Stat label="Pins generated today" value={fmt(s.pinPacksToday)} hint={`Pin idea packs · yesterday ${fmt(y.pinPacks)}`} />
        <Stat label="API requests today" value={fmt(s.aiRequestsToday)} hint={`Text + image · yesterday ${fmt(y.aiRequests)}`} />
      </section>
      <p className="bn section-line" lang="bn">{BN.summary}</p>

      <section id="activity" className="grid" aria-label="Activity">
        <Stat label="Active 7 days" value={fmt(s.activeUsers7d)} hint="Users with AI usage" />
        <Stat label="Active 30 days" value={fmt(s.activeUsers30d)} hint="Users with AI usage" />
        <Stat label="Pin Queue items" value={fmt(s.pinQueueItems)} hint={`${fmt(s.pinQueuePostedToday)} posted today`} />
        <Stat label="Automation jobs" value={fmt(data.jobs.total)} hint={Object.entries(data.jobs.byState).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'None'} />
      </section>
      <p className="bn section-line" lang="bn">{BN.activity}</p>

      <div className="search-row">
        <label htmlFor="user-search" className="sr-only">Search users by name or email</label>
        <input id="user-search" type="search" placeholder="Search name or email" value={query} onChange={e => setQuery(e.target.value)} autoComplete="off" spellCheck={false} />
        {query && <span className="sub">Showing matches for “{query}” in the user tables</span>}
      </div>

      <section id="new" className="card" aria-labelledby="new-h">
        <h2 id="new-h">New users <span className="tag">registered in the last 24 hours · {fmt(newUsers.length)}{query ? ` of ${fmt(data.newUsers.length)}` : ''} · newest first · after 24 hours they move to Users below</span></h2>
        <p className="bn section-line" lang="bn">{BN.newUsers}</p>
        <div className="table-scroll">
          <table className="freeze">
            <thead><tr><th>Name</th><th>Email</th><th>Registered</th><th>Last sign-in</th><th>Plan</th><th>Telegram verified</th><th className="num">Usage today (pin packs · text · image)</th><th className="num">Usage total (pin packs · text · image)</th></tr></thead>
            <tbody>
              {newUsers.map(u => (
                <tr key={u.uid}>
                  <td><span className="new-badge">NEW</span> {u.name}</td>
                  <td>{u.email || '—'}</td>
                  <td>{when(u.joined)}<div className="sub">{ago(u.joined)}</div></td>
                  <td>{when(u.lastSignIn)}</td>
                  <td>{u.plan}</td>
                  <td><span className={`pill ${u.telegramVerified ? 'yes' : 'no'}`}>{u.telegramVerified ? 'Yes' : 'No'}</span></td>
                  <td className="num">{fmt(u.usageToday.pinPacks)} · {fmt(u.usageToday.text)} · {fmt(u.usageToday.image)}</td>
                  <td className="num">{fmt(u.usageTotal.pinPacks)} · {fmt(u.usageTotal.text)} · {fmt(u.usageTotal.image)}</td>
                </tr>
              ))}
              {newUsers.length === 0 && <tr><td colSpan={8} className="muted">{query ? 'No new user matches this search.' : 'No new users in the last 24 hours.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section id="users" className="card" aria-labelledby="users-h">
        <h2 id="users-h">Users <span className="tag">{fmt(users.length)}{query ? ` of ${fmt(data.users.length)}` : ''} regular · {fmt(data.summary.newUsers)} new shown above · plan = Free unless a paid plan is recorded</span></h2>
        <p className="bn section-line" lang="bn">{BN.users}</p>
        <div className="table-scroll">
          <table className="freeze">
            <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Last sign-in</th><th>Plan</th><th>Telegram verified</th><th className="num">Pin packs today</th><th className="num">Text today</th><th className="num">Image today</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.uid}>
                  <td>{u.name}</td>
                  <td>{u.email || '—'}</td>
                  <td>{when(u.joined)}</td>
                  <td>{when(u.lastSignIn)}</td>
                  <td>{u.plan}</td>
                  <td><span className={`pill ${u.telegramVerified ? 'yes' : 'no'}`}>{u.telegramVerified ? 'Yes' : 'No'}</span></td>
                  <UsageCell value={u.usageToday?.pinPacks} limit={L.pinPacks} />
                  <UsageCell value={u.usageToday?.text} limit={L.text} />
                  <UsageCell value={u.usageToday?.image} limit={L.image} />
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={9} className="muted">{query ? 'No user matches this search.' : data.summary.newUsers > 0 ? 'All registered users are shown in New users above.' : 'No users yet.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section id="usage" className="card" aria-labelledby="usage-h">
        <h2 id="usage-h">Per-user usage <span className="tag">today against daily limits · totals since sign-up records</span></h2>
        <p className="bn section-line" lang="bn">{BN.usage}</p>
        <p className="sub" style={{ margin: '4px 0 8px' }}>Limits per user per day: {L.pinPacks} pin packs · {L.text} text requests · {L.image} image requests. Articles are counted within text requests.</p>
        <div className="table-scroll">
          <table className="freeze">
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
              {usageRows.map(u => (
                <tr key={u.uid}>
                  <td>{u.name}<div className="sub">{u.email || ''}</div></td>
                  <UsageCell value={u.usageToday.pinPacks} limit={L.pinPacks} />
                  <UsageCell value={u.usageToday.text} limit={L.text} />
                  <UsageCell value={u.usageToday.image} limit={L.image} />
                  <td className="num">{fmt(u.usageTotal.pinPacks)}</td>
                  <td className="num">{fmt(u.usageTotal.text)}</td>
                  <td className="num">{fmt(u.usageTotal.image)}</td>
                  <td className="num">{fmt(u.pinQueueItems)}<div className="sub">{fmt(u.pinQueuePostedToday)} posted today</div></td>
                  <td>{u.lastActiveDay || '—'}</td>
                </tr>
              ))}
              {usageRows.length === 0 && <tr><td colSpan={9} className="muted">{query ? 'No user matches this search.' : 'No usage yet.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section id="api" className="card" aria-labelledby="api-h">
        <h2 id="api-h">AI provider usage</h2>
        <p className="bn section-line" lang="bn">{BN.api}</p>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Provider</th><th className="num">Requests today</th><th className="num">Limit hits today</th><th>Note</th></tr></thead>
            <tbody>
              {data.providers.map(p => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="num">{typeof p.requests === 'number' ? fmt(p.requests) : NA}</td>
                  <td className="num">{data.keySlots?.recorded ? fmt(hits[p.id] ?? 0) : NA}</td>
                  <td className="muted" style={{ whiteSpace: 'normal', minWidth: 260, maxWidth: 360 }}>{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sub" style={{ marginTop: 8 }}>PinCraft’s own AI requests today: <strong>{fmt(s.aiRequestsToday)}</strong> (text {fmt(s.textRequestsToday)} + image {fmt(s.imageRequestsToday)}).</p>
      </section>

      <section id="keys" className="card" aria-labelledby="keys-h">
        <h2 id="keys-h">Per-key AI usage today</h2>
        <p className="bn section-line" lang="bn">{BN.keys}</p>
        <p className="key-summary" role="status">{counts.inUse} keys in use · {counts.atLimit} at limit · {counts.notSet} not set</p>
        <div className="chips" role="group" aria-label="Filter keys">
          {KEY_FILTERS.map(f => (
            <button key={f.id} type="button" className="chip" aria-pressed={keyFilter === f.id} onClick={() => setKeyFilter(f.id)}>{f.label}</button>
          ))}
        </div>
        <p className="sub">Every text key slot per provider (1–10). Slot numbers only: key values, tokens and account IDs are never shown. Counts start at this release. Resets at midnight Bangladesh time{data.keySlots?.day ? ` (today ${data.keySlots.day})` : ''}.</p>
        {data.keySlots && !data.keySlots.recorded && <p className="sub">No key activity is recorded yet today, so every configured slot shows UNUSED.</p>}
        <div className="table-scroll">
          <table className="freeze">
            <thead><tr><th>Provider</th><th className="num">Slot</th><th>Status</th><th className="num">Calls today</th><th className="num">Limit hits today</th><th>Last limit hit (Dhaka)</th></tr></thead>
            <tbody>
              {keys.map(row => (
                <tr key={`${row.provider}-${row.slot}`} className={row.status === 'LIMIT_FINISHED' ? 'row-limit' : undefined}>
                  <td>{row.provider}</td>
                  <td className="num">{row.slot}</td>
                  <td><span className={`pill ${row.status === 'LIMIT_FINISHED' ? 'bad' : row.status === 'USED' ? 'ok' : 'no'}`}>{KEY_STATUS_LABEL[row.status] || row.status}</span></td>
                  <td className="num">{fmt(row.calls)}</td>
                  <td className="num">{fmt(row.limitHits)}</td>
                  <td>{row.lastLimitedAt ? new Date(row.lastLimitedAt).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' }) : NA}</td>
                </tr>
              ))}
              {keys.length === 0 && <tr><td colSpan={6} className="muted">No key matches this filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div id="payments">
        <BillingReview billing={billing} error={billingError} notice={billingNotice} onUpdate={applyBilling} onError={setBillingError} />
      </div>

      <section id="notes" className="card">
        <h2>Notes</h2>
        <p className="bn section-line" lang="bn">{BN.notes}</p>
        <ul className="notes">{data.notes.map(n => <li key={n}>{n}</li>)}</ul>
      </section>
    </main>
  );
}

// One usage cell: exact "x / limit" plus a bar. Amber from 80%, red at the limit.
function UsageCell({ value, limit }) {
  const level = usageLevel(value, limit);
  const pct = usageBarPercent(value, limit);
  return (
    <td className="num usage">
      <div className={level === 'limit' ? 'usage-text limit' : level === 'warn' ? 'usage-text warn' : 'usage-text'}>{fmt(value)} / {limit}</div>
      <div className={`bar ${level}`} role="img" aria-label={`${pct}% of the daily limit`}><span style={{ width: `${pct}%` }} /></div>
    </td>
  );
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
