import { NextResponse } from 'next/server';
import { auth } from '../../../lib/firebase.mjs';
import { OWNER_EMAIL } from '../../../lib/config.mjs';
import { COOKIE, SESSION_SECONDS, cookieOptions, signSession } from '../../../lib/session.mjs';
import { clientKey, takeAttempt } from '../../../lib/ratelimit.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const noStore = { 'Cache-Control': 'no-store, max-age=0' };

// One generic refusal for every reason a sign-in is not allowed (bad token, other account, unverified email,
// missing owner). It never reveals whether an account exists.
const refused = () => NextResponse.json(
  { error: 'sign_in_not_allowed', message: 'Sign-in was not allowed. Use the owner Google account in Chrome or Safari, then try again.' },
  { status: 401, headers: noStore },
);
const unavailable = () => NextResponse.json(
  { error: 'unavailable', message: 'Sign-in is unavailable right now. Try again in a few minutes.' },
  { status: 503, headers: noStore },
);

function sameOrigin(request) {
  const origin = request.headers.get('origin'), host = request.headers.get('host');
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

export async function POST(request) {
  if (!sameOrigin(request)) return refused();

  let allowed;
  try { allowed = await takeAttempt(clientKey(request)); } catch { return unavailable(); }
  if (!allowed) {
    return NextResponse.json({ error: 'too_many_attempts', message: 'Too many sign-in attempts. Wait 15 minutes, then try again.' }, { status: 429, headers: noStore });
  }

  let body;
  try { body = await request.json(); } catch { return refused(); }
  const idToken = typeof body?.idToken === 'string' && body.idToken.length > 0 && body.idToken.length < 5000 ? body.idToken : '';
  if (!idToken) return refused();

  try {
    const decoded = await auth().verifyIdToken(idToken, true);
    const owner = await auth().getUserByEmail(OWNER_EMAIL);
    const email = String(decoded.email || '').toLowerCase();
    if (email !== OWNER_EMAIL || decoded.email_verified !== true || decoded.uid !== owner.uid || owner.emailVerified !== true || owner.disabled) {
      return refused();
    }
    const response = NextResponse.json({ ok: true }, { headers: noStore });
    response.cookies.set(COOKIE, signSession(OWNER_EMAIL, owner.uid), cookieOptions(SESSION_SECONDS));
    return response;
  } catch (error) {
    // Firebase token and account errors start with "auth/": treat as a refusal. Anything else is an outage.
    if (typeof error?.code === 'string' && error.code.startsWith('auth/')) return refused();
    console.error('admin sign-in failed', error?.name || 'error');
    return unavailable();
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true }, { headers: noStore });
  response.cookies.set(COOKIE, '', cookieOptions(0));
  return response;
}
