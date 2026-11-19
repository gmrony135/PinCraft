'use client';
import { useState } from 'react';

const fmt = value => (typeof value === 'number' ? value.toLocaleString('en-US') : '—');
const when = iso => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' }) : '—');
const methodName = m => (m === 'bkash' ? 'bKash' : m === 'nagad' ? 'Nagad' : m || '—');
const noteOk = note => note.trim().length >= 5 && note.length <= 300 && !/[\u0000-\u001f<>]/.test(note);

export default function BillingReview({ billing, error, notice, onUpdate, onError }) {
  return (
    <section className="card" aria-labelledby="billing-h">
      <h2 id="billing-h">Payment reviews</h2>
      <p className="sub">Approve only after checking the exact transaction and amount in your bKash or Nagad receiving account. Approve activates the subscription; reject closes the request. Every decision is recorded.</p>
      {error && <p className="banner error" role="alert">{error}</p>}
      {notice && <p className="banner info" role="status">{notice}</p>}
      {billing && (
        <>
          <div className="grid" style={{ marginTop: 8 }}>
            <Stat label="Awaiting review" value={fmt(billing.counts.pending)} hint={billing.counts.pendingCapped ? 'Showing the first 100' : 'Pending requests'} />
            <Stat label="All payment requests" value={fmt(billing.counts.allTime)} hint="Any status" />
            <Stat label="Public plan collection" value={billing.plan && billing.plan.enabled ? 'On' : 'Off'} hint={billing.plan && billing.plan.configured ? `${fmt(billing.plan.priceBdt)} BDT / ${fmt(billing.plan.durationDays)} days` : 'No plan saved'} />
          </div>
          {billing.requests.length === 0 ? (
            <p className="muted" style={{ marginTop: 14 }}>No payment requests are awaiting review.</p>
          ) : (
            <ul className="review-list">
              {billing.requests.map(r => <ReviewItem key={r.id} request={r} onUpdate={onUpdate} onError={onError} />)}
            </ul>
          )}
          <h3 style={{ marginTop: 18 }}>Decision record</h3>
          {billing.decisions.length === 0 ? (
            <p className="muted">No decisions recorded yet.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead><tr><th>When</th><th>Decision</th><th>Request</th><th>Reviewer</th><th>Note</th></tr></thead>
                <tbody>
                  {billing.decisions.map(d => (
                    <tr key={d.id}>
                      <td>{when(d.decidedAt)}</td>
                      <td><span className={`pill ${d.action === 'approve' ? 'yes' : 'no'}`}>{d.action === 'approve' ? 'Approved' : d.action === 'reject' ? 'Rejected' : '—'}</span></td>
                      <td className="mono">{d.paymentId ? `${d.paymentId.slice(0, 10)}…` : '—'}</td>
                      <td className="mono">{d.reviewerId ? `${d.reviewerId.slice(0, 8)}…` : '—'}</td>
                      <td style={{ whiteSpace: 'normal' }}>{d.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ul className="notes" style={{ marginTop: 12 }}>{billing.notes.map(n => <li key={n}>{n}</li>)}</ul>
        </>
      )}
    </section>
  );
}

function ReviewItem({ request, onUpdate, onError }) {
  const [checked, setChecked] = useState(false), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [local, setLocal] = useState('');
  async function decide(action) {
    if (busy) return;
    setBusy(true); setLocal(''); onError('');
    try {
      const response = await fetch('/api/billing/review', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, id: request.id, confirmWalletReceipt: action === 'approve' ? checked : undefined, note }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'The decision was not saved. Reload and check the request.');
      onUpdate(result, action === 'approve' ? 'Approved. The subscription is active for this request.' : 'Rejected. Nothing was activated.');
    } catch (issue) { setLocal(issue.message); }
    finally { setBusy(false); }
  }
  const ready = noteOk(note);
  return (
    <li className="review-item">
      <div className="review-head">
        <strong>{methodName(request.method)} · ৳{fmt(request.amountBdt)}</strong>
        <span className="sub">Submitted {when(request.submittedAt)} · {request.durationDays ? `${request.durationDays}-day plan` : 'plan not recorded'}</span>
      </div>
      <dl className="review-fields">
        <div><dt>Transaction ID</dt><dd className="mono">{request.transactionId || '—'}</dd></div>
        <div><dt>Payer number</dt><dd className="mono">{request.payerPhone || '—'}</dd></div>
        <div><dt>Request</dt><dd className="mono">{request.id.slice(0, 12)}…</dd></div>
      </dl>
      {request.unreadableReason && <p className="banner error">{request.unreadableReason}</p>}
      <label className="check"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} disabled={!request.canApprove} /> I checked this transaction ID and ৳{fmt(request.amountBdt)} in my receiving account.</label>
      <label className="block">Review note (5–300 characters, recorded with the decision)
        <textarea maxLength={300} value={note} onChange={e => setNote(e.target.value)} rows={2} />
      </label>
      {local && <p className="banner error" role="alert">{local}</p>}
      <div className="review-actions">
        <button className="btn primary" disabled={busy || !ready || !checked || !request.canApprove} onClick={() => decide('approve')}>{busy ? 'Saving…' : 'Approve'}</button>
        <button className="btn" disabled={busy || !ready} onClick={() => decide('reject')}>Reject</button>
      </div>
    </li>
  );
}

function Stat({ label, value, hint }) {
  return <div className="stat"><div className="label">{label}</div><div className="value">{value}</div><div className="hint">{hint}</div></div>;
}
