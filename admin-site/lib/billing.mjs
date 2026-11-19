// Owner payment review for the admin site. Mirrors PinCraft's reviewPayment (lib/billing/repository.mjs):
// same checks, same documents, same audit record. Public payment collection is not changed here.
import { createHash } from 'node:crypto';
import { db, auth } from './firebase.mjs';
import { OWNER_EMAIL, PINCRAFT_PAYMENTS_ENABLED } from './config.mjs';
import { decryptPaymentReference } from './vault.mjs';

const PLAN_REF = 'pincraft_system/subscriptionPlan';
const PENDING_LIMIT = 100;
const ownerKey = uid => createHash('sha256').update(uid).digest('hex');
const unpack = value => (value && typeof value.toDate === 'function' ? value.toDate() : value);
const row = snap => (snap && snap.exists ? Object.fromEntries(Object.entries(snap.data()).map(([k, v]) => [k, unpack(v)])) : null);
const iso = value => (value ? new Date(value).toISOString() : null);
const ms = value => (value ? new Date(value).getTime() : 0);

export class BillingError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

export async function ownerUid() {
  const user = await auth().getUserByEmail(OWNER_EMAIL);
  if (!user.emailVerified || user.disabled) throw new BillingError('forbidden', 'Only the billing administrator can review payments.', 403);
  return user.uid;
}

export async function collectBilling() {
  const database = db();
  const [planSnap, pendingSnap, totalSnap, auditSnap] = await Promise.all([
    database.doc(PLAN_REF).get(),
    database.collection('pincraft_payment_requests').where('status', '==', 'pending').limit(PENDING_LIMIT).get(),
    database.collection('pincraft_payment_requests').count().get(),
    database.collection('pincraft_billing_audit').orderBy('created_at', 'desc').limit(25).get(),
  ]);
  const plan = row(planSnap);
  const requests = pendingSnap.docs.map(snap => {
    const r = row(snap) || {};
    let reference = null, unreadable = false;
    try { reference = decryptPaymentReference(`billing:${r.user_id}:${r.id}`, r.encrypted_reference); } catch { unreadable = true; }
    return {
      id: r.id || snap.id,
      method: r.method || null,
      transactionId: reference?.transactionId || null,
      payerPhone: reference?.payerPhone || null,
      transactionSuffix: r.transaction_suffix || null,
      payerSuffix: r.payer_suffix || null,
      amountBdt: Number.isFinite(r.amount_bdt) ? r.amount_bdt : null,
      durationDays: Number.isFinite(r.plan?.durationDays) ? r.plan.durationDays : null,
      submittedAt: iso(r.created_at),
      canApprove: !unreadable && Boolean(reference?.transactionId),
      unreadableReason: unreadable ? 'The transaction could not be decrypted. Check the vault key before approving.' : null,
    };
  }).sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)));
  const decisions = auditSnap.docs.map(snap => {
    const r = row(snap) || {};
    return { id: snap.id, paymentId: r.payment_id || null, action: r.action || null, note: r.note || null, reviewerId: r.reviewer_id || null, decidedAt: iso(r.created_at) };
  });
  return {
    generatedAt: new Date().toISOString(),
    plan: plan ? { configured: Boolean(plan.priceBdt && plan.durationDays), priceBdt: plan.priceBdt ?? null, durationDays: plan.durationDays ?? null, enabled: PINCRAFT_PAYMENTS_ENABLED } : null,
    counts: { pending: requests.length, pendingCapped: requests.length >= PENDING_LIMIT, allTime: totalSnap.data().count },
    requests,
    decisions,
    notes: [
      'Approve requires the exact transaction and amount to be checked in the receiving wallet first.',
      'Approve and reject are recorded in the billing audit with the reviewer, the time and the note.',
      'Public payment collection stays off while the plan’s enabled flag is false.',
    ],
  };
}

// action: 'approve' | 'reject'. Same rules and writes as PinCraft's reviewPayment.
export async function reviewPayment(database, { id, action, confirmWalletReceipt, note }, reviewer) {
  if (!/^[a-f0-9]{64}$/.test(id || '') || !['approve', 'reject'].includes(action) || (action === 'approve' && confirmWalletReceipt !== true) || typeof note !== 'string' || note.trim().length < 5 || note.length > 300 || /[\u0000-\u001f<>]/.test(note)) {
    throw new BillingError('invalid_review', 'Add a review note. Approval also requires an independent check of the exact amount and transaction in the receiving wallet.');
  }
  if (!reviewer) throw new BillingError('forbidden', 'Only the billing administrator can review payments.', 403);
  await database.runTransaction(async tx => {
    const ref = database.collection('pincraft_payment_requests').doc(id), payment = row(await tx.get(ref));
    if (!payment || payment.status !== 'pending') throw new BillingError('already_reviewed', 'This payment is not awaiting review.', 409);
    const subRef = database.collection('pincraft_subscriptions').doc(ownerKey(payment.user_id)), sub = row(await tx.get(subRef));
    if (sub?.pending_payment_id !== id) throw new BillingError('payment_changed', 'This payment’s review state changed. Reload before reviewing.', 409);
    const now = new Date(), status = action === 'approve' ? 'approved' : 'rejected', changes = { status, reviewed_at: now, reviewed_by: reviewer, review_note: note.trim() };
    tx.update(ref, changes);
    tx.update(database.collection('pincraft_accounts').doc(ownerKey(payment.user_id)).collection('payments').doc(id), changes);
    const entitlement = action === 'approve' ? { status: 'active', activated_at: sub?.activated_at || now, expires_at: new Date(Math.max(Date.now(), ms(sub?.expires_at)) + payment.plan.durationDays * 86400000), limits: payment.plan.limits, approved_payment_id: id } : {};
    tx.set(subRef, { ...(sub || {}), ...entitlement, user_id: payment.user_id, pending_payment_id: null, updated_at: now });
    tx.set(database.collection('pincraft_billing_audit').doc(), { payment_id: id, reviewer_id: reviewer, action, note: note.trim(), created_at: now });
  });
  return { reviewed: true, status: action === 'approve' ? 'approved' : 'rejected' };
}
