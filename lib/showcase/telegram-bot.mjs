// Telegram verification through the channel bot (no phone number, no Login Widget).
//
// Flow:
//  1. Signed-in user taps "Join & Verify". The server creates a short-lived link token tied to the
//     Firebase UID (stored only as a SHA-256 hash) and returns https://t.me/<bot>?start=link_<token>.
//  2. The user taps START in Telegram. Telegram sends the bot "/start link_<token>" with the user's
//     Telegram ID. The webhook consumes the token once, links the Telegram ID to the UID, and checks
//     membership of @pincraft_ai with getChatMember.
//  3. Later joins arrive as chat_member updates. A linked user who joins is marked verified.
//  4. refreshTelegramVerification() re-checks getChatMember for a linked user (popup open or return).
//
// Nothing here logs or returns the bot token. Only the verified flag in showcase_joins is ever set,
// and only after the server has confirmed membership.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { markUnverified, markVerified, readJoinStatus } from './joins.mjs';
import { fetchTelegramMembership, TELEGRAM_CHANNEL } from './verify.mjs';

export const LINK_TTL_MS = 10 * 60 * 1000;
export const START_RE = /^\/start(?:@[A-Za-z0-9_]+)?\s+link_([A-Za-z0-9_-]{20,64})$/;
// Any /start (with or without a payload) that is not a valid link gets the welcome menu.
export const START_ANY_RE = /^\/start(?:@[A-Za-z0-9_]+)?(?:\s|$)/;
const TOKENS = 'showcase_link_tokens';
const LINKS = 'showcase_telegram_links';
const IDS = 'showcase_telegram_ids';
const MEMBER_STATUSES = new Set(['member', 'administrator', 'creator']);
const LEFT_STATUSES = new Set(['left', 'kicked']);

export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export const newLinkToken = () => randomBytes(24).toString('base64url');
const millis = value => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  return new Date(value).getTime();
};

// Secret used as Telegram's webhook secret_token. Derived from the bot token, so it is never stored
// anywhere and nobody without the bot token can forge webhook calls.
export function webhookSecret(botToken) {
  return createHmac('sha256', botToken).update('pincraft-showcase-webhook-v1').digest('base64url');
}

export function webhookSecretMatches(given, botToken) {
  const expected = Buffer.from(webhookSecret(botToken));
  const actual = Buffer.from(String(given || ''));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createLinkToken(db, uid, now = Date.now()) {
  const token = newLinkToken();
  await db.collection(TOKENS).doc(tokenHash(token)).set({
    uid, createdAt: new Date(now), expiresAt: new Date(now + LINK_TTL_MS), usedAt: null,
  });
  return token;
}

// Single use. Returns { uid } or { error }.
export async function consumeLinkToken(db, token, now = Date.now()) {
  const ref = db.collection(TOKENS).doc(tokenHash(token));
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { error: 'link_invalid' };
    const data = snap.data();
    if (data.usedAt) return { error: 'link_used' };
    if (millis(data.expiresAt) <= now) return { error: 'link_expired' };
    tx.set(ref, { usedAt: new Date(now) }, { merge: true });
    return { uid: data.uid };
  });
}

// Links one Telegram account to one PinCraft UID. A Telegram account cannot be linked to two UIDs.
export async function linkTelegramAccount(db, uid, telegramId, now = Date.now()) {
  const id = Number(telegramId);
  const idRef = db.collection(IDS).doc(String(id));
  const linkRef = db.collection(LINKS).doc(uid);
  return db.runTransaction(async tx => {
    const idSnap = await tx.get(idRef);
    if (idSnap.exists && idSnap.data().uid !== uid) return { error: 'telegram_linked_elsewhere' };
    const linkSnap = await tx.get(linkRef);
    const previous = linkSnap.exists ? Number(linkSnap.data().telegramId) : null;
    if (previous && previous !== id) tx.delete(db.collection(IDS).doc(String(previous)));
    tx.set(idRef, { uid, linkedAt: new Date(now) }, { merge: true });
    tx.set(linkRef, { telegramId: id, linkedAt: new Date(now) }, { merge: true });
    return { ok: true };
  });
}

