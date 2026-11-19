// Tests for the bot-based Telegram verification. No network: Telegram is mocked, and the database is in memory.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createLinkToken, consumeLinkToken, linkTelegramAccount, handleBotUpdate, refreshTelegramVerification,
  START_RE, webhookSecret, webhookSecretMatches, LINK_TTL_MS, telegramIdForUid,
} from '../lib/showcase/telegram-bot.mjs';
import { readJoinStatus } from '../lib/showcase/joins.mjs';

const TOKEN = '123456:TEST-BOT-TOKEN-NEVER-REAL';
const CHANNEL_MEMBER = 'member';

function fakeDb() {
  const store = new Map();
  const snap = data => ({ exists: data !== undefined, data: () => data });
  const doc = (name, id) => {
    const key = `${name}/${id}`;
    return {
      key,
      get: async () => snap(store.get(key)),
      set: async (data, opts) => { store.set(key, opts?.merge ? { ...(store.get(key) || {}), ...data } : { ...data }); },
      delete: async () => { store.delete(key); },
    };
  };
  return {
    store,
    collection: name => ({ doc: id => doc(name, id) }),
    async runTransaction(fn) {
      const writes = [];
      const tx = {
        get: async ref => snap(store.get(ref.key)),
        set: (ref, data, opts) => writes.push(() => ref.set(data, opts)),
        delete: ref => writes.push(() => ref.delete()),
      };
      const out = await fn(tx);
      for (const write of writes) await write();
      return out;
    },
  };
}

// Mocked Telegram Bot API. membership maps Telegram user id -> status string.
function fakeTelegram(membership = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, body: init.body });
    if (url.includes('/getChatMember')) {
      const user = Number(new URL(url).searchParams.get('user_id'));
      const status = membership[user];
      if (status === undefined) return { ok: false, status: 400, json: async () => ({ ok: false, description: 'Bad Request: user not found' }) };
      return { ok: true, status: 200, json: async () => ({ ok: true, result: { status } }) };
    }
    if (url.includes('/sendMessage')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
    throw new Error('unexpected url');
  };
  return { calls, fetchImpl };
}

const start = (token, id, extra = {}) => ({ update_id: 1, message: { text: `/start link_${token}`, chat: { id, type: 'private' }, from: { id, is_bot: false }, ...extra } });

// --- Start payload parsing
assert.ok(START_RE.test('/start link_abcdefghijklmnopqrstuvwxyz012345'));
assert.ok(!START_RE.test('/start'), 'bare /start is not a link');
assert.ok(!START_RE.test('/start link_short'), 'short tokens are rejected');
assert.ok(!START_RE.test('/start link_abcdefghijklmnopqrstuvwxyz012345 extra'), 'extra text is rejected');

// --- Webhook secret: derived, stable, never equal to the token, and checked in constant time
const secret = webhookSecret(TOKEN);
assert.match(secret, /^[A-Za-z0-9_-]{43}$/, 'valid Telegram secret_token characters and length');
assert.equal(webhookSecret(TOKEN), secret);
assert.notEqual(secret, TOKEN);
assert.ok(webhookSecretMatches(secret, TOKEN));
assert.ok(!webhookSecretMatches('wrong', TOKEN));
assert.ok(!webhookSecretMatches(undefined, TOKEN));

// --- Link tokens: single use, time-limited, tied to a UID
{
  const db = fakeDb();
  const t0 = 1_000_000;
  const token = await createLinkToken(db, 'uid-A', t0);
  assert.equal(JSON.stringify(db.store).includes(token), false, 'only a hash of the token is stored');
  assert.deepEqual(await consumeLinkToken(db, token, t0 + 1000), { uid: 'uid-A' });
  assert.deepEqual(await consumeLinkToken(db, token, t0 + 2000), { error: 'link_used' });
  const expired = await createLinkToken(db, 'uid-A', t0);
  assert.deepEqual(await consumeLinkToken(db, expired, t0 + LINK_TTL_MS + 1), { error: 'link_expired' });
  assert.deepEqual(await consumeLinkToken(db, 'not-a-real-token-value-xyz', t0), { error: 'link_invalid' });
}

