import { getDatabase } from '@/lib/automation/db.mjs';
import { handleBotUpdate, webhookSecretMatches } from '@/lib/showcase/telegram-bot.mjs';
import { showcaseConfig } from '@/lib/showcase/verify.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Telegram webhook for the channel bot. Only requests carrying the secret_token header
// (derived from the bot token) are processed.
export async function POST(request) {
  const config = showcaseConfig();
  if (!config.telegramBotToken) return new Response('not configured', { status: 503 });
  if (!webhookSecretMatches(request.headers.get('x-telegram-bot-api-secret-token'), config.telegramBotToken)) {
    return new Response('forbidden', { status: 403 });
  }
  let update;
  try {
    update = await request.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }
  try {
    await handleBotUpdate({ update, db: getDatabase(), token: config.telegramBotToken });
    return new Response('ok', { status: 200 });
  } catch (error) {
    console.error('showcase: telegram webhook failed', error?.code || error?.message || 'error');
    return new Response('retry', { status: 500 });
  }
}
