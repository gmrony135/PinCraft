import { apiError, json, sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { readJoinStatus } from '@/lib/showcase/joins.mjs';
import { showcaseConfig, telegramBotUsername } from '@/lib/showcase/verify.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Read-only status. There is no POST: confirmations come only from verified server callbacks.
export async function GET(request) {
  try {
    const user = await sessionUser(request);
    const config = showcaseConfig();
    const status = await readJoinStatus(getDatabase(), user.id);
    let botUsername = '';
    if (config.telegramBotToken && !status.telegramJoined) {
      try { botUsername = await telegramBotUsername(config.telegramBotToken); } catch { botUsername = ''; }
    }
    return json({
      ...status,
      telegram: { configured: Boolean(config.telegramBotToken && botUsername), botUsername },
      youtube: { configured: Boolean(config.googleClientId && config.googleClientSecret && config.stateSecret) },
    });
  } catch (error) {
    return apiError(error);
  }
}