// --- Member who taps START: linked and verified immediately
{
  const db = fakeDb();
  const tg = fakeTelegram({ 555: CHANNEL_MEMBER });
  const token = await createLinkToken(db, 'uid-B');
  const reply = await handleBotUpdate({ update: start(token, 555), db, token: TOKEN, fetchImpl: tg.fetchImpl });
  assert.match(reply, /^Verified\./);
  assert.equal((await readJoinStatus(db, 'uid-B')).telegramJoined, true);
  assert.equal(await telegramIdForUid(db, 'uid-B'), 555);
  assert.ok(tg.calls.some(c => c.url.includes('/sendMessage')), 'bot replies to the user');
  assert.ok(!reply.includes(TOKEN) && !reply.includes(token), 'reply never contains the bot token or link token');
}

// --- Not yet a member: linked, not verified; the later chat_member join verifies automatically
{
  const db = fakeDb();
  const tg = fakeTelegram({ 777: 'left' });
  const token = await createLinkToken(db, 'uid-C');
  const reply = await handleBotUpdate({ update: start(token, 777), db, token: TOKEN, fetchImpl: tg.fetchImpl });
  assert.match(reply, /^Linked\. Join @pincraft_ai/);
  assert.equal((await readJoinStatus(db, 'uid-C')).telegramJoined, false, 'not verified before joining');
  const join = { update_id: 2, chat_member: { chat: { username: 'pincraft_ai', type: 'channel' }, new_chat_member: { status: 'member', user: { id: 777, is_bot: false } } } };
  await handleBotUpdate({ update: join, db, token: TOKEN, fetchImpl: tg.fetchImpl });
  assert.equal((await readJoinStatus(db, 'uid-C')).telegramJoined, true, 'verified on join');
}

// --- chat_member from another channel, a leave, or an unknown user does nothing
{
  const db = fakeDb();
  const tg = fakeTelegram({});
  const token = await createLinkToken(db, 'uid-D');
  await handleBotUpdate({ update: start(token, 888), db, token: TOKEN, fetchImpl: tg.fetchImpl });
  await handleBotUpdate({ update: { chat_member: { chat: { username: 'other_channel' }, new_chat_member: { status: 'member', user: { id: 888 } } } }, db, token: TOKEN, fetchImpl: tg.fetchImpl });
  await handleBotUpdate({ update: { chat_member: { chat: { username: 'pincraft_ai' }, new_chat_member: { status: 'left', user: { id: 888 } } } }, db, token: TOKEN, fetchImpl: tg.fetchImpl });
  await handleBotUpdate({ update: { chat_member: { chat: { username: 'pincraft_ai' }, new_chat_member: { status: 'member', user: { id: 999 } } } }, db, token: TOKEN, fetchImpl: tg.fetchImpl });
  assert.equal((await readJoinStatus(db, 'uid-D')).telegramJoined, false);
}

// --- A group message or a bot-sent start is ignored; a reused link is refused
{
  const db = fakeDb();
  const tg = fakeTelegram({ 321: CHANNEL_MEMBER });
  const token = await createLinkToken(db, 'uid-E');
  const groupUpdate = start(token, 321); groupUpdate.message.chat.type = 'group';
  assert.equal(await handleBotUpdate({ update: groupUpdate, db, token: TOKEN, fetchImpl: tg.fetchImpl }), null);
  const botUpdate = start(token, 321, {}); botUpdate.message.from.is_bot = true;
  assert.equal(await handleBotUpdate({ update: botUpdate, db, token: TOKEN, fetchImpl: tg.fetchImpl }), null);
  await handleBotUpdate({ update: start(token, 321), db, token: TOKEN, fetchImpl: tg.fetchImpl });
  const again = await handleBotUpdate({ update: start(token, 321), db, token: TOKEN, fetchImpl: tg.fetchImpl });
  assert.match(again, /already used/);
}

// --- One Telegram account cannot verify two PinCraft accounts
{
  const db = fakeDb();
  const tg = fakeTelegram({ 42: CHANNEL_MEMBER });
  const first = await createLinkToken(db, 'uid-F');
  await handleBotUpdate({ update: start(first, 42), db, token: TOKEN, fetchImpl: tg.fetchImpl });
  const second = await createLinkToken(db, 'uid-G');
  const reply = await handleBotUpdate({ update: start(second, 42), db, token: TOKEN, fetchImpl: tg.fetchImpl });
  assert.match(reply, /already linked to another/);
  assert.equal((await readJoinStatus(db, 'uid-G')).telegramJoined, false);
}

