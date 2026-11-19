import { NextResponse } from 'next/server';
import { sessionUser } from '@/lib/automation/api';
import { newYoutubeState, showcaseConfig, signYoutubeState, YOUTUBE_STATE_COOKIE, youtubeAuthUrl } from '@/lib/showcase/verify.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Starts the YouTube read-only grant. The state is bound to the signed-in UID in a short-lived cookie.
export async function GET(request) {
  const origin = new URL(request.url).origin;
  const fail = code => NextResponse.redirect(new URL(`/api/showcase/youtube/done?code=${code}`, origin));
  let user;
  try { user = await sessionUser(request); } catch { return NextResponse.redirect(new URL('/login', origin)); }

  const config = showcaseConfig();
  if (!config.googleClientId || !config.googleClientSecret || !config.stateSecret) return fail('youtube_not_configured');

  const state = newYoutubeState();
  const response = NextResponse.redirect(youtubeAuthUrl({ clientId: config.googleClientId, redirectUri: `${origin}/api/showcase/youtube/callback`, state }));
  response.cookies.set(YOUTUBE_STATE_COOKIE, signYoutubeState(config.stateSecret, user.id, state), {
    httpOnly: true, secure: origin.startsWith('https:'), sameSite: 'lax', path: '/api/showcase/youtube', maxAge: 600,
  });
  return response;
}
