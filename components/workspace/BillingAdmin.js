"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../providers/AppProvider';
import { Panel, Feedback, EmptyState, formatWhen, fieldClass, primaryClass, secondaryClass } from './WorkspaceUI';
export default function BillingAdmin() {
  const { user, authLoading } = useAuth();
  const [record, setRecord] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0), [plan, setPlan] = useState({ priceBdt: '', durationDays: '', pinterestLimit: '', websiteLimit: '', enabled: false });
  const owner = useRef(null), sequence = useRef(0), operation = useRef(0), pending = useRef(false); owner.current = user?.id || null;
  const data = record && user && record.owner === user.id ? record.value : null;
  useEffect(() => {
    const requestId = ++sequence.current; operation.current++; pending.current = false;
    setRecord(null); setError(''); setNotice(''); setBusy(false); setPlan({ priceBdt: '', durationDays: '', pinterestLimit: '', websiteLimit: '', enabled: false });
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    const controller = new AbortController(), uid = user.id; setLoading(true);
    fetch('/api/admin/billing', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal }).then(async response => {
      const result = await response.json(); if (requestId !== sequence.current || owner.current !== uid || controller.signal.aborted) return;
      if (!response.ok) throw new Error(result.error || 'Administration is unavailable.');
      setRecord({ owner: uid, value: result });
      if (result.plan.configured) setPlan({ priceBdt: result.plan.priceBdt, durationDays: result.plan.durationDays, pinterestLimit: result.plan.limits.pinterest, websiteLimit: result.plan.limits.websites, enabled: result.plan.enabled });
    }).catch(issue => { if (issue.name !== 'AbortError' && requestId === sequence.current && owner.current === uid) setError(issue.message); }).finally(() => { if (!controller.signal.aborted && requestId === sequence.current && owner.current === uid) setLoading(false); });
    return () => { controller.abort(); sequence.current++; };
  }, [authLoading, user?.id, retry]);
  async function post(body, message) {
    if (pending.current || !user) return; const uid = user.id, opId = ++operation.current; pending.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/billing', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), result = await response.json();
      if (owner.current !== uid || operation.current !== opId) return;
      if (!response.ok) throw new Error(result.error || 'The review was not saved.');
      setRecord({ owner: uid, value: result }); setNotice(message);
    } catch (issue) { if (owner.current === uid && operation.current === opId) setError(issue.message); }
    finally { if (owner.current === uid && operation.current === opId) { pending.current = false; setBusy(false); } }
  }
  return <div className="container-x py-9 sm:py-14"><Link href="/subscription" prefetch={false} className="inline-flex min-h-11 items-center text-[12px] font-bold text-neutral-500">← Subscription</Link><p className="mt-6 text-[10px] font-bold uppercase tracking-widest text-brand-700">Restricted administration</p><h1 className="mt-3 text-[34px] font-extrabold tracking-tight">Payment review</h1><p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-neutral-500">Only explicitly configured, verified administrators may publish pricing or approve receipts. Never approve from a transaction ID alone: check the receiving bKash/Nagad wallet independently.</p>{error && <Feedback error>{error}<button type="button" onClick={() => setRetry(value => value + 1)} disabled={loading || busy} className="mt-2 block min-h-11 font-bold underline">Retry access check</button></Feedback>}{notice && <Feedback>{notice}</Feedback>}{loading ? <p role="status" className="mt-6 text-[13px] text-neutral-500">Checking administrator access…</p> : !user ? <Link href="/login" prefetch={false} className={`${primaryClass} mt-6`}>Sign in</Link> : !data ? <Panel className="mt-6" title="Administrator access is restricted" description="No billing administrator has been inferred from a public profile or registration. The owner must explicitly authorize the review account in the server configuration."/> : <>
    <Panel className="mt-7" title="Publish the real subscription plan" description="Owner-confirmed starting terms: ৳99 for 30 days, with 2 Pinterest accounts and 2 websites. Collection remains off until an authorized reviewer enables it. Disabling payments does not erase earlier approvals."><form className="mt-5 space-y-5" onSubmit={event => { event.preventDefault(); post({ action: 'plan', ...plan }, 'Plan settings saved. The published price is now authoritative for new payment submissions.'); }}><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['priceBdt', 'Price in BDT', 1, 100000], ['durationDays', 'Duration in days', 1, 366], ['pinterestLimit', 'Pinterest account limit', 2, 20], ['websiteLimit', 'Website limit', 2, 20]].map(([key, label, min, max]) => <label key={key} className="min-w-0 text-[11.5px] font-bold">{label}<input type="number" required min={min} max={max} step="1" value={plan[key]} onChange={event => setPlan(previous => ({ ...previous, [key]: event.target.value }))} className={fieldClass}/></label>)}</div><label className="flex items-start gap-2 text-[12px] leading-relaxed text-neutral-600"><input type="checkbox" checked={plan.enabled} onChange={event => setPlan(previous => ({ ...previous, enabled: event.target.checked }))} className="mt-0.5 h-4 w-4 shrink-0 accent-[#E60023]"/>Enable manual payment collection at the owner-provided number, 01964182265.</label><button disabled={busy} className={primaryClass}>Save subscription plan</button></form></Panel>
    <Panel className="mt-6" title="Pending references" description="Approving a verified receipt creates a dated server-side entitlement. Submitting a payment never grants one automatically.">{data.requests.length ? <ul className="mt-5 space-y-5">{data.requests.map(request => <ReviewRow key={request.id} request={request} busy={busy} onReview={post}/>)}</ul> : <EmptyState Icon={ShieldCheck} title="No pending reviews">Only real submitted references are listed.</EmptyState>}</Panel>
  </>}</div>;
}
function ReviewRow({ request, busy, onReview }) {
  const [checked, setChecked] = useState(false), [note, setNote] = useState('');
  return <li className="rounded-xl border border-neutral-200 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><h3 className="text-[13px] font-extrabold">{request.method === 'bkash' ? 'bKash' : 'Nagad'} · ৳{request.amountBdt}</h3><p className="text-[10px] text-neutral-500">{formatWhen(request.submittedAt)}</p></div><dl className="mt-4 space-y-2 text-[12px]"><div><dt className="inline text-neutral-500">Transaction: </dt><dd className="inline select-all font-bold [overflow-wrap:anywhere]">{request.transactionId}</dd></div><div><dt className="inline text-neutral-500">Payer: </dt><dd className="inline font-bold">{request.payerPhone}</dd></div><div><dt className="inline text-neutral-500">Workspace: </dt><dd className="inline select-all text-[10px] [overflow-wrap:anywhere]">{request.userId}</dd></div></dl><label className="mt-4 block text-[12px] font-bold">Review note<input minLength={5} maxLength={300} value={note} onChange={event => setNote(event.target.value)} className={fieldClass}/></label><label className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-neutral-600"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#E60023]"/>I independently checked this exact transaction and amount in the receiving wallet, including that it was not previously approved.</label><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy || !checked || note.trim().length < 5} onClick={() => onReview({ action: 'approve', id: request.id, note, confirmWalletReceipt: checked }, 'Receipt manually approved. A dated subscription entitlement was recorded.')} className={primaryClass}>Approve verified receipt</button><button type="button" disabled={busy || note.trim().length < 5} onClick={() => onReview({ action: 'reject', id: request.id, note }, 'Reference rejected. No subscription was activated.')} className={secondaryClass}>Reject with note</button></div></li>;
}
