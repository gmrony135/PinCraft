import { apiError, json, readBody, sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { markVerified } from '@/lib/showcase/joins.mjs';
import { fetchTelegramMembership, showcaseConfig, verifyTelegramAuth } from '@/lib/showcase/verify.mjs';
import { linkTelegramAccount } from '@/lib/showcase/telegram-bot.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Inline Telegram Login Widget (data-onauth) posts the signed user payload here. No page navigation.
export async function POST(request) {
  try {
    const user = await sessionUser(request, true);
    const body = await readBody(request, 4000);
    const config = showcaseConfig();
    if (!config.telegramBotToken) return json({ ok: false, code: 'telegram_not_configured' }, 503);

    const params = {};
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined && value !== null && typeof value !== 'object') params[key] = String(value);
    }
    let auth;
    try {
      auth = verifyTelegramAuth(params, config.telegramBotToken);
    } catch (error) {
      return json({ ok: false, code: error.message === 'telegram_auth_expired' ? 'telegram_auth_expired' : 'telegram_auth_failed' }, 400);
    }

    let member;
    try {
      member = await fetchTelegramMembership({ token: config.telegramBotToken, userId: auth.id });
    } catch (error) {
      return json({ ok: false, code: error.message === 'telegram_bot_not_admin' ? 'telegram_bot_not_admin' : 'telegram_unavailable' }, 502);
    }
    if (!member) return json({ ok: false, code: 'telegram_not_member' }, 200);

    // Store the Telegram ID so the server can re-check membership later (leave detection).
    const db = getDatabase();
    const linked = await linkTelegramAccount(db, user.id, auth.id);
    if (linked.error) return json({ ok: false, code: 'telegram_auth_failed' }, 409);
    await markVerified(db, user.id, 'telegram');
    return json({ ok: true, code: 'telegram_joined' });
  } catch (error) {
    return apiError(error);
  }
}
