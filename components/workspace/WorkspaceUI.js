"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertCircle, ArrowRight, ArrowUpRight, CalendarClock, CheckCircle2, LoaderCircle, LockKeyhole, RefreshCw } from 'lucide-react';
import { useAuth } from '../providers/AppProvider';
import { WORKSPACE_NAV } from '@/lib/product.mjs';
export const fieldClass = 'mt-2 min-h-12 w-full min-w-0 rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-[16px] text-neutral-900 outline-none transition focus:border-brand-600 focus:ring-4 focus:ring-brand-50 disabled:bg-neutral-50 disabled:text-neutral-500 sm:text-[13px]';
export const primaryClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-[12px] font-bold text-white transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50';
export const secondaryClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-[12px] font-bold text-neutral-700 transition hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50';
export function formatWhen(value, timezone) { if (!value || !Number.isFinite(new Date(value).getTime())) return 'Not scheduled'; try { return new Intl.DateTimeFormat('en', { ...(timezone ? { timeZone: timezone } : {}), month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)); } catch { return 'Not scheduled'; } }
export function useWorkspace() {
  const auth = useAuth(), [snapshot, setSnapshot] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState('');
  const sequence = useRef(0), owner = useRef(null), pending = useRef(false), operation = useRef(0); owner.current = auth.user?.id || null;
  const refresh = useCallback(async () => {
    const id = ++sequence.current;
    try { const response = await fetch('/api/workspace', { cache: 'no-store', credentials: 'same-origin' }), result = await response.json(); if (!response.ok) throw new Error(result.error || 'Your workspace could not be loaded.'); if (id === sequence.current) { setSnapshot(result); setError(''); } }
    catch (issue) { if (id === sequence.current) setError(issue.message || 'The server state could not be confirmed.'); }
    finally { if (id === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => {
    if (auth.authLoading) return;
    setSnapshot(null); setLoading(true); setError(''); setNotice(''); setBusy(''); pending.current = false; operation.current++; refresh();
    const visible = () => { if (!document.hidden && !pending.current) refresh(); }, timer = setInterval(visible, 60000);
    document.addEventListener('visibilitychange', visible);
    return () => { sequence.current++; clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [auth.authLoading, auth.user?.id, refresh]);
  const data = snapshot?.accountId === (auth.user?.id || null) ? snapshot : null;
  async function mutate(body, message, endpoint = '/api/workspace') {
    if (pending.current) return false;
    if (!auth.user) { auth.openLogin(); return false; }
    const uid = auth.user.id, opId = ++operation.current; pending.current = true; sequence.current++; setBusy(body.action || 'request'); setError(''); setNotice('');
    try {
      const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), result = await response.json();
      if (owner.current !== uid || operation.current !== opId) return false;
      if (!response.ok) throw new Error(result.error || 'The change could not be confirmed.');
      if (Array.isArray(result.automations)) setSnapshot(result); else await refresh();
      if (owner.current !== uid || operation.current !== opId) return false;
      setNotice(message || result.receipt?.message || 'Your change was saved.'); window.dispatchEvent(new Event('pincraft:cloud-library-updated')); return true;
    } catch (issue) { if (owner.current === uid && operation.current === opId) setError(issue.message || 'This request could not be completed. No success was assumed.'); return false; }
    finally { if (owner.current === uid && operation.current === opId) { pending.current = false; setBusy(''); } }
  }
  return { ...auth, data, loading: loading || auth.authLoading, error, notice, busy, refresh, mutate, setError, setNotice, setBusy };
}
export function WorkspaceFrame({ state, title, description, eyebrow, children, action }) {
  const path = usePathname();
  return <div className="container-x pb-14 pt-7 sm:pb-20 sm:pt-10" data-testid="workspace-root"><nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-[12px] text-neutral-500"><Link href="/" prefetch={false}>Home</Link><span aria-hidden="true">/</span><span className="font-semibold text-neutral-800" aria-current="page">{eyebrow}</span></nav><header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div className="max-w-2xl"><p className="text-[10px] font-extrabold uppercase tracking-[0.17em] text-brand-700">{eyebrow}</p><h1 className="mt-3 text-[32px] font-extrabold leading-[1.1] tracking-[-0.04em] sm:text-[43px]">{title}</h1><p className="mt-3 text-[14px] leading-relaxed text-neutral-500">{description}</p></div><div className="flex flex-wrap items-center gap-2">{action}<button type="button" onClick={state.refresh} disabled={state.loading || Boolean(state.busy)} aria-label="Refresh workspace" className={secondaryClass}><RefreshCw size={15} className={state.loading ? 'animate-spin' : ''} aria-hidden="true"/>Refresh</button></div></header><nav aria-label="Workspace pages" className="mt-7 flex flex-wrap gap-1.5 border-b border-neutral-200 pb-4">{WORKSPACE_NAV.map(item => <Link key={item.href} href={item.href} prefetch={false} aria-current={path === item.href ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-xl px-3.5 text-[12px] font-bold ${path === item.href ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100'}`}>{item.label}</Link>)}</nav>{!state.loading && !state.user && <div className="mt-6 flex flex-col justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-5 sm:flex-row sm:items-center"><p className="flex max-w-xl items-start gap-2 text-[12px] leading-relaxed text-neutral-600"><LockKeyhole size={17} className="mt-0.5 shrink-0 text-brand-600" aria-hidden="true"/>Sign in to see your own accounts, schedules and activity. This page never fills an empty workspace with sample results.</p><Link href="/login" prefetch={false} className={`${primaryClass} shrink-0`}>Sign in to continue<ArrowRight size={14} aria-hidden="true"/></Link></div>}{state.error && <Feedback error>{state.error}</Feedback>}{state.notice && <Feedback>{state.notice}</Feedback>}<div className="mt-7">{children}</div></div>;
}
export function Feedback({ error = false, children }) { const Icon = error ? AlertCircle : CheckCircle2; return <div role={error ? 'alert' : 'status'} className={`mt-5 flex items-start gap-2 rounded-xl border p-4 text-[12px] leading-relaxed [overflow-wrap:anywhere] ${error ? 'border-brand-100 bg-brand-50 text-brand-800' : 'border-emerald-100 bg-emerald-50 text-emerald-900'}`}><Icon size={16} aria-hidden="true" className="mt-0.5 shrink-0"/><div className="min-w-0">{children}</div></div>; }
export function Panel({ title, description, children, className = '', action, id }) { return <section id={id} className={`min-w-0 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-[18px] font-extrabold tracking-tight">{title}</h2>{description && <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-neutral-500">{description}</p>}</div>{action}</div>{children}</section>; }
export function EmptyState({ Icon = CalendarClock, title, children, href, label }) { return <div className="px-3 py-10 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-neutral-50 text-neutral-400"><Icon size={24} aria-hidden="true"/></span><h3 className="mt-4 text-[15px] font-extrabold">{title}</h3><p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-neutral-500">{children}</p>{href && <Link href={href} prefetch={false} className={`${primaryClass} mt-5`}>{label}<ArrowRight size={14} aria-hidden="true"/></Link>}</div>; }
export function BusyButton({ busy, children, ...props }) { return <button type="submit" {...props} disabled={props.disabled || busy} className={props.className || primaryClass}>{busy ? <LoaderCircle size={15} aria-hidden="true" className="animate-spin"/> : null}{children}</button>; }
export function ExternalLink({ href, children }) { let safe = false; try { const url = new URL(href); safe = url.protocol === 'https:' && !url.username && !url.password; } catch {} return safe ? <a href={href} rel="noopener noreferrer" target="_blank" className="inline-flex min-h-11 items-center gap-1.5 text-[11px] font-bold text-brand-700">{children}<ArrowUpRight size={12} aria-hidden="true"/></a> : null; }
export function AutomationBadge({ row, data }) {
  let label = 'Paused', tone = 'bg-neutral-100 text-neutral-600';
  if (row.lastError) { label = 'Needs attention'; tone = 'bg-brand-50 text-brand-700'; }
  else if (row.enabled) { const seen = new Date(data?.heartbeat?.lastSeenAt || 0).getTime(), healthy = seen > Date.now() - 45 * 60000 && data?.heartbeat?.lastStatus !== 'error'; label = healthy && data?.infrastructure?.ready ? 'Schedule enabled' : 'Awaiting background check'; tone = healthy ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'; }
  return <span className={`inline-flex rounded-lg px-2.5 py-1.5 text-[10px] font-bold ${tone}`}>{label}</span>;
}
