import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { LOGO_URL, SITE_URL } from '../lib/email/config.mjs';
import { unsubscribeToken, verifyUnsubscribeToken, unsubscribeUrl } from '../lib/email/token.mjs';
import { welcomeEmail, weeklyEmail, reengageEmail, firebaseVerificationTemplate, adminNewUserEmail, adminPaymentEmail } from '../lib/email/templates.mjs';
import { decideReengage, isWeeklyWindow, weekKey, summarizeWeek } from '../lib/email/planner.mjs';
import { enqueue, outboxId, sendPending } from '../lib/email/outbox.mjs';
import { buildRawMessage, consentUrl, newState, sendGmail, stateMatches, stateTag, verifyGrant } from '../lib/email/gmail.mjs';
import { saveGmailGrant, loadGmailRefreshToken } from '../lib/email/gmail-store.mjs';
import { SENDER_EMAIL } from '../lib/email/config.mjs';
import { requestVerification, htmlForSend, dhakaHourKey, VERIFY_SUBJECT } from '../lib/email/verification.mjs';

const tests = [];
const check = (name, fn) => tests.push([name, fn]);
const DAY = 86400000;
const SECRET = 'test-secret-value-1234567890';

check('unsubscribe token verifies only for its uid and kind', () => {
  const t = unsubscribeToken('uid_abc', 'weekly', SECRET);
  assert.equal(verifyUnsubscribeToken('uid_abc', 'weekly', t, SECRET), true);
  assert.equal(verifyUnsubscribeToken('uid_other', 'weekly', t, SECRET), false);
  assert.equal(verifyUnsubscribeToken('uid_abc', 'reengage', t, SECRET), false);
  assert.equal(verifyUnsubscribeToken('uid_abc', 'weekly', t, 'wrong-secret-value-000000'), false);
  assert.equal(verifyUnsubscribeToken('uid_abc', 'weekly', 'forged', SECRET), false);
  assert.equal(verifyUnsubscribeToken('uid_abc', 'weekly', t, ''), false, 'no secret configured must fail closed');
});

check('unsubscribe URL points at the site and carries the token', () => {
  const url = unsubscribeUrl('uid_abc', 'all', SECRET);
  assert.ok(url.startsWith(`${SITE_URL}/api/email/unsubscribe?`));
  const params = new URL(url).searchParams;
  assert.equal(params.get('u'), 'uid_abc');
  assert.equal(params.get('k'), 'all');
  assert.equal(verifyUnsubscribeToken('uid_abc', 'all', params.get('t'), SECRET), true);
});

check('welcome email: English, real logo, free-limit numbers, dashboard button', () => {
  const { subject, html } = welcomeEmail({ name: 'Rahim' });
  assert.match(subject, /Welcome/);
  assert.ok(html.includes(LOGO_URL), 'logo URL');
  assert.ok(html.includes('alt="PinCraft"'), 'logo alt text');
  assert.ok(html.includes('Pin Queue'), 'welcome mentions Pin Queue');
  assert.ok(html.includes('20 pin idea packs'));
  assert.ok(html.includes('150 text requests'));
  assert.ok(html.includes('20 image requests'));
  assert.ok(html.includes('midnight Bangladesh time'));
  assert.ok(html.includes(`${SITE_URL}/dashboard`));
  assert.ok(html.includes('name="viewport"'), 'mobile viewport');
});

check('user-supplied names are escaped in every template', () => {
  const evil = '<img src=x onerror=alert(1)>';
  for (const { html } of [welcomeEmail({ name: evil }), reengageEmail({ name: evil, weeklyUrl: 'https://x', allUrl: 'https://y' })]) {
    assert.ok(!html.includes('<img src=x'), 'raw tag must not appear');
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  }
});