// --- Re-linking the same PinCraft account to a new Telegram account frees the old one
{
  const db = fakeDb();
  const tg = fakeTelegram({ 1: CHANNEL_MEMBER, 2: CHANNEL_MEMBER });
  const a = await createLinkToken(db, 'uid-H');
  await handleBotUpdate({ update: start(a, 1), db, token: TOKEN, fetchImpl: tg.fetchImpl });
  const b = await createLinkToken(db, 'uid-H');
  await handleBotUpdate({ update: start(b, 2), db, token: TOKEN, fetchImpl: tg.fetchImpl });
  assert.equal(await telegramIdForUid(db, 'uid-H'), 2);
  const other = await createLinkToken(db, 'uid-I');
  const reply = await handleBotUpdate({ update: start(other, 1), db, token: TOKEN, fetchImpl: tg.fetchImpl });
  assert.match(reply, /^Verified\./, 'old Telegram account is free again');
}

// --- Popup recheck: verifies only with a successful getChatMember
{
  const db = fakeDb();
  const tg = fakeTelegram({ 60: 'left' });
  const token = await createLinkToken(db, 'uid-J');
  await handleBotUpdate({ update: start(token, 60), db, token: TOKEN, fetchImpl: tg.fetchImpl });
  let r = await refreshTelegramVerification({ db, uid: 'uid-J', token: TOKEN, fetchImpl: tg.fetchImpl });
  assert.deepEqual(r, { linked: true, joined: false });
  tg.calls.length = 0;
  const tg2 = fakeTelegram({ 60: 'member' });
  r = await refreshTelegramVerification({ db, uid: 'uid-J', token: TOKEN, fetchImpl: tg2.fetchImpl });
  assert.deepEqual(r, { linked: true, joined: true });
  assert.equal((await readJoinStatus(db, 'uid-J')).telegramJoined, true);
  // Unlinked user: nothing to check.
  assert.deepEqual(await refreshTelegramVerification({ db, uid: 'uid-nobody', token: TOKEN, fetchImpl: tg2.fetchImpl }), { linked: false, joined: false });
  // A failing Telegram call must throw, never set the flag.
  const broken = async () => ({ ok: false, status: 500, json: async () => ({ ok: false, description: 'boom' }) });
  const db2 = fakeDb();
  const t2 = await createLinkToken(db2, 'uid-K');
  await handleBotUpdate({ update: start(t2, 61), db: db2, token: TOKEN, fetchImpl: fakeTelegram({ 61: 'member' }).fetchImpl });
  await db2.collection('showcase_joins').doc('uid-K').set({ telegramJoined: false }, { merge: true });
  await assert.rejects(refreshTelegramVerification({ db: db2, uid: 'uid-K', token: TOKEN, fetchImpl: broken }), /telegram_unavailable/);
  assert.equal((await readJoinStatus(db2, 'uid-K')).telegramJoined, false);
}

// --- Persistence rules: verified members never lose the flag while they are in the channel;
// leaving clears it; a Telegram error never clears it; the webhook handles leave, kick and rejoin.
{
  const db = fakeDb();
  const tg = fakeTelegram({ 700: 'member' });
  const token = await createLinkToken(db, 'uid-P');
  await handleBotUpdate({ update: start(token, 700), db, token: TOKEN, fetchImpl: tg.fetchImpl });
  assert.equal((await readJoinStatus(db, 'uid-P')).telegramJoined, true);
  // Still a member: re-check keeps the flag and does not write it back to false.
  let r = await refreshTelegramVerification({ db, uid: 'uid-P', token: TOKEN, fetchImpl: fakeTelegram({ 700: 'member' }).fetchImpl });
  assert.deepEqual(r, { linked: true, joined: true });
  assert.equal((await readJoinStatus(db, 'uid-P')).telegramJoined, true, 'member stays verified');
  // Left the channel: the next check clears the flag, so the gate returns.
  r = await refreshTelegramVerification({ db, uid: 'uid-P', token: TOKEN, fetchImpl: fakeTelegram({ 700: 'left' }).fetchImpl });
  assert.deepEqual(r, { linked: true, joined: false });
  assert.equal((await readJoinStatus(db, 'uid-P')).telegramJoined, false, 'leaver is cleared');
  // A Telegram outage on a verified account changes nothing and throws.
  const db3 = fakeDb();
  const t3 = await createLinkToken(db3, 'uid-Q');
  await handleBotUpdate({ update: start(t3, 701), db: db3, token: TOKEN, fetchImpl: fakeTelegram({ 701: 'member' }).fetchImpl });
  const down = async () => ({ ok: false, status: 500, json: async () => ({ ok: false, description: 'boom' }) });
  await assert.rejects(refreshTelegramVerification({ db: db3, uid: 'uid-Q', token: TOKEN, fetchImpl: down }), /telegram_unavailable/);
  assert.equal((await readJoinStatus(db3, 'uid-Q')).telegramJoined, true, 'outage never clears a verified flag');
}
// Webhook: leave, kick and restricted-out clear the flag; rejoin sets it again.
{
  const db = fakeDb();
  const tg = fakeTelegram({ 800: 'member' });
  const token = await createLinkToken(db, 'uid-R');
  await handleBotUpdate({ update: start(token, 800), db, token: TOKEN, fetchImpl: tg.fetchImpl });
  const change = (status, extra = {}) => ({ update_id: 9, chat_member: { chat: { username: 'pincraft_ai', type: 'channel' }, new_chat_member: { status, user: { id: 800, is_bot: false }, ...extra } } });
  assert.equal(await handleBotUpdate({ update: change('left'), db, token: TOKEN, fetchImpl: tg.fetchImpl }), 'unverified');
  assert.equal((await readJoinStatus(db, 'uid-R')).telegramJoined, false, 'leave clears');
  await handleBotUpdate({ update: change('member'), db, token: TOKEN, fetchImpl: tg.fetchImpl });
  assert.equal((await readJoinStatus(db, 'uid-R')).telegramJoined, true, 'rejoin verifies again');
  await handleBotUpdate({ update: change('kicked'), db, token: TOKEN, fetchImpl: tg.fetchImpl });
  assert.equal((await readJoinStatus(db, 'uid-R')).telegramJoined, false, 'kick clears');
  await handleBotUpdate({ update: change('member'), db, token: TOKEN, fetchImpl: tg.fetchImpl });
  await handleBotUpdate({ update: change('restricted', { is_member: false }), db, token: TOKEN, fetchImpl: tg.fetchImpl });
  assert.equal((await readJoinStatus(db, 'uid-R')).telegramJoined, false, 'restricted out of channel clears');
  await handleBotUpdate({ update: change('restricted', { is_member: true }), db, token: TOKEN, fetchImpl: tg.fetchImpl });
  assert.equal((await readJoinStatus(db, 'uid-R')).telegramJoined, false, 'restricted but still in channel is not a join');
}

