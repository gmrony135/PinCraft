import { apiError, json, sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { readJoinStatus } from '@/lib/showcase/joins.mjs';
import { refreshTelegramVerification } from '@/lib/showcase/telegram-bot.mjs';
import { showcaseConfig } from '@/lib/showcase/verify.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KNOWN = new Set(['telegram_bot_not_admin', 'telegram_unavailable']);

// Called by the popup on open and on return. Checks membership for a linked account. It never sets
// a flag without a successful getChatMember result.
export async function POST(request) {
  try {
    const user = await sessionUser(request, true);
    const config = showcaseConfig();
    if (!config.telegramBotToken) return json({ ok: false, code: 'telegram_not_configured' }, 503);
    const db = getDatabase();
    try {
      const result = await refreshTelegramVerification({ db, uid: user.id, token: config.telegramBotToken });
      return json({ ok: true, linked: result.linked, telegramJoined: result.joined });
    } catch (error) {
      const code = KNOWN.has(error.message) ? error.message : 'telegram_unavailable';
      const status = await readJoinStatus(db, user.id);
      return json({ ok: false, code, linked: true, telegramJoined: status.telegramJoined });
    }
  } catch (error) {
    return apiError(error);
  }
}