check('weekly email shows real numbers and both unsubscribe links', () => {
  const { html, subject } = weeklyEmail({
    name: 'Ayesha', stats: { pinPacks: 3, text: 12, image: 4, pinsPosted: 2 },
    today: { pinPacks: 1, text: 5, image: 0 }, weeklyUrl: 'https://u/weekly', allUrl: 'https://u/all',
  });
  assert.match(subject, /weekly summary/);
  assert.ok(html.includes('https://u/weekly') && html.includes('https://u/all'));
  assert.ok(html.includes('Pin packs: 1 / 20'));
  assert.ok(html.includes('Text: 5 / 150'));
});

check('re-engagement email: English copy about the 24-hour absence, unsubscribe links', () => {
  const { html } = reengageEmail({ name: 'Karim', weeklyUrl: 'https://u/w', allUrl: 'https://u/a' });
  assert.ok(html.includes("You haven't visited PinCraft in the last 24 hours"));
  assert.ok(html.includes('https://u/w') && html.includes('https://u/a'));
});

check('Firebase verification template keeps the %LINK% placeholder and the real logo', () => {
  const html = firebaseVerificationTemplate();
  assert.ok(html.includes('href="%LINK%"'));
  assert.ok(html.includes(LOGO_URL));
  assert.ok(html.includes('Verify email'));
  assert.ok(!html.includes('[object'), 'no broken interpolation');
});

check('admin notifications contain the required fields and escape values', () => {
  const user = adminNewUserEmail({ email: 'new@example.com', name: '<b>x</b>', registeredAt: '20 Nov 2026, 10:00 am' });
  assert.match(user.subject, /New user registered: new@example\.com/);
  assert.ok(user.html.includes('new@example.com') && user.html.includes('&lt;b&gt;x&lt;/b&gt;'));
  const pay = adminPaymentEmail({ amount: 99, method: 'bkash', transactionLast4: '7K2Q', payerLast3: '265', email: 'a@b.co', submittedAt: 'now' });
  assert.match(pay.subject, /৳99 via bkash/);
  for (const v of ['BDT 99', 'bkash', '7K2Q', '265', 'a@b.co']) assert.ok(pay.html.includes(v), v);
});

check('re-engagement: 24h lapse, 7-day cap, one per 24h, unsubscribe respected', () => {
  const now = Date.parse('2026-11-21T06:00:00Z');
  const base = { now, lastReengageMs: null, unsubscribed: false };
  assert.equal(decideReengage({ ...base, lastVisitMs: now - 2 * 3600000 }).send, false);
  assert.equal(decideReengage({ ...base, lastVisitMs: now - 25 * 3600000 }).send, true);
  assert.equal(decideReengage({ ...base, lastVisitMs: now - 8 * DAY }).send, false);
  assert.equal(decideReengage({ ...base, lastVisitMs: now - 30 * 3600000, lastReengageMs: now - 3 * 3600000 }).send, false);
  assert.equal(decideReengage({ ...base, lastVisitMs: now - 30 * 3600000, unsubscribed: true }).send, false);
  assert.equal(decideReengage({ ...base, lastVisitMs: NaN }).send, false, 'no activity record is not eligible');
});

