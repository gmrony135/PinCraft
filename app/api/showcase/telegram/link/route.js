import { apiError, json, sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { createLinkToken, LINK_TTL_MS } from '@/lib/showcase/telegram-bot.mjs';
import { showcaseConfig, telegramBotUsername } from '@/lib/showcase/verify.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Creates a single-use, 10-minute deep link to the channel bot for the signed-in user.
export async function POST(request) {
  try {
    const user = await sessionUser(request, true);
    const config = showcaseConfig();
    if (!config.telegramBotToken) return json({ ok: false, code: 'telegram_not_configured' }, 503);
    let username;
    try {
      username = await telegramBotUsername(config.telegramBotToken);
    } catch {
      return json({ ok: false, code: 'telegram_unavailable' }, 503);
    }
    const token = await createLinkToken(getDatabase(), user.id);
    return json({ ok: true, url: `https://t.me/${username}?start=link_${token}`, expiresInSeconds: Math.round(LINK_TTL_MS / 1000) });
  } catch (error) {
    return apiError(error);
  }
}
