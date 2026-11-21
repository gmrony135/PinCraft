// PinCraft-sent email verification. Firebase's own verification email is bypassed: the account is created
// by Firebase Auth, but the verification message is queued in PinCraft's outbox and sent through the Dream Boost
// Gmail grant (see outbox.mjs and gmail.mjs). This module has no provider or Firebase imports, so the caller
// passes in the Admin SDK auth object and the Firestore database. That keeps it testable without credentials.
import { SITE_URL } from './config.mjs';
import { enqueue } from './outbox.mjs';
import { esc, firebaseVerificationTemplate, firebaseVerificationText } from './templates.mjs';

export const VERIFY_SUBJECT = 'Verify your email for PinCraft';
export const VERIFY_CONTINUE_URL = `${SITE_URL}/login`;
const UID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_TOKEN = 6000;

const REFUSAL_STATUS = { invalid_token: 401, already_verified: 409, no_email: 422, bad_request: 400, server_error: 500 };
export const verificationStatus = code => REFUSAL_STATUS[code] || 500;
const refusal = code => ({ ok: false, verificationSent: false, verificationErrorCode: code });

// Dhaka day and hour. One fresh verification email per user per hour; a resend inside the same hour is a duplicate.
export function dhakaHourKey(now = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(now)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}:${parts.hour}`;
}

// Called by POST /api/auth/send-verification. The recipient is always the email on the verified token's user
// record. The request body never supplies an address, uid, or link. The stored html keeps %LINK% placeholders.
export async function requestVerification({ idToken, auth, db, now = Date.now() }) {
  try {
    if (typeof idToken !== 'string' || !idToken || idToken.length > MAX_TOKEN) return refusal('invalid_token');
    let decoded;
    try { decoded = await auth.verifyIdToken(idToken, true); } catch { return refusal('invalid_token'); }
    const uid = decoded?.uid;
    if (typeof uid !== 'string' || !UID.test(uid)) return refusal('invalid_token');
    const user = await auth.getUser(uid);
    if (!user?.email || typeof user.email !== 'string') return refusal('no_email');
    if (user.emailVerified === true) return refusal('already_verified');
    const outcome = await enqueue(db, {
      key: `verify:${uid}:${dhakaHourKey(now)}`,
      to: user.email, uid, template: 'verify',
      subject: VERIFY_SUBJECT, html: firebaseVerificationTemplate(), now,
    });
    if (outcome === 'duplicate') return { ok: true, verificationSent: false, alreadySent: true };
    return { ok: true, verificationSent: true };
  } catch {
    return refusal('server_error');
  }
}

// Runs at SEND time, not enqueue time. Firebase action links expire after one hour, but outbox rows live for 48 hours.
// Every %LINK% is replaced with a freshly generated link. If generation fails, this throws, so the row is never sent
// with a placeholder and sendPending's normal retry applies.
async function freshVerificationLink(auth, email) {
  const link = await auth.generateEmailVerificationLink(email, { url: VERIFY_CONTINUE_URL, handleCodeInApp: false });
  if (typeof link !== 'string' || !link.startsWith('https://')) throw new Error('verification_link_unavailable');
  return link;
}

export async function verificationHtml(auth, email) {
  const link = await freshVerificationLink(auth, email);
  return firebaseVerificationTemplate().split('%LINK%').join(esc(link));
}

// The message the tick sends for one outbox row. Verify rows get ONE fresh link used in both parts.
// The plain-text part is raw text, so the link is not HTML-escaped there.
export async function messageForSend(row, { auth }) {
  if (row.template !== 'verify') return { html: row.html };
  const link = await freshVerificationLink(auth, row.to);
  return {
    html: firebaseVerificationTemplate().split('%LINK%').join(esc(link)),
    text: firebaseVerificationText().split('%LINK%').join(link),
  };
}

// The html the tick sends for one outbox row. Verify rows get a fresh link; every other template is sent unchanged.
export async function htmlForSend(row, { auth }) {
  return (await messageForSend(row, { auth })).html;
}