check('re-engagement never uses a sign-in time in place of a recorded visit (source check)', () => {
  const src = readFileSync(new URL('../lib/email/planner.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes('const visit = millis(activity.lastVisitAt);'));
  assert.ok(!/const visit = .*lastSignInTime/.test(src));
});

check('weekly window is Saturday from 10:00 Dhaka time', () => {
  assert.equal(isWeeklyWindow(Date.parse('2026-11-21T04:00:00Z')), true, 'Saturday 10:00 BD');
  assert.equal(isWeeklyWindow(Date.parse('2026-11-21T03:59:00Z')), false, 'Saturday 09:59 BD');
  assert.equal(isWeeklyWindow(Date.parse('2026-11-20T10:00:00Z')), false, 'Friday');
});

check('week key is the Saturday that starts the week (Dhaka date)', () => {
  assert.equal(weekKey(Date.parse('2026-11-21T04:00:00Z')), '2026-11-21');
  assert.equal(weekKey(Date.parse('2026-11-25T08:00:00Z')), '2026-11-21', 'Wednesday');
});

check('weekly summary sums only the last 7 Dhaka days and counts posted pins in the window', () => {
  const now = Date.parse('2026-11-25T08:00:00Z');
  const usageDays = [
    { id: '2026-11-25', pin_packs: 2, text: 5, image: 1 },
    { id: '2026-11-19', pin_packs: 1, text: 3, image: 0 },
    { id: '2026-11-01', pin_packs: 9, text: 9, image: 9 },
  ];
  const r = summarizeWeek({ usageDays, postedAtMs: [now - DAY, now - 9 * DAY], now });
  assert.deepEqual(r.stats, { pinPacks: 3, text: 8, image: 1, pinsPosted: 1 });
  assert.deepEqual(r.today, { pinPacks: 2, text: 5, image: 1 });
});

check('outbox: same key twice is refused the second time (exactly once)', async () => {
  const store = new Map();
  const db = { collection: () => ({ doc: id => ({
    id, ref: null,
    create: async data => { if (store.has(id)) { const e = new Error('already exists'); e.code = 6; throw e; } store.set(id, { ...data, _id: id }); },
    get: async () => ({ exists: store.has(id), data: () => store.get(id) }),
    update: async patch => Object.assign(store.get(id), patch),
  }), where: () => ({ limit: () => ({ get: async () => ({ docs: [...store.values()].filter(r => r.status === 'queued').map(r => ({ data: () => r, ref: { update: async p => Object.assign(store.get(r._id), p) } })) }) }) }) }) };
  assert.equal(outboxId('welcome:u1').length, 64);
  const item = { key: 'welcome:u1', to: 'a@example.com', uid: 'u1', template: 'welcome', subject: 's', html: '<p>x</p>' };
  assert.equal(await enqueue(db, item), 'queued');
  assert.equal(await enqueue(db, item), 'duplicate');
  assert.equal([...store.values()].length, 1);
  await assert.rejects(() => enqueue(db, { ...item, key: 'bad/key' }), /invalid email key/);
});

check('outbox: without a sender nothing is sent; expired messages are never sent late', async () => {
  const rows = [
    { key: 'welcome:a', to: 'a@example.com', status: 'queued', attempts: 0, expiresAt: new Date(Date.now() + DAY) },
    { key: 'welcome:b', to: 'b@example.com', status: 'queued', attempts: 0, expiresAt: new Date(Date.now() - 1000) },
  ];
  const updates = [];
  const db = { collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: rows.map(r => ({ data: () => r, ref: { update: async p => updates.push([r.key, p]) } })) }) }) }) }) };
  let sent = 0;
  const none = await sendPending(db, { now: Date.now(), sender: null });
  assert.equal(sent, 0);
  assert.equal(none.waiting, 1);
  assert.equal(none.expired, 1);
  assert.equal(none.provider, 'not_configured');
  assert.equal(updates.find(([k]) => k === 'welcome:b')[1].status, 'expired');
});

function outboxDb(rows, updates) {
  return {
    collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: rows.map(r => ({ data: () => r, ref: {
      update: async p => { updates.push([r.key, p]); Object.assign(r, p); },
    } })) }) }) }) }),
    runTransaction: async fn => fn({
      get: async ref => ({ exists: true, data: () => rows.find(r => r.key === ref.key) || rows[0] }),
      update: (ref, p) => { updates.push([ref.key || 'claim', p]); },
    }),
  };
}

check('outbox: with a sender, claims, sends once and marks sent', async () => {
  const row = { key: 'welcome:c', to: 'c@example.com', subject: 'S', html: '<p>h</p>', status: 'queued', attempts: 0, expiresAt: new Date(Date.now() + DAY) };
  const updates = [];
  const db = outboxDb([row], updates);
  const seen = [];
  const out = await sendPending(db, { now: Date.now(), sender: async r => { seen.push(r.to); return 'gm_1'; } });
  assert.equal(out.sent, 1);
  assert.deepEqual(seen, ['c@example.com']);
  assert.equal(updates.some(([, p]) => p.status === 'sending'), true, 'claimed before sending');
  assert.equal(updates.at(-1)[1].status, 'sent');
  assert.equal(updates.at(-1)[1].providerId, 'gm_1');
});

