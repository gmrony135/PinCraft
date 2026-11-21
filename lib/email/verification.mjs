// PinCraft-sent email verification. Firebase's own verification email is bypassed: the account is created
// by Firebase Auth, but the verification message is sent through PinCraft's Dream Boost Gmail grant
// (see gmail.mjs). The message is sent at once. If that attempt fails, it stays in the outbox (outbox.mjs)
// and the email tick retries it. This module has no provider or Firebase imports beyond the caller's objects.
import { randomBytes } from 'node:crypto';
import { SITE_URL } from './config.mjs';
import { deliverRef, enqueue, outboxId } from './outbox.mjs';
import { sendGmail } from './gmail.mjs';
import { loadGmailRefreshToken } from './gmail-store.mjs';
import { verifyLinkToken, verifyLinkUrl } from './verify-link.mjs';
import { esc, firebaseVerificationTemplate, firebaseVerificationText } from './templates.mjs';

export const VERIFY_SUBJECT = 'Verify your email for PinCraft';
export const RESEND_COOLDOWN_MS = 60 * 1000;
const UID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_TOKEN = 6000;

const REFUSAL_STATUS = { invalid_token: 401, already_verified: 409, cooldown: 429, no_email: 422, bad_request: 400, server_error: 500 };
export const verificationStatus = code => REFUSAL_STATUS[code] || 500;
const refusal = code => ({ ok: false, verificationSent: false, verificationErrorCode: code });

const millis = value => (value?.toDate ? value.toDate().getTime() : Date.parse(value) || 0);

// One resend slot per user, held in Firestore and claimed in a transaction. A request inside the cooldown
// is refused and nothing is queued. The slot is taken before the mail is queued, so a failed enqueue
// still counts against the cooldown. That is the safe direction.
async function claimResendSlot(db, uid, now) {
  const ref = db.collection('verification_resends').doc(uid);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const last = snap.exists ? millis(snap.data()?.lastSentAt) : 0;
    if (last && now - last < RESEND_COOLDOWN_MS) {
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((last + RESEND_COOLDOWN_MS - now) / 1000)) };
    }
    tx.set(ref, { lastSentAt: new Date(now) });
    return { ok: true };
  });
}

// The sender used for the immediate attempt. Without a connected Gmail grant, returns null and the row waits.
async function gmailSender(db, auth, secret) {
  const refreshToken = await loadGmailRefreshToken(db);
  if (!refreshToken) return null;
  return async row => {
    const { html, text } = await messageForSend(row, { auth, secret });
    return sendGmail({ refreshToken, to: row.to, subject: row.subject, html, text });
  };
}

// Called by POST /api/auth/send-verification. The recipient is always the email on the verified token's user
// record. The request body never supplies an address, uid, or link. The stored html keeps %LINK% placeholders.
export async function requestVerification({ idToken, auth, db, now = Date.now(), secret = process.env.AUTH_SESSION_SECRET, sender } = {}) {
  try {
    if (typeof idToken !== 'string' || !idToken || idToken.length > MAX_TOKEN) return refusal('invalid_token');
    let decoded;
    try { decoded = await auth.verifyIdToken(idToken, true); } catch { return refusal('invalid_token'); }
    const uid = decoded?.uid;
    if (typeof uid !== 'string' || !UID.test(uid)) return refusal('invalid_token');
    const user = await auth.getUser(uid);
    if (!user?.email || typeof user.email !== 'string') return refusal('no_email');
    // Once verified, no activation mail is ever sent to this address again.
    if (user.emailVerified === true) return refusal('already_verified');
    const slot = await claimResendSlot(db, uid, now);
    if (!slot.ok) return { ok: false, verificationSent: false, verificationErrorCode: 'cooldown', retryAfterSeconds: slot.retryAfterSeconds };
    const key = `verify:${uid}:${now}-${randomBytes(4).toString('hex')}`;
    const outcome = await enqueue(db, {
      key, to: user.email, uid, template: 'verify',
      subject: VERIFY_SUBJECT, html: firebaseVerificationTemplate(), now,
    });
    if (outcome !== 'queued') return refusal('server_error');

    // Send now. If the attempt fails, the row stays queued and the email tick retries it.
    let sentNow = false;
    try {
      const send = sender ?? await gmailSender(db, auth, secret);
      if (send) {
        const ref = db.collection('email_outbox').doc(outboxId(key));
        sentNow = (await deliverRef(db, ref, { now, sender: send })).outcome === 'sent';
      }
    } catch {
      sentNow = false;
    }
    return { ok: true, verificationSent: true, sentNow };
  } catch {
    return refusal('server_error');
  }
}

// Runs at SEND time, not enqueue time. Firebase action links expire after one hour, but outbox rows live for 48 hours.
// Every %LINK% is replaced with a freshly generated link whose continue URL carries a token for this user.
// If generation fails, this throws, so the row is never sent with a placeholder and the tick's retry applies.
async function freshVerificationLink(auth, { email, uid, secret, now = Date.now() }) {
  const token = verifyLinkToken({ uid, now, secret });
  const link = await auth.generateEmailVerificationLink(email, { url: verifyLinkUrl(SITE_URL, token), handleCodeInApp: false });
  if (typeof link !== 'string' || !link.startsWith('https://')) throw new Error('verification_link_unavailable');
  return link;
}

// The message the tick or the immediate send uses for one outbox row. Verify rows get ONE fresh link used in both parts.
// The plain-text part is raw text, so the link is not HTML-escaped there.
export async function messageForSend(row, { auth, secret = process.env.AUTH_SESSION_SECRET, now = Date.now() } = {}) {
  if (row.template !== 'verify') return { html: row.html };
  const link = await freshVerificationLink(auth, { email: row.to, uid: row.uid, secret, now });
  return {
    html: firebaseVerificationTemplate().split('%LINK%').join(esc(link)),
    text: firebaseVerificationText().split('%LINK%').join(link),
  };
}

// The html the tick sends for one outbox row. Verify rows get a fresh link; every other template is sent unchanged.
export async function htmlForSend(row, opts) {
  return (await messageForSend(row, opts)).html;
}
