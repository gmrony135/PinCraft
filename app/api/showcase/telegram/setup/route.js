import { timingSafeEqual } from 'node:crypto';
import { json } from '@/lib/automation/api';
import { webhookSecret } from '@/lib/showcase/telegram-bot.mjs';
import { showcaseConfig } from '@/lib/showcase/verify.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// One-time operator step: registers the bot webhook with Telegram. It is disabled unless
// TELEGRAM_SETUP_SECRET is set, and the secret must be sent in the x-setup-secret header.
// Returns only sanitized webhook info. The bot token is never returned or logged.
async function callTelegram(token, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  return response.json().catch(() => ({}));
}

export async function POST(request) {
  const expected = process.env.TELEGRAM_SETUP_SECRET || '';
  const given = request.headers.get('x-setup-secret') || '';
  const same = expected.length > 0 && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!same) return new Response('Not found', { status: 404 });
  const config = showcaseConfig();
  if (!config.telegramBotToken) return json({ ok: false, code: 'telegram_not_configured' }, 503);
  const origin = new URL(request.url).origin;
  const set = await callTelegram(config.telegramBotToken, 'setWebhook', {
    url: `${origin}/api/showcase/telegram/bot-webhook`,
    secret_token: webhookSecret(config.telegramBotToken),
    allowed_updates: ['message', 'chat_member'],
    max_connections: 20,
  });
  const info = await callTelegram(config.telegramBotToken, 'getWebhookInfo', {});
  const r = info.result || {};
  return json({
    setWebhookOk: set.ok === true,
    setWebhookDescription: set.ok === true ? null : String(set.description || 'error'),
    webhook: {
      url: r.url || '',
      pending_update_count: r.pending_update_count ?? null,
      last_error_date: r.last_error_date ?? null,
      last_error_message: r.last_error_message ?? null,
      allowed_updates: r.allowed_updates || [],
      has_custom_certificate: r.has_custom_certificate ?? null,
    },
  });
}