check('outbox: a provider failure is retried, then marked failed after three attempts', async () => {
  const row = { key: 'welcome:d', to: 'd@example.com', subject: 'S', html: '<p>h</p>', status: 'queued', attempts: 2, expiresAt: new Date(Date.now() + DAY) };
  const updates = [];
  const out = await sendPending(outboxDb([row], updates), { now: Date.now(), sender: async () => { const e = new Error('x'); e.code = 'send_status_500'; throw e; } });
  assert.equal(out.failed, 1);
  assert.equal(updates.at(-1)[1].status, 'failed');
  assert.equal(updates.at(-1)[1].lastError, 'send_status_500');
});

check('outbox: a revoked grant stops the run and leaves messages queued', async () => {
  const rows = [
    { key: 'welcome:e', to: 'e@example.com', subject: 'S', html: 'h', status: 'queued', attempts: 0, expiresAt: new Date(Date.now() + DAY) },
    { key: 'welcome:f', to: 'f@example.com', subject: 'S', html: 'h', status: 'queued', attempts: 0, expiresAt: new Date(Date.now() + DAY) },
  ];
  const updates = [];
  let calls = 0;
  const out = await sendPending(outboxDb(rows, updates), { now: Date.now(), sender: async () => { calls++; const e = new Error('r'); e.code = 'reauth_required'; throw e; } });
  assert.equal(calls, 1, 'stops after the first reauth error');
  assert.equal(out.stoppedForReauth, true);
  assert.equal(updates.at(-1)[1].status, 'queued');
});

check('gmail: message is From PinCraft <dream.boost154@gmail.com>, never the owner address', () => {
  const raw = buildRawMessage({ to: 'user@example.com', subject: 'স্বাগতম', html: '<p>হ্যালো</p>' });
  const text = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(text, /^From: PinCraft <dream\.boost154@gmail\.com>\r\n/);
  assert.match(text, /^To: user@example\.com\r\n/m);
  assert.ok(!text.includes('gmrony135'), 'owner address must not appear');
  assert.match(text, /^Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\n/m);
  assert.match(text, /Content-Type: text\/html; charset=UTF-8/);
  const body = text.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n/g, '');
  assert.equal(Buffer.from(body, 'base64').toString('utf8'), '<p>হ্যালো</p>');
});

check('gmail: header injection and bad recipients are refused', () => {
  assert.throws(() => buildRawMessage({ to: 'a@example.com\r\nBcc: x@example.com', subject: 's', html: 'h' }), /header_injection/);
  assert.throws(() => buildRawMessage({ to: 'a@example.com', subject: 'bad\r\nBcc: x@example.com', html: 'h' }), /header_injection/);
  assert.throws(() => buildRawMessage({ to: 'not-an-address', subject: 's', html: 'h' }), /invalid_recipient/);
});

