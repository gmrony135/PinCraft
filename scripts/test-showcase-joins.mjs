import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { joinStatus, bothJoined, markVerified, readJoinStatus, SHOWCASE_COLLECTION } from '../lib/showcase/joins.mjs';
import {
  verifyTelegramAuth, telegramMemberStatus, fetchTelegramMembership, signYoutubeState, verifyYoutubeState,
  youtubeAuthUrl, youtubeSubscribed, exchangeYoutubeCode, YOUTUBE_CHANNEL_ID, showcaseConfig,
} from '../lib/showcase/verify.mjs';

const TOKEN = '123456:TEST-TOKEN-NOT-REAL';
function telegramPayload(fields, token = TOKEN) {
  const data = { id: '4242', first_name: 'Test', auth_date: String(Math.floor(Date.now() / 1000)), ...fields };
  const check = Object.keys(data).sort().map(k => `${k}=${data[k]}`).join('\n');
  const secret = createHash('sha256').update(token).digest();
  return { ...data, hash: createHmac('sha256', secret).update(check).digest('hex') };
}

// --- Telegram signature
const good = telegramPayload({});
assert.equal(verifyTelegramAuth(good, TOKEN).id, 4242);
assert.throws(() => verifyTelegramAuth({ ...good, id: '4243' }, TOKEN), /telegram_auth_failed/);          // tampered field
assert.throws(() => verifyTelegramAuth(good, '999:OTHER'), /telegram_auth_failed/);                       // wrong bot token
assert.throws(() => verifyTelegramAuth({ ...good, hash: 'abc' }, TOKEN), /telegram_auth_failed/);        // malformed hash
assert.throws(() => verifyTelegramAuth(telegramPayload({ auth_date: String(Math.floor(Date.now() / 1000) - 3600) }), TOKEN), /telegram_auth_expired/);
assert.throws(() => verifyTelegramAuth({ ...good, hash: undefined }, TOKEN), /telegram_auth_failed/);

// --- Membership: only member, administrator, creator count
for (const s of ['member', 'administrator', 'creator']) assert.equal(telegramMemberStatus(s), true, s);
for (const s of ['left', 'kicked', 'restricted', undefined, '']) assert.equal(telegramMemberStatus(s), false, String(s));

const mockTelegram = (body, status = 200) => async () => ({ status, json: async () => body });
assert.equal(await fetchTelegramMembership({ token: TOKEN, userId: 1, fetchImpl: mockTelegram({ ok: true, result: { status: 'member' } }) }), true);
assert.equal(await fetchTelegramMembership({ token: TOKEN, userId: 1, fetchImpl: mockTelegram({ ok: true, result: { status: 'left' } }) }), false);
assert.equal(await fetchTelegramMembership({ token: TOKEN, userId: 1, fetchImpl: mockTelegram({ ok: false, description: 'Bad Request: user not found' }, 400) }), false);
await assert.rejects(fetchTelegramMembership({ token: TOKEN, userId: 1, fetchImpl: mockTelegram({ ok: false, description: 'Forbidden: bot is not a member of the channel chat' }, 403) }), /telegram_bot_not_admin/);
await assert.rejects(fetchTelegramMembership({ token: TOKEN, userId: 1, fetchImpl: mockTelegram({ ok: false, description: 'Bad Request: CHAT_ADMIN_REQUIRED' }, 400) }), /telegram_bot_not_admin/);

// --- YouTube state binding: cookie is valid only for the same UID and the same state
const secret = 'test-secret';
const cookie = signYoutubeState(secret, 'uid-1', 'abc123');
assert.equal(verifyYoutubeState(secret, 'uid-1', cookie), 'abc123');
assert.equal(verifyYoutubeState(secret, 'uid-2', cookie), null);
assert.equal(verifyYoutubeState(secret, 'uid-1', cookie.replace('abc123', 'zzz999')), null);
assert.equal(verifyYoutubeState(secret, 'uid-1', undefined), null);
assert.equal(verifyYoutubeState('other-secret', 'uid-1', cookie), null);

// --- YouTube auth URL: read-only scope, state included
const authUrl = new URL(youtubeAuthUrl({ clientId: 'cid', redirectUri: 'https://x.test/cb', state: 'st' }));
assert.equal(authUrl.searchParams.get('scope'), 'https://www.googleapis.com/auth/youtube.readonly');
assert.equal(authUrl.searchParams.get('state'), 'st');

// --- YouTube subscription check (mocked network)
const calls = [];
const subYes = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ items: [{ id: 'x' }] }) }; };
assert.equal(await youtubeSubscribed({ accessToken: 'tok', fetchImpl: subYes }), true);
const u = new URL(calls[0].url);
assert.equal(u.searchParams.get('mine'), 'true');
assert.equal(u.searchParams.get('forChannelId'), YOUTUBE_CHANNEL_ID);
assert.equal(calls[0].opts.headers.authorization, 'Bearer tok');
assert.equal(await youtubeSubscribed({ accessToken: 't', fetchImpl: async () => ({ ok: true, json: async () => ({ items: [] }) }) }), false);
await assert.rejects(youtubeSubscribed({ accessToken: 't', fetchImpl: async () => ({ ok: false, json: async () => ({}) }) }), /youtube_unavailable/);
await assert.rejects(exchangeYoutubeCode({ clientId: 'a', clientSecret: 'b', code: 'c', redirectUri: 'd', fetchImpl: async () => ({ ok: false, json: async () => ({ error: 'redirect_uri_mismatch' }) }) }), /youtube_token_failed/);
await assert.rejects(youtubeSubscribed({ accessToken: 't', fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ error: { errors: [{ reason: 'accessNotConfigured' }] } }) }) }), /youtube_api_disabled/);
await assert.rejects(youtubeSubscribed({ accessToken: 't', fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ error: { errors: [{ reason: 'insufficientPermissions' }] } }) }) }), /youtube_scope_missing/);

