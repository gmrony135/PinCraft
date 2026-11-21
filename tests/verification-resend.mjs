// Verification mail delivery (owner order): immediate send, 60-second resend cooldown, already_verified,
// and the verify link that signs the browser in. Offline: fake Firestore, fake Firebase Auth, fake Gmail sender.
// Run: node --conditions=react-server tests/verification-resend.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SITE_URL } from '../lib/email/config.mjs';
import { requestVerification, messageForSend, verificationStatus, RESEND_COOLDOWN_MS, VERIFY_SUBJECT } from '../lib/email/verification.mjs';
import { completeVerifyLink, verifyLinkToken, verifyLinkUrl, VERIFY_LINK_TTL_MS } from '../lib/email/verify-link.mjs';
import { sendPending } from '../lib/email/outbox.mjs';

const SECRET = 'verification-test-secret-0123456789abcdef';
const OTHER_SECRET = 'a-different-secret-value-0123456789abcdef';
const NOW = Date.parse('2026-11-21T10:00:00Z');
const LINK = 'https://pincraftly.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=code-1&apiKey=FAKE&lang=en';

let passed = 0;
const tests = [];
const check = (name, fn) => tests.push([name, fn]);

// Firestore stand-in: enough for create/get/set/update, runTransaction, and the outbox queries used here.
function fakeDb() {
  const store = new Map();
  const ref = (col, id) => {
    const key = `${col}/${id}`;
    return {
      id, key, col,
      get: async () => ({ exists: store.has(key), data: () => store.get(key) }),
      create: async data => { if (store.has(key)) { const e = new Error('exists'); e.code = 6; throw e; } store.set(key, { ...data }); },
      set: async data => { store.set(key, { ...data }); },
      update: async patch => { Object.assign(store.get(key), patch); },
    };
  };
  return {
    store,
    rows: () => [...store.entries()].filter(([k]) => k.startsWith('email_outbox/')).map(([, v]) => v),
    collection: col => ({
      doc: id => ref(col, id),
      where: () => ({ limit: () => ({ get: async () => ({ docs: [...store.entries()].filter(([k, v]) => k.startsWith(`${col}/`) && v.status === 'queued').map(([k, v]) => ({ data: () => v, ref: ref(col, k.slice(col.length + 1)) })) }) }) }),
    }),
    runTransaction: async fn => fn({
      get: r => r.get(),
      set: (r, data) => { store.set(r.key, { ...data }); },
      update: (r, patch) => { Object.assign(store.get(r.key), patch); },
    }),
  };
}

function fakeAuth({ users = {}, tokens = {} } = {}) {
  const calls = { links: [] };
  return {
    calls,
    verifyIdToken: async token => { if (!tokens[token]) throw new Error('bad token'); return { uid: tokens[token] }; },
    getUser: async uid => { if (!users[uid]) throw new Error('not found'); return users[uid]; },
    generateEmailVerificationLink: async (email, settings) => { calls.links.push({ email, settings }); return LINK; },
  };
}

const unverified = { uid: 'uid_new', email: 'new@example.com', emailVerified: false, displayName: 'Ayesha' };
const verified = { uid: 'uid_ok', email: 'ok@example.com', emailVerified: true, displayName: 'Rafi' };
const users = { uid_new: unverified, uid_ok: verified };
const tokens = { T_NEW: 'uid_new', T_OK: 'uid_ok' };

// The fake sender records what it was asked to send and returns a provider id, like sendGmail does.
function recordingSender(sent) {
  return async row => { sent.push(row); return `gmail-${sent.length}`; };
}

check('signup/resend: the mail is sent at once through the sender, not left for the tick', async () => {
  const db = fakeDb(); const auth = fakeAuth({ users, tokens }); const sent = [];
  const out = await requestVerification({ idToken: 'T_NEW', auth, db, now: NOW, secret: SECRET, sender: recordingSender(sent) });
  assert.deepEqual(out, { ok: true, verificationSent: true, sentNow: true });
  assert.equal(sent.length, 1, 'sent synchronously in the request');
  const [row] = db.rows();
  assert.equal(row.status, 'sent', 'the outbox row is marked sent');
  assert.equal(row.providerId, 'gmail-1');
  assert.equal(sent[0].to, 'new@example.com');
  assert.equal(sent[0].subject, VERIFY_SUBJECT);
});

