import { NextResponse } from 'next/server';
import { auth } from '../../../lib/firebase.mjs';
import { OWNER_EMAIL } from '../../../lib/config.mjs';
import { checkAdminLogin, adminPinHash } from '../../../lib/admin-pin.mjs';
import { COOKIE, SESSION_SECONDS, cookieOptions, signSession } from '../../../lib/session.mjs';
import { clientKey, takeAttempt } from '../../../lib/ratelimit.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const noStore = { 'Cache-Control': 'no-store, max-age=0' };

// One generic refusal for every reason a sign-in is not allowed (wrong email, wrong PIN, malformed input,
// PIN not configured, owner account not verified). It never says which part was wrong.
const REFUSED_MESSAGE = 'Sign-in was not allowed. Check the Gmail address and PIN, then try again.';
const refused = () => NextResponse.json(
  { error: 'sign_in_not_allowed', message: REFUSED_MESSAGE },
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

  // Every attempt counts, including wrong emails and malformed bodies: 10 attempts per 15 minutes per client.
  let allowed;
  try { allowed = await takeAttempt(clientKey(request)); } catch { return unavailable(); }
  if (!allowed) {
    return NextResponse.json({ error: 'too_many_attempts', message: 'Too many sign-in attempts. Wait 15 minutes, then try again.' }, { status: 429, headers: noStore });
  }

  let body;
  try { body = await request.json(); } catch { return refused(); }
  const email = typeof body?.email === 'string' && body.email.length <= 320 ? body.email : '';
  const pin = typeof body?.pin === 'string' && body.pin.length <= 16 ? body.pin : '';

  if (!adminPinHash()) {
    console.error('admin sign-in: ADMIN_PIN_HASH is not configured');
    return refused();
  }
  if (!(await checkAdminLogin({ email, pin }))) return refused();

  try {
    // Owner re-check: the Gmail account must exist, be verified, and be enabled. Read-only Admin SDK lookup.
    const owner = await auth().getUserByEmail(OWNER_EMAIL);
    if (owner.emailVerified !== true || owner.disabled) return refused();
    const response = NextResponse.json({ ok: true }, { headers: noStore });
    response.cookies.set(COOKIE, signSession(OWNER_EMAIL, owner.uid), cookieOptions(SESSION_SECONDS));
    return response;
  } catch (error) {
    // Firebase account errors start with "auth/": treat as a refusal. Anything else is an outage.
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