check('gmail: send uses a refreshed access token and the Gmail send endpoint', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.startsWith('https://oauth2.googleapis.com/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'AT-test', expires_in: 3600 }) };
    return { ok: true, status: 200, json: async () => ({ id: 'msg_1' }) };
  };
  const env = { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csec' };
  const id = await sendGmail({ refreshToken: 'RT-unique-1', to: 'a@example.com', subject: 'S', html: 'h', fetchImpl, env, now: 1000 });
  assert.equal(id, 'msg_1');
  assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
  assert.match(calls[0].init.body.toString(), /grant_type=refresh_token/);
  assert.equal(calls[1].url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  assert.equal(calls[1].init.headers.authorization, 'Bearer AT-test');
  assert.ok(JSON.parse(calls[1].init.body).raw);
});

check('gmail: a 401 or revoked grant asks for reconnection; errors never echo provider text', async () => {
  const env = { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csec' };
  const revoked = async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant', error_description: 'secret detail' }) });
  await assert.rejects(sendGmail({ refreshToken: 'RT-revoked-2', to: 'a@example.com', subject: 's', html: 'h', fetchImpl: revoked, env, now: 5 }), e => e.code === 'reauth_required');
  const down = async (url) => url.startsWith('https://oauth2') ? { ok: true, status: 200, json: async () => ({ access_token: 'AT2', expires_in: 3600 }) } : { ok: false, status: 500, json: async () => ({ error: 'internal secret body' }) };
  await assert.rejects(sendGmail({ refreshToken: 'RT-down-3', to: 'a@example.com', subject: 's', html: 'h', fetchImpl: down, env, now: 6 }), e => e.code === 'send_status_500' && !String(e.message).includes('secret'));
});

check('gmail: consent URL asks only for gmail.send and the Dream Boost login hint', () => {
  const url = new URL(consentUrl({ state: 'st1', env: { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'x' } }));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('login_hint'), 'dream.boost154@gmail.com');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.get('redirect_uri'), `${SITE_URL}/api/internal/gmail/callback`);
  assert.ok(url.searchParams.get('scope').split(' ').includes('https://www.googleapis.com/auth/gmail.send'));
  assert.ok(!url.searchParams.get('scope').includes('gmail.readonly'));
});

const claims = (over = {}) => Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: 'cid', exp: Math.floor(Date.now() / 1000) + 600, email: 'dream.boost154@gmail.com', email_verified: true, ...over })).toString('base64url');
const tokensWith = (over = {}, claimOver = {}) => ({ refresh_token: 'RT', scope: 'https://www.googleapis.com/auth/gmail.send openid email', id_token: `h.${claims(claimOver)}.s`, ...over });

check('grant check: only the verified Dream Boost account with gmail.send is accepted', () => {
  const env = { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'x' };
  assert.equal(verifyGrant(tokensWith(), { env }).ok, true);
  assert.equal(verifyGrant(tokensWith({}, { email: 'gmrony135@gmail.com' }), { env }).reason, 'wrong_account', 'owner account refused');
  assert.equal(verifyGrant(tokensWith({}, { email_verified: false }), { env }).reason, 'wrong_account');
  assert.equal(verifyGrant(tokensWith({ scope: 'openid email' }), { env }).reason, 'scope_missing');
  assert.equal(verifyGrant(tokensWith({ refresh_token: undefined }), { env }).reason, 'no_refresh_token');
  assert.equal(verifyGrant(tokensWith({}, { aud: 'other-client' }), { env }).reason, 'bad_audience');
  assert.equal(verifyGrant(tokensWith({}, { iss: 'https://evil.example' }), { env }).reason, 'bad_issuer');
  assert.equal(verifyGrant(tokensWith({}, { exp: 1 }), { env }).reason, 'expired');
});

check('state: the callback must present the cookie issued to the same browser', () => {
  const state = newState();
  const cookie = stateTag(state, SECRET);
  assert.equal(stateMatches(state, cookie, SECRET), true);
  assert.equal(stateMatches('another-state', cookie, SECRET), false);
  assert.equal(stateMatches(state, cookie, 'other-secret-value-0000000000'), false);
  assert.equal(stateMatches(state, '', SECRET), false);
  assert.equal(stateMatches(state, cookie, ''), false, 'no secret configured must fail closed');
});

