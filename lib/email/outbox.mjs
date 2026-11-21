import { createHash } from 'node:crypto';
import { OUTBOX_TTL_MS } from './config.mjs';

// Every email is written to email_outbox first. The document id is a hash of a deterministic key
// (for example \"welcome:<uid>\"), so creating the same message twice is refused by Firestore.
// That is how \"exactly once\" is enforced, even if the same trigger runs more than once.
export const outboxId = key => createHash('sha256').update(key).digest('hex');

export async function enqueue(db, { key, to, uid, template, subject, html, now = Date.now() }) {
  if (!/^[a-z]+:[A-Za-z0-9_.:-]{1,200}$/.test(key)) throw new Error('invalid email key');
  if (typeof to !== 'string' || !to.includes('@') || to.length > 254) throw new Error('invalid recipient');
  const ref = db.collection('email_outbox').doc(outboxId(key));
  try {
    await ref.create({
      key, to, uid: uid || null, template, subject, html,
      status: 'queued', attempts: 0,
      createdAt: new Date(now), expiresAt: new Date(now + OUTBOX_TTL_MS),
    });
    return 'queued';
  } catch (error) {
    if (error?.code === 6 || /already exists/i.test(String(error?.message || ''))) return 'duplicate';
    throw error;
  }
}

// Claims one queued row, calls `sender(row)` and records the result.
// Returns { outcome: 'skipped' | 'sent' | 'failed' | 'reauth_required' }.
// A message is claimed (\"sending\") before the provider is called. If the claim or the final write fails
// after a send, the message is not sent again. Delivery is at most once.
export async function deliverRef(db, ref, { now = Date.now(), sender }) {
  const claimed = await db.runTransaction(async tx => {
    const fresh = await tx.get(ref);
    if (!fresh.exists || fresh.data().status !== 'queued') return null;
    tx.update(ref, { status: 'sending', sendingAt: new Date(now) });
    return fresh.data();
  });
  if (!claimed) return { outcome: 'skipped' };

  let providerId;
  try {
    providerId = await sender(claimed);
  } catch (error) {
    const code = String(error?.code || '');
    if (code === 'reauth_required') {
      // The grant needs reconnecting. Put this message back; nothing else can send either.
      await ref.update({ status: 'queued', lastError: 'reauth_required' });
      return { outcome: 'reauth_required' };
    }
    const attempts = (claimed.attempts || 0) + 1;
    // Keep the message queued for a retry until its expiry. Stop after three failed attempts.
    await ref.update({ status: attempts >= 3 ? 'failed' : 'queued', attempts, lastError: (code || 'send_failed').slice(0, 200) });
    return { outcome: 'failed' };
  }
  await ref.update({ status: 'sent', sentAt: new Date(now), providerId: providerId || null, attempts: (claimed.attempts || 0) + 1 });
  return { outcome: 'sent' };
}

// Sends queued messages with `sender(row)`, which returns a provider id or throws.
// Without a sender (no Gmail grant connected) nothing leaves the server and messages simply wait, or expire.
export async function sendPending(db, { now = Date.now(), sender = null, limit = 25 } = {}) {
  const counts = { sent: 0, failed: 0, expired: 0, waiting: 0, provider: sender ? 'gmail' : 'not_configured', stoppedForReauth: false };
  const snap = await db.collection('email_outbox').where('status', '==', 'queued').limit(limit).get();
  for (const doc of snap.docs) {
    const row = doc.data();
    const expiresAt = row.expiresAt?.toDate ? row.expiresAt.toDate().getTime() : Date.parse(row.expiresAt);
    if (expiresAt && expiresAt < now) {
      await doc.ref.update({ status: 'expired', expiredAt: new Date(now) });
      counts.expired++;
      continue;
    }
    if (!sender) { counts.waiting++; continue; }

    const result = await deliverRef(db, doc.ref, { now, sender });
    if (result.outcome === 'skipped') continue;
    if (result.outcome === 'reauth_required') { counts.stoppedForReauth = true; break; }
    if (result.outcome === 'failed') counts.failed++;
    else counts.sent++;
  }
  return counts;
}
