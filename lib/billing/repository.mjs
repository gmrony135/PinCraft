import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { transaction } from '../automation/db.mjs';
import { accountRef, ownerKey, data, iso, ms } from '../automation/firestore.mjs';
import { AutomationError } from '../automation/errors.mjs';
import { encryptCredentials, decryptCredentials } from '../automation/vault.mjs';
import { FREE_LIMITS, PLAN_REF, publicPlan, planInput, billingAdmin } from './config.mjs';
const subscriptionRef = (db, uid) => db.collection('pincraft_subscriptions').doc(ownerKey(uid));
const paymentRef = (db, id) => db.collection('pincraft_payment_requests').doc(id);
const ownPayments = (db, uid) => accountRef(db, uid).collection('payments');
export { subscriptionState } from '../publishing/policy.mjs';
import { subscriptionState } from '../publishing/policy.mjs';
export async function entitlements(db, uid, tx = null) { const ref = subscriptionRef(db, uid); return subscriptionState(data(await (tx ? tx.get(ref) : ref.get()))); }
export async function requirePaid(db, uid, tx = null) { const access = await entitlements(db, uid, tx); if (access.tier !== 'paid') throw new AutomationError('subscription_required', 'An active subscription is required for additional Pinterest accounts or websites. A submitted payment is not an approved subscription.', { status: 402 }); return access; }
export async function planStatus(db) { return publicPlan(data(await db.doc(PLAN_REF).get())); }
const paymentPublic = row => ({ id: row.id, method: row.method, transactionSuffix: row.transaction_suffix, payerSuffix: row.payer_suffix, amountBdt: row.amount_bdt, durationDays: row.plan.durationDays, status: row.status, submittedAt: iso(row.created_at), reviewedAt: iso(row.reviewed_at), note: row.review_note || null });
export async function billingStatus(db, user) {
  const [access, plan, payments, canReview] = await Promise.all([entitlements(db, user.id), planStatus(db), ownPayments(db, user.id).orderBy('created_at', 'desc').limit(20).get(), billingAdmin(user)]);
  return { subscription: access, plan, payments: payments.docs.map(doc => paymentPublic(data(doc))), permissions: { canReviewPayments: canReview } };
}
export async function submitPayment(db, uid, raw) {
  if (Object.keys(raw).some(key => !['method', 'transactionId', 'payerPhone', 'planRevision', 'acknowledgeManualReview'].includes(key))) throw new AutomationError('invalid_payment', 'Send only the requested payment reference. Never send a PIN, OTP or password.');
  const method = raw.method, transactionId = typeof raw.transactionId === 'string' ? raw.transactionId.trim().toUpperCase() : '', phone = typeof raw.payerPhone === 'string' ? raw.payerPhone.trim().replace(/^\+88/, '') : '';
  if (!['bkash', 'nagad'].includes(method) || !/^[A-Z0-9]{6,30}$/.test(transactionId) || !/^01[3-9]\d{8}$/.test(phone) || raw.acknowledgeManualReview !== true) throw new AutomationError('invalid_payment', 'Enter a valid wallet, transaction ID and Bangladeshi payer number, and accept manual review. Never submit a wallet PIN or OTP.');
  const id = createHash('sha256').update(`${method}:${transactionId}`).digest('hex'), ref = paymentRef(db, id), own = ownPayments(db, uid).doc(id);
  await transaction(db, async tx => {
    const [planSnap, existing, subscription] = await Promise.all([tx.get(db.doc(PLAN_REF)), tx.get(ref), tx.get(subscriptionRef(db, uid))]);
    const plan = publicPlan(data(planSnap)), current = data(subscription);
    if (!plan.enabled) throw new AutomationError('payments_unavailable', 'Subscription pricing and a reviewer must be confirmed before payments can be collected. Do not send money yet.', { status: 503 });
    if (plan.revision !== raw.planRevision) throw new AutomationError('plan_changed', 'The plan changed. Reload and confirm the current price before paying.', { status: 409 });
    if (existing.exists) { if (data(existing).user_id === uid && data(existing).status === 'pending') return; throw new AutomationError('reference_unavailable', 'This payment reference cannot be submitted again. Contact support if you need a review.', { status: 409 }); }
    if (current?.pending_payment_id) throw new AutomationError('payment_pending', 'Your previous payment is still awaiting review. Do not send another payment.', { status: 409 });
    const row = { id, user_id: uid, method, transaction_suffix: transactionId.slice(-4), payer_suffix: phone.slice(-3), encrypted_reference: encryptCredentials(`billing:${uid}:${id}`, { transactionId, payerPhone: phone }), amount_bdt: plan.priceBdt, plan: { revision: plan.revision, priceBdt: plan.priceBdt, durationDays: plan.durationDays, limits: plan.limits }, status: 'pending', created_at: new Date(), reviewed_at: null, review_note: null };
    tx.create(ref, row); tx.create(own, { ...row, encrypted_reference: null }); tx.set(subscriptionRef(db, uid), { ...(current || {}), user_id: uid, pending_payment_id: id, updated_at: new Date() });
  }); return { id, status: 'pending', message: 'Payment reference submitted for manual review. No payment or subscription has been confirmed.' };
}
async function adminRequired(user) { if (!(await billingAdmin(user))) throw new AutomationError('forbidden', 'Only a configured billing administrator can access payment reviews.', { status: 403 }); }
export async function adminBilling(db, user) {
  await adminRequired(user);
  const [plan, pending] = await Promise.all([planStatus(db), db.collection('pincraft_payment_requests').where('status', '==', 'pending').limit(100).get()]);
  return { plan, requests: pending.docs.map(doc => { const row = data(doc), reference = decryptCredentials(`billing:${row.user_id}:${row.id}`, row.encrypted_reference); return { ...paymentPublic(row), userId: row.user_id, transactionId: reference.transactionId, payerPhone: reference.payerPhone }; }).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)), requiresIndependentWalletCheck: true };
}
export async function savePlan(db, user, raw) {
  await adminRequired(user); let plan; try { plan = planInput(raw); } catch (issue) { throw new AutomationError('invalid_plan', issue.message); }
  await db.doc(PLAN_REF).set({ ...plan, revision: randomUUID(), updated_at: new Date(), updated_by: user.id }); return { saved: true };
}
export async function reviewPayment(db, user, { id, action, confirmWalletReceipt, note }) {
  await adminRequired(user);
  if (!/^[a-f0-9]{64}$/.test(id || '') || !['approve', 'reject'].includes(action) || (action === 'approve' && confirmWalletReceipt !== true) || typeof note !== 'string' || note.trim().length < 5 || note.length > 300 || /[\u0000-\u001f<>]/.test(note)) throw new AutomationError('invalid_review', 'Add a review note. Approval also requires an independent check of the exact amount and transaction in the receiving wallet.');
  await transaction(db, async tx => {
    const ref = paymentRef(db, id), row = data(await tx.get(ref));
    if (!row || row.status !== 'pending') throw new AutomationError('already_reviewed', 'This payment is not awaiting review.', { status: 409 });
    const subRef = subscriptionRef(db, row.user_id), sub = data(await tx.get(subRef));
    if (sub?.pending_payment_id !== id) throw new AutomationError('payment_changed', 'This payment’s review state changed. Reload before reviewing.', { status: 409 });
    const now = new Date(), status = action === 'approve' ? 'approved' : 'rejected', changes = { status, reviewed_at: now, reviewed_by: user.id, review_note: note.trim() };
    tx.update(ref, changes); tx.update(ownPayments(db, row.user_id).doc(id), changes);
    const entitlement = action === 'approve' ? { status: 'active', activated_at: sub.activated_at || now, expires_at: new Date(Math.max(Date.now(), ms(sub.expires_at)) + row.plan.durationDays * 86400000), limits: row.plan.limits, approved_payment_id: id } : {};
    tx.set(subRef, { ...sub, ...entitlement, user_id: row.user_id, pending_payment_id: null, updated_at: now });
    tx.set(db.collection('pincraft_billing_audit').doc(), { payment_id: id, reviewer_id: user.id, action, note: note.trim(), created_at: now });
  }); return { reviewed: true, status: action === 'approve' ? 'approved' : 'rejected' };
}