check('gmail grant: stored encrypted, only for the Dream Boost account, read back only for that account', async () => {
  process.env.AUTOMATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  const store = new Map();
  const db = { collection: () => ({ doc: id => ({
    set: async v => store.set(id, v),
    get: async () => ({ exists: store.has(id), data: () => store.get(id) }),
  }) }) };
  await assert.rejects(saveGmailGrant(db, { account: 'gmrony135@gmail.com', refreshToken: 'RT-x' }), /grant_account_mismatch/);
  await saveGmailGrant(db, { account: SENDER_EMAIL, refreshToken: 'RT-secret-value-abc' });
  const stored = store.get('gmail');
  assert.ok(!JSON.stringify(stored).includes('RT-secret-value-abc'), 'refresh token must not be stored in plain text');
  assert.equal(await loadGmailRefreshToken(db), 'RT-secret-value-abc');
  store.get('gmail').account = 'gmrony135@gmail.com';
  assert.equal(await loadGmailRefreshToken(db), null, 'a grant for another account is never used');
});

check('no Resend provider remains in the email code', () => {
  for (const file of ['lib/email/config.mjs', 'lib/email/outbox.mjs', 'lib/email/gmail.mjs', 'app/api/internal/email/tick/route.js']) {
    assert.doesNotMatch(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), /resend/i, file);
  }
});

// ---- PinCraft-sent email verification (Firebase's own verification email is bypassed) ----
function fakeAuth({ users = {}, tokens = {}, link = 'https://pincraftly.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=abc123' } = {}) {
  const calls = { links: [] };
  return {
    calls,
    verifyIdToken: async (token) => { if (!tokens[token]) throw new Error('bad token'); return { uid: tokens[token] }; },
    getUser: async (uid) => { if (!users[uid]) throw new Error('not found'); return users[uid]; },
    generateEmailVerificationLink: async (email, settings) => { calls.links.push([email, settings]); return link; },
  };
}
function fakeOutboxDb() {
  const rows = new Map();
  return {
    rows,
    collection: () => ({ doc: id => ({
      create: async data => { if (rows.has(id)) { const e = new Error('exists'); e.code = 6; throw e; } rows.set(id, data); },
    }) }),
  };
}
const verifiedUser = { uid: 'uid_v', email: 'verified@example.com', emailVerified: true };
const newUser = { uid: 'uid_n1', email: 'newuser@example.com', emailVerified: false, providerData: [{ providerId: 'password' }] };
const T_NEW = 'token-new-user', T_VER = 'token-verified', T_FORGED = 'token-forged';
const NOW = Date.parse('2026-11-20T08:30:00Z');

check('verification: an unverified password user gets one English branded row for their own address', async () => {
  const auth = fakeAuth({ users: { uid_n1: newUser }, tokens: { [T_NEW]: 'uid_n1' } });
  const db = fakeOutboxDb();
  const out = await requestVerification({ idToken: T_NEW, auth, db, now: NOW });
  assert.deepEqual(out, { ok: true, verificationSent: true });
  assert.equal(db.rows.size, 1);
  const row = [...db.rows.values()][0];
  assert.equal(row.to, 'newuser@example.com');
  assert.equal(row.subject, VERIFY_SUBJECT);
  assert.equal(row.template, 'verify');
  assert.ok(row.html.includes(LOGO_URL), 'branded logo');
  assert.ok(row.html.includes('Verify email'), 'English verify button');
  assert.equal(row.html.split('%LINK%').length - 1, 3, 'stored html keeps the placeholders');
  assert.equal(auth.calls.links.length, 0, 'no link is generated at enqueue time');
});

check('verification: an already verified user is refused and nothing is queued', async () => {
  const auth = fakeAuth({ users: { uid_v: verifiedUser }, tokens: { [T_VER]: 'uid_v' } });
  const db = fakeOutboxDb();
  const out = await requestVerification({ idToken: T_VER, auth, db, now: NOW });
  assert.deepEqual(out, { ok: false, verificationSent: false, verificationErrorCode: 'already_verified' });
  assert.equal(db.rows.size, 0);
});

