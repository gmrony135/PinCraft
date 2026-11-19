// Server-side verification for the Telegram and YouTube showcase confirmations.
// Nothing here trusts the browser. Telegram identity is proven by Telegram's signed login payload;
// membership is checked with the bot's getChatMember. YouTube subscription is checked with the
// user's own youtube.readonly OAuth grant, and the access token is discarded after one request.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TELEGRAM_CHANNEL = '@pincraft_ai';
export const YOUTUBE_CHANNEL_ID = 'UChcQe2DwxzGgrVuwE5eB0RA'; // @PinCraftOfficial
export const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
export const TELEGRAM_AUTH_MAX_AGE_SECONDS = 600;
export const YOUTUBE_STATE_COOKIE = 'showcase_yt_state';
const MEMBER_STATUSES = new Set(['member', 'administrator', 'creator']);

export function showcaseConfig(env = process.env) {
  return {
    telegramBotToken: env.TELEGRAM_BOT_TOKEN || '',
    googleClientId: env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: env.GOOGLE_CLIENT_SECRET || '',
    stateSecret: env.AUTH_SESSION_SECRET || '',
  };
}

// Telegram Login Widget signature check (https://core.telegram.org/widgets/login#checking-authorization).
// secret = SHA256(bot_token); hash = HMAC-SHA256(data_check_string, secret), where data_check_string is
// every received field except "hash", sorted by key and joined as "key=value" with newlines.
export function verifyTelegramAuth(params, botToken, nowMs = Date.now()) {
  const received = String(params.hash || '');
  if (!/^[0-9a-f]{64}$/.test(received)) throw new Error('telegram_auth_failed');
  const dataCheck = Object.keys(params).filter(key => key !== 'hash').sort().map(key => `${key}=${params[key]}`).join('\n');
  const secret = createHash('sha256').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheck).digest();
  const given = Buffer.from(received, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error('telegram_auth_failed');
  const authDate = Number(params.auth_date);
  if (!Number.isFinite(authDate) || nowMs / 1000 - authDate > TELEGRAM_AUTH_MAX_AGE_SECONDS || authDate > nowMs / 1000 + 60) {
    throw new Error('telegram_auth_expired');
  }
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('telegram_auth_failed');
  return { id };
}

export function telegramMemberStatus(status) {
  return MEMBER_STATUSES.has(status);
}

// Returns true only for member, administrator or creator. Throws for any other failure.
export async function fetchTelegramMembership({ token, userId, fetchImpl = fetch }) {
  const url = `https://api.telegram.org/bot${token}/getChatMember?chat_id=${encodeURIComponent(TELEGRAM_CHANNEL)}&user_id=${encodeURIComponent(String(userId))}`;
  const response = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  const body = await response.json().catch(() => ({}));
  if (body.ok === true) return telegramMemberStatus(body.result?.status);
  // "user not found" / "member not found" means the account is not in the channel.
  if (response.status === 400 && /member not found|user not found|participant_id_invalid/i.test(body.description || '')) return false;
  throw new Error('telegram_unavailable');
}

let botUsernameCache = null;
export async function telegramBotUsername(token, fetchImpl = fetch) {
  if (!token) return '';
  if (!botUsernameCache) {
    botUsernameCache = (async () => {
      const response = await fetchImpl(`https://api.telegram.org/bot${token}/getMe`, { cache: 'force-cache', signal: AbortSignal.timeout(8000) });
      const body = await response.json().catch(() => ({}));
      if (!body.ok || !body.result?.username) throw new Error('telegram_unavailable');
      return body.result.username;
    })();
    botUsernameCache.catch(() => { botUsernameCache = null; });
  }
  return botUsernameCache;
}

export function signYoutubeState(secret, uid, state) {
  const sig = createHmac('sha256', secret).update(`${uid}:${state}`).digest('base64url');
  return `${state}.${sig}`;
}

// Returns the state if the cookie was issued to this UID and not tampered with, otherwise null.
export function verifyYoutubeState(secret, uid, cookie) {
  if (typeof cookie !== 'string' || !cookie.includes('.')) return null;
  const state = cookie.slice(0, cookie.lastIndexOf('.'));
  const expected = Buffer.from(signYoutubeState(secret, uid, state));
  const given = Buffer.from(cookie);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return state;
}

export function newYoutubeState() {
  return randomBytes(24).toString('base64url');
}

export function youtubeAuthUrl({ clientId, redirectUri, state }) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: YOUTUBE_SCOPE,
    access_type: 'online',
    include_granted_scopes: 'false',
    state,
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

export async function exchangeYoutubeCode({ clientId, clientSecret, code, redirectUri, fetchImpl = fetch }) {
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    signal: AbortSignal.timeout(8000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error('youtube_unavailable');
  return body.access_token;
}

// True only when the signed-in user's own subscriptions include the PinCraft channel.
export async function youtubeSubscribed({ accessToken, fetchImpl = fetch }) {
  const url = new URL('https://www.googleapis.com/youtube/v3/subscriptions');
  url.search = new URLSearchParams({ part: 'id', mine: 'true', forChannelId: YOUTUBE_CHANNEL_ID, maxResults: '1' }).toString();
  const response = await fetchImpl(url.toString(), { cache: 'no-store', headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('youtube_unavailable');
  return Array.isArray(body.items) && body.items.length > 0;
}
