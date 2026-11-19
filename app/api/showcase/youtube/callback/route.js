import { NextResponse } from 'next/server';
import { sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { markVerified } from '@/lib/showcase/joins.mjs';
import { exchangeYoutubeCode, showcaseConfig, verifyYoutubeState, YOUTUBE_STATE_COOKIE, youtubeSubscribed } from '@/lib/showcase/verify.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Google redirect target. Checks the state cookie, exchanges the code, asks whether the signed-in
// user is subscribed to the PinCraft channel, then discards the access token.
export async function GET(request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const finish = code => {
    const response = NextResponse.redirect(new URL(`/dashboard?showcase=${code}`, origin));
    response.cookies.delete({ name: YOUTUBE_STATE_COOKIE, path: '/api/showcase/youtube' });
    return response;
  };
  let user;
  try { user = await sessionUser(request); } catch { return NextResponse.redirect(new URL('/login', origin)); }

  const config = showcaseConfig();
  if (!config.googleClientId || !config.googleClientSecret || !config.stateSecret) return finish('youtube_not_configured');
  if (url.searchParams.get('error')) return finish('youtube_denied');

  const state = url.searchParams.get('state');
  const expected = verifyYoutubeState(config.stateSecret, user.id, request.cookies.get(YOUTUBE_STATE_COOKIE)?.value);
  const code = url.searchParams.get('code');
  if (!state || !code || !expected || state !== expected) return finish('youtube_state_invalid');

  let subscribed;
  try {
    const accessToken = await exchangeYoutubeCode({ clientId: config.googleClientId, clientSecret: config.googleClientSecret, code, redirectUri: `${origin}/api/showcase/youtube/callback` });
    subscribed = await youtubeSubscribed({ accessToken });
  } catch {
    return finish('youtube_unavailable');
  }
  if (!subscribed) return finish('youtube_not_subscribed');

  await markVerified(getDatabase(), user.id, 'youtube');
  return finish('youtube_subscribed');
}