// --- Source safety: the token is read from the env and never logged or returned
for (const file of [
  'lib/showcase/telegram-bot.mjs',
  'app/api/showcase/telegram/link/route.js',
  'app/api/showcase/telegram/bot-webhook/route.js',
  'app/api/showcase/telegram/recheck/route.js',
  'app/api/showcase/telegram/setup/route.js',
]) {
  const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.doesNotMatch(src, /console\.(log|error)\([^)]*\b(token|botToken|config\.telegramBotToken)\b/, `${file} logs the token`);
  assert.doesNotMatch(src, /\b\d{6,12}:[A-Za-z0-9_-]{30,}/, `${file} contains a literal bot token`);
}
const popup = readFileSync(new URL('../components/onboarding/ChannelShowcase.js', import.meta.url), 'utf8');
assert.doesNotMatch(popup, /telegram-widget\.js|data-onauth|oauth\.telegram/, 'popup no longer loads the Login Widget');
assert.match(popup, /Join &amp;|Join & Verify/);
assert.doesNotMatch(popup, /Verify in Telegram|Join channel|Verify subscription/, 'one Telegram button only');
assert.match(popup, /\/api\/showcase\/telegram\/link/);
assert.match(popup, /\/api\/showcase\/telegram\/recheck/);
assert.doesNotMatch(popup, /stays until|until both are verified|must/i);
// Bot reply carries the inline Join button only while the user still needs to join.
{
  const db = fakeDb();
  const tg = fakeTelegram({ 500: 'left' });
  const token = await createLinkToken(db, 'uid-markup');
  await handleBotUpdate({ update: start(token, 500), db, token: TOKEN, fetchImpl: tg.fetchImpl });
  const sent = JSON.parse(tg.calls.find(c => c.url.includes('/sendMessage')).body);
  assert.deepEqual(sent.reply_markup.inline_keyboard[0][0], { text: 'Join @pincraft_ai', url: 'https://t.me/pincraft_ai' });
  const db2 = fakeDb();
  const tg2 = fakeTelegram({ 501: 'member' });
  const token2 = await createLinkToken(db2, 'uid-markup2');
  await handleBotUpdate({ update: start(token2, 501), db: db2, token: TOKEN, fetchImpl: tg2.fetchImpl });
  const sent2 = JSON.parse(tg2.calls.find(c => c.url.includes('/sendMessage')).body);
  assert.equal(sent2.reply_markup, undefined, 'no button once verified');
}

console.log('test-showcase-telegram-bot: all checks passed');