check('immediate send: a failed attempt keeps the row queued, and the tick sends it later', async () => {
  const db = fakeDb(); const auth = fakeAuth({ users, tokens }); const sent = [];
  const failing = async () => { const e = new Error('send_status_500'); e.code = 'send_status_500'; throw e; };
  const out = await requestVerification({ idToken: 'T_NEW', auth, db, now: NOW, secret: SECRET, sender: failing });
  assert.deepEqual(out, { ok: true, verificationSent: true, sentNow: false }, 'queued for the retry, not reported as sent now');
  const [row] = db.rows();
  assert.equal(row.status, 'queued');
  assert.equal(row.attempts, 1);
  assert.equal(row.lastError, 'send_status_500');
  // The tick later, with a working sender, delivers the same message exactly once.
  const tick = await sendPending(db, { now: NOW + 5 * 60000, sender: recordingSender(sent) });
  assert.equal(tick.sent, 1);
  assert.equal(db.rows()[0].status, 'sent');
});

check('no Gmail grant: nothing is sent now and the row waits for the tick (never reported as sent)', async () => {
  const db = fakeDb(); const auth = fakeAuth({ users, tokens });
  const out = await requestVerification({ idToken: 'T_NEW', auth, db, now: NOW, secret: SECRET });
  assert.deepEqual(out, { ok: true, verificationSent: true, sentNow: false });
  assert.equal(db.rows()[0].status, 'queued');
});

check('resend inside the 60-second cooldown is refused politely: 429, nothing queued, nothing sent', async () => {
  const db = fakeDb(); const auth = fakeAuth({ users, tokens }); const sent = [];
  const sender = recordingSender(sent);
  await requestVerification({ idToken: 'T_NEW', auth, db, now: NOW, secret: SECRET, sender });
  const out = await requestVerification({ idToken: 'T_NEW', auth, db, now: NOW + 20000, secret: SECRET, sender });
  assert.deepEqual(out, { ok: false, verificationSent: false, verificationErrorCode: 'cooldown', retryAfterSeconds: 40 });
  assert.equal(verificationStatus('cooldown'), 429);
  assert.equal(db.rows().length, 1, 'no second row');
  assert.equal(sent.length, 1, 'no second send');
  assert.equal(auth.calls.links.length, 0, 'the refused call builds no link (links are built only at send time)');
});

check('resend after the cooldown works: a fresh mail with a fresh link is sent at once', async () => {
  const db = fakeDb(); const auth = fakeAuth({ users, tokens }); const sent = [];
  const sender = async row => { const built = await messageForSend(row, { auth, secret: SECRET, now: NOW + RESEND_COOLDOWN_MS + 1000 }); sent.push(built); return 'ok'; };
  await requestVerification({ idToken: 'T_NEW', auth, db, now: NOW, secret: SECRET, sender: recordingSender([]) });
  const out = await requestVerification({ idToken: 'T_NEW', auth, db, now: NOW + RESEND_COOLDOWN_MS + 1000, secret: SECRET, sender });
  assert.deepEqual(out, { ok: true, verificationSent: true, sentNow: true });
  assert.equal(db.rows().length, 2, 'a new row with its own key');
  assert.equal(sent.length, 1);
  assert.ok(sent[0].text.includes(LINK), 'the mail carries a freshly generated link');
  assert.ok(!sent[0].html.includes('%LINK%'), 'no placeholder reaches the mail');
});

check('already verified: 409, nothing queued or sent, and no link generated', async () => {
  const db = fakeDb(); const auth = fakeAuth({ users, tokens: { T_OK: 'uid_ok' } }); const sent = [];
  const out = await requestVerification({ idToken: 'T_OK', auth, db, now: NOW, secret: SECRET, sender: recordingSender(sent) });
  assert.deepEqual(out, { ok: false, verificationSent: false, verificationErrorCode: 'already_verified' });
  assert.equal(verificationStatus(out.verificationErrorCode), 409);
  assert.equal(db.rows().length, 0);
  assert.equal(sent.length, 0);
  assert.equal(auth.calls.links.length, 0);
});