// --- Firestore record: flags are written only through markVerified
function fakeDb() {
  const docs = new Map();
  return { docs, collection: name => ({ doc: id => ({
    get: async () => ({ data: () => docs.get(`${name}/${id}`) }),
    set: async (data, { merge }) => { const prev = merge ? docs.get(`${name}/${id}`) || {} : {}; docs.set(`${name}/${id}`, { ...prev, ...data }); },
  }) }) };
}
const db = fakeDb();
assert.deepEqual(await readJoinStatus(db, 'uid-1'), { telegramJoined: false, youtubeSubscribed: false });
let s = await markVerified(db, 'uid-1', 'telegram');
assert.deepEqual(s, { telegramJoined: true, youtubeSubscribed: false });
assert.equal(bothJoined(s), false);
s = await markVerified(db, 'uid-1', 'youtube');
assert.equal(bothJoined(s), true);
assert.equal(db.docs.get(`${SHOWCASE_COLLECTION}/uid-1`).telegramJoined, true);
assert.deepEqual(await readJoinStatus(db, 'uid-2'), { telegramJoined: false, youtubeSubscribed: false });
await assert.rejects(markVerified(db, 'uid-3', 'pinterest'), /unknown_channel/);
assert.deepEqual(joinStatus({ telegramJoined: 'yes' }), { telegramJoined: false, youtubeSubscribed: false });

// --- Result page: only known codes; the opener gets a postMessage, no page navigation for Telegram
import { showcaseResultPage, safeResultCode } from '../lib/showcase/popup-page.mjs';
assert.equal(safeResultCode('telegram_joined'), 'telegram_joined');
assert.equal(safeResultCode('<script>'), 'youtube_unavailable');
const page = showcaseResultPage('youtube_subscribed');
assert.match(page, /pincraft-showcase/); assert.match(page, /window\.opener\.postMessage/);
assert.doesNotMatch(showcaseResultPage('</script><script>alert(1)'), /alert\(1\)/);

// --- Static checks: no self-reported confirmation left anywhere
assert.equal(existsSync(new URL('../app/api/showcase/route.js', import.meta.url).pathname), true);
const apiRoute = readFileSync(new URL('../app/api/showcase/route.js', import.meta.url), 'utf8');
assert.doesNotMatch(apiRoute, /export async function POST/, 'no browser-writable POST');
const popup = readFileSync(new URL('../components/onboarding/ChannelShowcase.js', import.meta.url), 'utf8');
assert.doesNotMatch(popup, /I joined|I subscribed|pinterest/i);
assert.doesNotMatch(popup, /stays until|until both are verified|must/i, 'no mandatory wording in the popup copy');
assert.match(popup, /Join &amp;|Join & Verify/); assert.doesNotMatch(popup, /data-auth-url|telegram-widget/, 'Telegram uses the bot deep link, no redirect or Login Widget');
// Hard gate: full cover, modal, no close, no skip, no YouTube anywhere in the popup.
assert.match(popup, /fixed inset-0 z-\[90\]/); assert.match(popup, /aria-modal="true"/);
assert.doesNotMatch(popup, /aria-label="Close"|Skip for now|onClick=\{\(\) => setOpen\(false\)\}/, 'no close or skip escape');
assert.doesNotMatch(popup, /youtube|YouTube|PinCraftOfficial|Subscribe|subscri/i, 'popup has no YouTube logic');
assert.doesNotMatch(popup, /Joining is optional|Skip|optional/i, 'joining is required in the popup');
assert.ok(existsSync(new URL('../app/api/showcase/telegram/verify/route.js', import.meta.url).pathname));
const verifyRoute = readFileSync(new URL('../app/api/showcase/telegram/verify/route.js', import.meta.url), 'utf8');
assert.match(verifyRoute, /markVerified\(db, user\.id, 'telegram'\)/); assert.match(verifyRoute, /linkTelegramAccount\(db, user\.id, auth\.id\)/);
assert.match(verifyRoute, /fetchTelegramMembership/);
assert.doesNotMatch(popup, /localStorage|sessionStorage/);
assert.match(popup, /https:\/\/t\.me\/pincraft_ai/);
const yt = readFileSync(new URL('../lib/showcase/verify.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(yt, /TELEGRAM_BOT_TOKEN\s*=\s*['"][^'"]+['"]/, 'no hardcoded bot token');
const cb = readFileSync(new URL('../app/api/showcase/telegram/callback/route.js', import.meta.url), 'utf8');
assert.match(cb, /fetchTelegramMembership/); assert.match(cb, /markVerified\(db, user\.id, 'telegram'\)/); assert.match(cb, /linkTelegramAccount\(db, user\.id, auth\.id\)/);
const ycb = readFileSync(new URL('../app/api/showcase/youtube/callback/route.js', import.meta.url), 'utf8');
assert.match(ycb, /markVerified\(getDatabase\(\), user\.id, 'youtube'\)/);
assert.match(ycb, /verifyYoutubeState/);
// config reads env only
assert.equal(showcaseConfig({ TELEGRAM_BOT_TOKEN: 'x', GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 's', AUTH_SESSION_SECRET: 'a' }).telegramBotToken, 'x');
assert.equal(showcaseConfig({}).telegramBotToken, '');

console.log('test-showcase-joins: all checks passed');
