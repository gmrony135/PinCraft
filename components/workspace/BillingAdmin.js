"use client";
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../providers/AppProvider';
import { Panel, Feedback, EmptyState, formatWhen, fieldClass, primaryClass, secondaryClass } from './WorkspaceUI';

const money = value => (Number.isFinite(value) ? `৳${Number(value).toLocaleString('en-US')}` : '—');
const methodName = method => (method === 'bkash' ? 'bKash' : method === 'nagad' ? 'Nagad' : method || '—');
const noteOk = note => note.trim().length >= 5 && note.length <= 300 && !/[\u0000-\u001f<>]/.test(note);

export default function BillingAdmin() {
  const { user, authLoading } = useAuth();
  const [data, setData] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [loading, setLoading] = useState(true);

  const load = useCallback(async (signal) => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/billing', { credentials: 'same-origin', cache: 'no-store', signal });
      const result = await response.json().catch(() => ({}));
      if (signal?.aborted) return;
      if (!response.ok) throw new Error(result.error === 'forbidden' ? 'Only the billing administrator can open this page.' : (result.message || 'Payment reviews could not be loaded. Try again.'));
      setData(result);
    } catch (issue) {
      if (issue.name !== 'AbortError') setError(issue.message);
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    if (authLoading) return undefined;
    if (!user) { setLoading(false); return undefined; }
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [authLoading, user?.id, load]);

  if (authLoading || loading) return <div className="container-x py-14"><p className="text-[13px] text-neutral-500">Loading payment reviews…</p></div>;
  if (!user) return <div className="container-x py-14"><Feedback error>Sign in with the billing administrator account to open payment review.</Feedback></div>;

  return (
    <div className="container-x py-9 sm:py-14">
      <Link href="/" prefetch={false} className="inline-flex min-h-11 items-center text-[12px] font-bold text-neutral-500">← Home</Link>
      <p className="mt-6 text-[10px] font-extrabold uppercase tracking-[0.2em] text-brand-700">Owner only · not indexed</p>
      <h1 className="mt-2 text-[28px] font-extrabold tracking-tight sm:text-[34px]">Payment review</h1>
      <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-neutral-600">
        Check each request against your bKash or Nagad receiving account before you decide. Approve activates the subscription for the plan shown on the request. Reject closes the request without activating anything. Every decision is recorded.
      </p>
      {error && <div className="mt-6"><Feedback error>{error}</Feedback></div>}
      {notice && <div className="mt-6"><Feedback>{notice}</Feedback></div>}

      {data && (
        <>
          <Panel className="mt-7" title="Plan and collection" description="Read-only here. Public payment collection stays off until it is enabled deliberately.">
            <dl className="mt-4 grid gap-4 text-[13px] sm:grid-cols-3">
              <div><dt className="font-bold text-neutral-500">Price</dt><dd className="mt-1 font-extrabold">{data.plan?.configured ? `${money(data.plan.priceBdt)} for ${data.plan.durationDays} days` : 'No plan saved'}</dd></div>
              <div><dt className="font-bold text-neutral-500">Public collection</dt><dd className="mt-1 font-extrabold">{data.plan?.enabled ? 'On' : 'Off'}</dd></div>
              <div><dt className="font-bold text-neutral-500">Awaiting review</dt><dd className="mt-1 font-extrabold">{data.requests.length}</dd></div>
            </dl>
          </Panel>

          <Panel className="mt-6" title="Pending payment requests" description="Newest last. Full transaction IDs and payer numbers are shown only to this administrator.">
            {data.requests.length === 0 ? (
              <EmptyState title="No payment requests are awaiting review">New requests appear here as they are submitted.</EmptyState>
            ) : (
              <ul className="mt-5 space-y-5">
                {data.requests.map(request => (
                  <ReviewRow key={request.id} request={request} onDone={msg => { setNotice(msg); load(); }} onError={setError} />
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="mt-6" title="Decision record" description="Who decided, what, and when. Most recent first.">
            {data.decisions.length === 0 ? (
              <p className="mt-5 text-[13px] text-neutral-500">No decisions have been recorded yet.</p>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-[13px]">
                  <thead><tr className="border-b border-neutral-200 text-[11px] uppercase tracking-wide text-neutral-500"><th className="py-2 pr-3">When</th><th className="py-2 pr-3">Decision</th><th className="py-2 pr-3">Request</th><th className="py-2 pr-3">Reviewer</th><th className="py-2">Note</th></tr></thead>
                  <tbody>
                    {data.decisions.map(d => (
                      <tr key={d.id} className="border-b border-neutral-100 align-top">
                        <td className="py-2 pr-3">{formatWhen(d.decidedAt)}</td>
                        <td className="py-2 pr-3 font-bold">{d.action === 'approve' ? 'Approved' : d.action === 'reject' ? 'Rejected' : '—'}</td>
                        <td className="py-2 pr-3 font-mono text-[11px]">{d.paymentId ? `${d.paymentId.slice(0, 10)}…` : '—'}</td>
                        <td className="py-2 pr-3 font-mono text-[11px]">{d.reviewerId ? `${d.reviewerId.slice(0, 8)}…` : '—'}</td>
                        <td className="py-2 break-words">{d.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

function ReviewRow({ request, onDone, onError }) {
  const [checked, setChecked] = useState(false), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [local, setLocal] = useState('');
  async function decide(action) {
    if (busy) return;
    setBusy(true); setLocal(''); onError('');
    try {
      const response = await fetch('/api/admin/billing', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id: request.id, confirmWalletReceipt: action === 'approve' ? checked : undefined, note }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.error || 'The decision was not saved. Reload and check the request.');
      onDone(action === 'approve' ? 'Approved. The subscription is active for this request.' : 'Rejected. The request is closed and nothing was activated.');
    } catch (issue) { setLocal(issue.message); }
    finally { setBusy(false); }
  }
  const canNote = noteOk(note);
  return (
    <li className="rounded-xl border border-neutral-200 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-extrabold">{methodName(request.method)} · {money(request.amountBdt)}</p>
          <p className="mt-1 text-[12px] text-neutral-500">Submitted {formatWhen(request.submittedAt)} · {request.durationDays ? `${request.durationDays}-day plan` : 'Plan not recorded'}</p>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-extrabold text-amber-800">Pending</span>
      </div>
      <dl className="mt-4 grid gap-3 text-[13px] sm:grid-cols-3">
        <div><dt className="font-bold text-neutral-500">Transaction ID</dt><dd className="mt-1 break-all font-mono font-bold">{request.transactionId || '—'}</dd></div>
        <div><dt className="font-bold text-neutral-500">Payer number</dt><dd className="mt-1 font-mono font-bold">{request.payerPhone || '—'}</dd></div>
        <div><dt className="font-bold text-neutral-500">Request ID</dt><dd className="mt-1 break-all font-mono text-[11px] text-neutral-500">{request.id}</dd></div>
      </dl>
      <div className="mt-5 space-y-4">
        <label className="flex items-start gap-3 text-[13px] leading-relaxed">
          <input type="checkbox" className="mt-1 h-5 w-5" checked={checked} disabled={!request.transactionId} onChange={e => setChecked(e.target.checked)} />
          <span>I checked this exact transaction ID and the amount ৳{request.amountBdt ?? '—'} in my bKash or Nagad receiving account before approving.</span>
        </label>
        <label className="block text-[12px] font-bold text-neutral-600">
          Review note (required, 5–300 characters; this is the reason shown in the decision record)
          <textarea className={`${fieldClass} min-h-24`} maxLength={300} value={note} onChange={e => setNote(e.target.value)} />
        </label>
        {local && <Feedback error>{local}</Feedback>}
        <div className="flex flex-wrap gap-3">
          <button type="button" className={primaryClass} disabled={busy || !checked || !canNote || !request.transactionId} onClick={() => decide('approve')}>{busy ? 'Saving…' : 'Approve and activate'}</button>
          <button type="button" className={secondaryClass} disabled={busy || !canNote} onClick={() => decide('reject')}>Reject request</button>
        </div>
      </div>
    </li>
  );
}