check('the continue link is the PinCraft route, bound to this user, and only this secret verifies it', async () => {
  const auth = fakeAuth({ users, tokens });
  const row = { template: 'verify', to: 'ok@example.com', uid: 'uid_ok', html: '<a href="%LINK%">x</a>' };
  await messageForSend(row, { auth, secret: SECRET, now: NOW });
  const { url } = auth.calls.links[0].settings;
  assert.ok(url.startsWith(`${SITE_URL}/api/auth/verify-link?t=`), 'continue URL points to the verify-link route');
  const token = decodeURIComponent(url.split('?t=')[1]);
  assert.match(token, /^uid_ok\.\d{10}\./);
  const decision = await completeVerifyLink({ token, secret: SECRET, auth, now: NOW });
  assert.equal(decision.action, 'session');
  assert.equal(decision.uid, 'uid_ok');
  await assert.rejects(messageForSend(row, { auth, secret: 'short' }), /verify_link_unconfigured/, 'no link without a real secret');
  assert.equal((await completeVerifyLink({ token, secret: OTHER_SECRET, auth, now: NOW })).reason, 'invalid_link');
  const swapped = token.replace(/^uid_ok/, 'uid_new');
  assert.equal((await completeVerifyLink({ token: swapped, secret: SECRET, auth, now: NOW })).reason, 'invalid_link', 'a token cannot be moved to another user');
});

check('verify link logs the user in when the email is verified and no other session is present', async () => {
  const auth = fakeAuth({ users, tokens });
  const token = verifyLinkToken({ uid: 'uid_ok', now: NOW, secret: SECRET });
  const decision = await completeVerifyLink({ token, secret: SECRET, auth, now: NOW + 60000 });
  assert.deepEqual(decision, { action: 'session', uid: 'uid_ok', name: 'Rafi' });
  // The same browser already signed in as this user: the link still resolves to a session for them.
  assert.equal((await completeVerifyLink({ token, secret: SECRET, auth, now: NOW, existingUid: 'uid_ok' })).action, 'session');
});

check('verify link never switches an existing session to another account', async () => {
  const auth = fakeAuth({ users, tokens });
  const token = verifyLinkToken({ uid: 'uid_ok', now: NOW, secret: SECRET });
  const decision = await completeVerifyLink({ token, secret: SECRET, auth, now: NOW, existingUid: 'uid_someone_else' });
  assert.deepEqual(decision, { action: 'login', reason: 'other_session' });
});

check('verify link: an expired token for a verified email lands on /login with the verified notice, not a session', async () => {
  const auth = fakeAuth({ users, tokens });
  const token = verifyLinkToken({ uid: 'uid_ok', now: NOW, secret: SECRET });
  const late = NOW + VERIFY_LINK_TTL_MS + 5000;
  assert.deepEqual(await completeVerifyLink({ token, secret: SECRET, auth, now: late }), { action: 'login', reason: 'expired' });
});

check('verify link: an unverified account gets no session, and a bad token is refused', async () => {
  const auth = fakeAuth({ users, tokens });
  const token = verifyLinkToken({ uid: 'uid_new', now: NOW, secret: SECRET });
  assert.deepEqual(await completeVerifyLink({ token, secret: SECRET, auth, now: NOW }), { action: 'login', reason: 'not_verified' });
  assert.deepEqual(await completeVerifyLink({ token: 'nope', secret: SECRET, auth, now: NOW }), { action: 'login', reason: 'invalid_link' });
  assert.deepEqual(await completeVerifyLink({ token: `ghost.${Math.floor(NOW / 1000) + 3600}.${'x'.repeat(43)}`, secret: SECRET, auth, now: NOW }), { action: 'login', reason: 'invalid_link' });
});

check('the verify-link route and the send route are wired as intended (source checks)', () => {
  const route = readFileSync(new URL('../app/api/auth/verify-link/route.js', import.meta.url), 'utf8');
  assert.match(route, /completeVerifyLink/);
  assert.match(route, /SESSION_COOKIE, sessionToken|response\.cookies\.set\(SESSION_COOKIE/);
  assert.match(route, /Referrer-Policy': 'no-referrer'/, 'the token in the URL is not leaked by Referer');
  assert.match(route, /enqueueWelcome/);
  const send = readFileSync(new URL('../app/api/auth/send-verification/route.js', import.meta.url), 'utf8');
  assert.match(send, /requestVerification\(\{ idToken, auth: firebaseAuth\(\), db: getDatabase\(\) \}\)/);
  const form = readFileSync(new URL('../components/auth/AccountForm.js', import.meta.url), 'utf8');
  assert.match(form, /Your email is verified — please sign in\./);
  assert.match(form, /Check your Spam or Promotions folder/);
});

for (const [name, fn] of tests) { await fn(); passed++; console.log(`ok - ${name}`); }
console.log(`\n${passed} verification-resend checks passed`);