check('verification: a forged or other-project token is refused and the body cannot pick a recipient', async () => {
  const auth = fakeAuth({ users: { uid_n1: newUser, uid_v: verifiedUser }, tokens: { [T_NEW]: 'uid_n1' } });
  const db = fakeOutboxDb();
  const forged = await requestVerification({ idToken: T_FORGED, auth, db, now: NOW });
  assert.deepEqual(forged, { ok: false, verificationSent: false, verificationErrorCode: 'invalid_token' });
  assert.equal(await requestVerification({ idToken: '', auth, db, now: NOW }).then(r => r.verificationErrorCode), 'invalid_token');
  // A valid token for newUser: the stored recipient is newUser's own address, never another account's.
  await requestVerification({ idToken: T_NEW, auth, db, now: NOW });
  const recipients = [...db.rows.values()].map(r => r.to);
  assert.deepEqual(recipients, ['newuser@example.com']);
  assert.ok(!recipients.includes('verified@example.com'));
});

check('verification: a resend inside the same Dhaka hour is a duplicate, and the next hour is a fresh row', async () => {
  const auth = fakeAuth({ users: { uid_n1: newUser }, tokens: { [T_NEW]: 'uid_n1' } });
  const db = fakeOutboxDb();
  assert.equal((await requestVerification({ idToken: T_NEW, auth, db, now: NOW })).verificationSent, true);
  const again = await requestVerification({ idToken: T_NEW, auth, db, now: NOW + 5 * 60000 });
  assert.deepEqual(again, { ok: true, verificationSent: false, alreadySent: true });
  assert.equal(db.rows.size, 1, 'no second row inside the hour');
  const nextHour = await requestVerification({ idToken: T_NEW, auth, db, now: NOW + 60 * 60000 });
  assert.equal(nextHour.verificationSent, true);
  assert.equal(db.rows.size, 2);
  assert.equal(dhakaHourKey(Date.parse('2026-11-20T17:59:00Z')), '2026-11-20:23', 'Dhaka hour, not UTC');
});

check('verification: the tick sender replaces every %LINK% with a freshly generated Firebase link', async () => {
  const auth = fakeAuth({ tokens: {} });
  const row = { template: 'verify', to: 'newuser@example.com', subject: VERIFY_SUBJECT, html: firebaseVerificationTemplate() };
  const html = await htmlForSend(row, { auth });
  assert.equal(html.includes('%LINK%'), false, 'no placeholder may be sent');
  assert.ok(html.includes('https://pincraftly.firebaseapp.com/__/auth/action'), 'real Firebase action URL');
  assert.ok(html.includes('oobCode=abc123'), 'fresh oobCode in the link');
  assert.deepEqual(auth.calls.links[0], ['newuser@example.com', { url: `${SITE_URL}/login`, handleCodeInApp: false }]);
  // Non-verify rows are sent exactly as stored.
  assert.equal(await htmlForSend({ template: 'welcome', html: '<p>x</p>' }, { auth }), '<p>x</p>');
});

check('verification: when link generation fails, the verify row is never sent with a placeholder', async () => {
  const auth = { generateEmailVerificationLink: async () => { throw new Error('quota'); } };
  const row = { template: 'verify', to: 'newuser@example.com', html: firebaseVerificationTemplate() };
  await assert.rejects(htmlForSend(row, { auth }), /quota/);
  const blank = { generateEmailVerificationLink: async () => '' };
  await assert.rejects(htmlForSend(row, { auth: blank }), /verification_link_unavailable/);
});

check('verification: no sendEmailVerification call remains anywhere in the app code', () => {
  const root = new URL('../', import.meta.url).pathname;
  const hits = [];
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.next', '.git', 'scripts', 'docs'].includes(entry.name)) continue;
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (/\.(m?js|jsx?|tsx?|mjs)$/.test(entry.name) && readFileSync(full, 'utf8').includes('sendEmailVerification')) hits.push(full);
    }
  };
  walk(root);
  assert.deepEqual(hits, [], 'sendEmailVerification must not be called');
  assert.ok(readFileSync(`${root}lib/firebase/client.js`, 'utf8').includes('/api/auth/send-verification'));
});

let passed = 0;
for (const [name, fn] of tests) { await fn(); passed++; console.log(`ok - ${name}`); }
console.log(`test-email: ${passed} checks passed`);