export async function telegramIdForUid(db, uid) {
  const snap = await db.collection(LINKS).doc(uid).get();
  return snap.exists && snap.data() ? Number(snap.data().telegramId) : null;
}

export async function uidForTelegramId(db, telegramId) {
  const snap = await db.collection(IDS).doc(String(telegramId)).get();
  return snap.exists && snap.data() ? snap.data().uid : null;
}

// Used on every popup open, sign-in and return. For a linked account it always asks Telegram
// (getChatMember), so a member who has left loses the verified flag and the gate returns, while a
// member who is still in the channel keeps it. A failed check throws and changes nothing, so a
// Telegram outage never clears a verified flag. The token is passed in, never logged.
export async function refreshTelegramVerification({ db, uid, token, fetchImpl = fetch }) {
  const status = await readJoinStatus(db, uid);
  const telegramId = await telegramIdForUid(db, uid);
  if (!telegramId) return { linked: false, joined: status.telegramJoined };
  const member = await fetchTelegramMembership({ token, userId: telegramId, fetchImpl });
  if (member && !status.telegramJoined) await markVerified(db, uid, 'telegram');
  if (!member && status.telegramJoined) await markUnverified(db, uid, 'telegram');
  return { linked: true, joined: member };
}

// Inline button shown inside the bot chat, so the user joins without leaving Telegram.
const JOIN_ROW = [{ text: 'Join @pincraft_ai', url: 'https://t.me/pincraft_ai' }];
const DIVIDER = '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500';
// Menu buttons are URL buttons only: they open links and never send data back to the bot.
// One button per row, each with a fitting icon, in a fixed order: channel, support, website.
export const MENU_ROWS = [
  [{ text: '\u{1F4E2} Telegram Channel', url: 'https://t.me/pincraft_ai' }],
  [{ text: '\u{1F4AC} Support', url: 'https://t.me/gmrony_12' }],
  [{ text: '\u{1F310} Visit Website', url: 'https://pincraftly.vercel.app/' }],
];
export const MENU_MARKUP = { inline_keyboard: MENU_ROWS };
// Shown only while the user still needs to join: the Join button first, then the menu.
export const JOIN_MARKUP = { inline_keyboard: [JOIN_ROW, ...MENU_ROWS] };

export async function sendTelegramMessage({ token, chatId, text, markup = null, fetchImpl = fetch }) {
  try {
    const body = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
    if (markup) body.reply_markup = markup;
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) console.error('showcase: telegram sendMessage failed', response.status);
  } catch {
    console.error('showcase: telegram sendMessage unreachable');
  }
}

// Bot messages are HTML (parse_mode HTML). Keep text short, with numbered steps where the user must act.
const REPLY = {
  link_invalid: '\u26A0\uFE0F <b>This link is not valid</b>\n\nGo back to PinCraft and tap <b>Join &amp; Verify</b> again to get a new link.',
  link_used: '\u26A0\uFE0F <b>This link was already used</b>\n\nGo back to PinCraft and tap <b>Join &amp; Verify</b> again to get a new link.',
  link_expired: '\u231B <b>This link has expired</b>\n\nGo back to PinCraft and tap <b>Join &amp; Verify</b> again to get a new link.',
  telegram_linked_elsewhere: '\u26D4 <b>This Telegram account is already linked</b>\n\nIt is connected to another PinCraft account. If you think this is a mistake, use Support below.',
  joined: '\u2705 <b>Verified</b>\n' + DIVIDER + '\nYou are in @pincraft_ai.\n\nReturn to PinCraft to continue. It updates by itself.',
  not_member: '\u23F3 <b>Almost done</b>\n' + DIVIDER + '\nYour Telegram account is linked to PinCraft.\n\n1\uFE0F\u20E3 Tap <b>Join @pincraft_ai</b> below.\n2\uFE0F\u20E3 Join the channel.\n3\uFE0F\u20E3 Return to PinCraft. It updates by itself.',
  unavailable: '\u{1F517} <b>Linked</b>\n' + DIVIDER + '\nWe could not check the channel just now. It will update automatically once it can be checked.\n\nYou can return to PinCraft now.',
};

