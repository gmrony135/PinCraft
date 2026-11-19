// Offline checks with synthetic records only. Run: node scripts/test-billing-review.mjs
import assert from 'node:assert/strict';
import { createCipheriv, randomBytes, createHash } from 'node:crypto';
process.env.AUTOMATION_ENCRYPTION_KEY = randomBytes(32).toString('base64');
const { decryptPaymentReference } = await import('../lib/vault.mjs');
const { reviewPayment, BillingError } = await import('../lib/billing.mjs');

// Encrypt exactly as PinCraft's lib/automation/vault.mjs does, then decrypt with the admin copy.
function pincraftEncrypt(userId, value) {
  const iv = randomBytes(12), key = Buffer.from(process.env.AUTOMATION_ENCRYPTION_KEY, 'base64');
  const c = createCipheriv('aes-256-gcm', key, iv); c.setAAD(Buffer.from(`pincraft-auto:v1:${userId}`));
  const data = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}
const results = []; const t = (name, fn) => { try { fn(); results.push([true, name]); } catch (e) { results.push([false, name + ': ' + e.message]); } };
const ta = async (name, fn) => { try { await fn(); results.push([true, name]); } catch (e) { results.push([false, name + ': ' + e.message]); } };

t('admin decrypts a PinCraft-encrypted payment reference', () => {
  const env = pincraftEncrypt('billing:uid1:abc', { transactionId: 'TXN12345', payerPhone: '017XXXXXXX' });
  assert.deepEqual(decryptPaymentReference('billing:uid1:abc', env), { transactionId: 'TXN12345', payerPhone: '017XXXXXXX' });
});
t('a reference bound to another user or request does not decrypt', () => {
  const env = pincraftEncrypt('billing:uid1:abc', { transactionId: 'X', payerPhone: 'Y' });
  assert.throws(() => decryptPaymentReference('billing:uid2:abc', env));
});

// Fake Firestore with a transaction that records writes.
const PAYMENT = 'a'.repeat(64);
function fakeDb({ status = 'pending', pendingId = PAYMENT, subExpires = null } = {}) {
  const store = new Map([
    [`pincraft_payment_requests/${PAYMENT}`, { id: PAYMENT, user_id: 'user-1', status, plan: { durationDays: 30, limits: { pinterest: 2, websites: 2 } } }],
    [`pincraft_subscriptions/${createHash('sha256').update('user-1').digest('hex')}`, { pending_payment_id: pendingId, user_id: 'user-1', expires_at: subExpires }],
  ]);
  const writes = [];
  const ref = path => ({ path, id: path.split('/').pop(), collection: n => ({ doc: id => ({ path: `${path}/${n}/${id || 'auto'}`, id: id || 'auto' }) }) });
  const db = {
    writes, store,
    collection: name => ({ doc: id => ({ path: `${name}/${id || 'auto'}`, id: id || 'auto', collection: n => ({ doc: i => ({ path: `${name}/${id}/${n}/${i || 'auto'}` }) }) }) }),
    runTransaction: async fn => {
      const tx = {
        get: async r => { const v = store.get(r.path); return { exists: v !== undefined, data: () => (v ? { ...v } : undefined) }; },
        update: (r, c) => writes.push({ op: 'update', path: r.path, data: c }),
        set: (r, c) => writes.push({ op: 'set', path: r.path, data: c }),
      };
      return fn(tx);
    },
  };
  return db;
}
const note = 'Verified in wallet';
const SUB = `pincraft_subscriptions/${createHash('sha256').update('user-1').digest('hex')}`;
const PAY = `pincraft_payment_requests/${PAYMENT}`;

await ta('approve activates the subscription and records who/when/what', async () => {
  const db = fakeDb();
  assert.deepEqual(await reviewPayment(db, { id: PAYMENT, action: 'approve', confirmWalletReceipt: true, note }, 'owner-uid'), { reviewed: true, status: 'approved' });
  const sub = db.writes.find(w => w.path === SUB).data;
  assert.equal(sub.status, 'active'); assert.equal(sub.approved_payment_id, PAYMENT); assert.equal(sub.pending_payment_id, null);
  assert.equal(sub.limits.pinterest, 2); assert.ok(sub.expires_at.getTime() > Date.now() + 29 * 86400000);
  const pay = db.writes.find(w => w.path === PAY).data;
  assert.equal(pay.status, 'approved'); assert.equal(pay.reviewed_by, 'owner-uid'); assert.equal(pay.review_note, note);
  const audit = db.writes.find(w => w.path.startsWith('pincraft_billing_audit/')).data;
  assert.equal(audit.action, 'approve'); assert.equal(audit.reviewer_id, 'owner-uid'); assert.equal(audit.note, note); assert.ok(audit.created_at instanceof Date);
  assert.ok(db.writes.some(w => w.path.startsWith(`pincraft_accounts/${createHash('sha256').update('user-1').digest('hex')}/payments/`)));
});
await ta('reject closes the request and activates nothing', async () => {
  const db = fakeDb();
  await reviewPayment(db, { id: PAYMENT, action: 'reject', note: 'Amount did not match' }, 'owner-uid');
  const sub = db.writes.find(w => w.path === SUB).data;
  assert.equal(sub.status, undefined); assert.equal(sub.approved_payment_id, undefined); assert.equal(sub.pending_payment_id, null);
  assert.equal(db.writes.find(w => w.path === PAY).data.status, 'rejected');
  assert.equal(db.writes.find(w => w.path.startsWith('pincraft_billing_audit/')).data.action, 'reject');
});
await ta('approve without the wallet check is refused and writes nothing', async () => {
  const db = fakeDb();
  await assert.rejects(reviewPayment(db, { id: PAYMENT, action: 'approve', confirmWalletReceipt: false, note }, 'owner-uid'), BillingError);
  assert.equal(db.writes.length, 0);
});
await ta('a short note is refused', async () => {
  await assert.rejects(reviewPayment(fakeDb(), { id: PAYMENT, action: 'reject', note: 'no' }, 'owner-uid'), BillingError);
});
await ta('an invalid request id is refused', async () => {
  await assert.rejects(reviewPayment(fakeDb(), { id: 'nope', action: 'reject', note }, 'owner-uid'), BillingError);
});
await ta('an already-reviewed request is not changed again', async () => {
  const db = fakeDb({ status: 'approved' });
  await assert.rejects(reviewPayment(db, { id: PAYMENT, action: 'reject', note }, 'owner-uid'), e => e.code === 'already_reviewed');
  assert.equal(db.writes.length, 0);
});
await ta('a payment that is not the pending one for this subscription is refused', async () => {
  const db = fakeDb({ pendingId: 'b'.repeat(64) });
  await assert.rejects(reviewPayment(db, { id: PAYMENT, action: 'approve', confirmWalletReceipt: true, note }, 'owner-uid'), e => e.code === 'payment_changed');
  assert.equal(db.writes.length, 0);
});
await ta('no reviewer identity means no writes', async () => {
  const db = fakeDb();
  await assert.rejects(reviewPayment(db, { id: PAYMENT, action: 'reject', note }, null), e => e.code === 'forbidden');
  assert.equal(db.writes.length, 0);
});

const failed = results.filter(([ok]) => !ok);
for (const [ok, name] of results) console.log((ok ? 'PASS ' : 'FAIL ') + name);
console.log(`\n${results.length - failed.length}/${results.length} billing review checks passed`);
if (failed.length) process.exitCode = 1;
