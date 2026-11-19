import { NextResponse } from 'next/server';
import { sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { markVerified } from '@/lib/showcase/joins.mjs';
import { fetchTelegramMembership, showcaseConfig, verifyTelegramAuth } from '@/lib/showcase/verify.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Target of the Telegram Login Widget (redirect mode). Telegram signs the payload; the server
// verifies the signature, then asks the channel (via the bot, which is an admin) whether that
// Telegram account is a member. Only then is telegramJoined set.
export async function GET(request) {
  const origin = new URL(request.url).origin;
  const back = code => NextResponse.redirect(new URL(`/dashboard?showcase=${code}`, origin));
  let user;
  try { user = await sessionUser(request); } catch { return NextResponse.redirect(new URL('/login', origin)); }

  const config = showcaseConfig();
  if (!config.telegramBotToken) return back('telegram_not_configured');

  const params = Object.fromEntries(new URL(request.url).searchParams);
  let auth;
  try {
    auth = verifyTelegramAuth(params, config.telegramBotToken);
  } catch (error) {
    return back(error.message === 'telegram_auth_expired' ? 'telegram_auth_expired' : 'telegram_auth_failed');
  }

  let member;
  try {
    member = await fetchTelegramMembership({ token: config.telegramBotToken, userId: auth.id });
  } catch {
    return back('telegram_unavailable');
  }
  if (!member) return back('telegram_not_member');

  await markVerified(getDatabase(), user.id, 'telegram');
  return back('telegram_joined');
}