export const WELCOME_TEXT = [
  '\u{1F44B} <b>Welcome to PinCraft</b>',
  DIVIDER,
  '',
  '<b>To verify your account</b>',
  '',
  '1\uFE0F\u20E3 Go back to PinCraft and tap <b>Join &amp; Verify</b>.',
  '2\uFE0F\u20E3 Tap <b>START</b> in this chat.',
  '3\uFE0F\u20E3 Join @pincraft_ai when the button appears.',
  '4\uFE0F\u20E3 Return to PinCraft. It updates by itself.',
  '',
  DIVIDER,
  '\u{1F447} Use the buttons below for the channel, support, or the website.',
].join('\n');

// Sent once, when a linked user actually joins the channel.
export const JOINED_NOTE = '\u2705 <b>Verified</b>\n' + DIVIDER + '\nThanks for joining @pincraft_ai.\n\nReturn to PinCraft to continue.';


// Returns { text, markup }. The Join button is attached only when the user still needs to join.
async function handleStart({ db, token, chatId, from, code, now, fetchImpl }) {
  const consumed = await consumeLinkToken(db, code, now);
  if (consumed.error) return { text: REPLY[consumed.error], markup: MENU_MARKUP };
  const linked = await linkTelegramAccount(db, consumed.uid, from.id, now);
  if (linked.error) return { text: REPLY[linked.error], markup: MENU_MARKUP };
  try {
    const member = await fetchTelegramMembership({ token, userId: from.id, fetchImpl });
    if (member) {
      await markVerified(db, consumed.uid, 'telegram');
      return { text: REPLY.joined, markup: MENU_MARKUP };
    }
    return { text: REPLY.not_member, markup: JOIN_MARKUP };
  } catch (error) {
    console.error('showcase: telegram start membership check', error.message === 'telegram_bot_not_admin' ? 'bot_not_admin' : 'unavailable');
    return { text: REPLY.unavailable, markup: MENU_MARKUP };
  }
}

// Handles one Telegram update. Returns the reply text sent (or null). Throws only on storage failure,
// so the webhook can ask Telegram to retry.
export async function handleBotUpdate({ update, db, token, fetchImpl = fetch, now = Date.now() }) {
  const message = update?.message;
  if (message?.text) {
    if (message.chat?.type !== 'private' || !message.from?.id || message.from.is_bot) return null;
    const text = message.text.trim();
    const match = START_RE.exec(text);
    if (match) {
      const reply = await handleStart({ db, token, chatId: message.chat.id, from: message.from, code: match[1], now, fetchImpl });
      await sendTelegramMessage({ token, chatId: message.chat.id, text: reply.text, markup: reply.markup, fetchImpl });
      return reply.text;
    }
    if (START_ANY_RE.test(text)) {
      await sendTelegramMessage({ token, chatId: message.chat.id, text: WELCOME_TEXT, markup: MENU_MARKUP, fetchImpl });
      return WELCOME_TEXT;
    }
    return null;
  }
  const change = update?.chat_member;
  if (change) {
    const chatName = String(change.chat?.username || '').toLowerCase();
    if (chatName !== TELEGRAM_CHANNEL.replace('@', '').toLowerCase()) return null;
    const member = change.new_chat_member;
    if (!member?.user || member.user.is_bot) return null;
    const left = LEFT_STATUSES.has(member.status) || (member.status === 'restricted' && member.is_member === false);
    if (!MEMBER_STATUSES.has(member.status) && !left) return null;
    const uid = await uidForTelegramId(db, member.user.id);
    if (!uid) return null;
    if (left) {
      await markUnverified(db, uid, 'telegram');
      return 'unverified';
    }
    const before = await readJoinStatus(db, uid);
    await markVerified(db, uid, 'telegram');
    if (!before.telegramJoined) {
      await sendTelegramMessage({ token, chatId: member.user.id, text: JOINED_NOTE, markup: MENU_MARKUP, fetchImpl });
    }
    return 'verified';
  }
  return null;
}
