// Read-only payment review for the owner. Approve and reject are not enabled here:
// approval needs the vault key to read the full transaction ID and a subscription write,
// and neither is set up for this admin site yet. The owner must review in PinCraft's
// reviewer flow until that is added on purpose.
import 'server-only';
import { db } from './firebase.mjs';

const PLAN_REF = 'pincraft_system/subscriptionPlan';
const iso = value => (value && typeof value.toDate === 'function' ? value.toDate().toISOString() : null);
const PENDING_LIMIT = 100;

export async function collectBilling() {
  const database = db();
  const [planSnap, pendingSnap, totalSnap] = await Promise.all([
    database.doc(PLAN_REF).get(),
    database.collection('pincraft_payment_requests').where('status', '==', 'pending').limit(PENDING_LIMIT).get(),
    database.collection('pincraft_payment_requests').count().get(),
  ]);
  const plan = planSnap.exists ? planSnap.data() : null;
  const requests = pendingSnap.docs.map(doc => {
    const row = doc.data();
    return {
      id: row.id || doc.id,
      method: row.method || null,
      transactionSuffix: row.transaction_suffix || null,
      payerSuffix: row.payer_suffix || null,
      amountBdt: Number.isFinite(row.amount_bdt) ? row.amount_bdt : null,
      durationDays: Number.isFinite(row.plan?.durationDays) ? row.plan.durationDays : null,
      status: row.status || null,
      submittedAt: iso(row.created_at),
    };
  }).sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)));
  return {
    generatedAt: new Date().toISOString(),
    plan: plan ? {
      configured: Boolean(plan.priceBdt && plan.durationDays),
      priceBdt: plan.priceBdt ?? null,
      durationDays: plan.durationDays ?? null,
      enabled: plan.enabled === true,
      revision: plan.revision || null,
    } : null,
    counts: { pending: requests.length, pendingCapped: requests.length >= PENDING_LIMIT, allTime: totalSnap.data().count },
    requests,
    notes: [
      'Payment requests are read live from Firestore. Full transaction IDs and phone numbers are not shown here.',
      'Approve and reject are not enabled in this admin site. Review and approve payments only through PinCraft’s reviewer flow until this is added on purpose.',
      'Public plan collection stays off while the plan’s enabled flag is false.',
    ],
  };
}
