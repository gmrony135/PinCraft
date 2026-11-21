import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/automation/db.mjs';
import { enqueueWelcome } from '@/lib/email/planner.mjs';
import { completeVerifyLink } from '@/lib/email/verify-link.mjs';
import { authSettings, createSession, cookieOptions, readSession, SESSION_COOKIE } from '@/lib/auth-server';
import { firebaseAuth } from '@/lib/firebase/admin.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer' };

// Continue link from the verification mail. Firebase has already applied the verification by the time the
// browser gets here. This route checks that the account is verified and then signs this browser in.
// A browser holding another user's session keeps that session. Every other failure lands on /login.
export async function GET(request) {
  const origin = new URL(request.url).origin;
  const to = path => NextResponse.redirect(new URL(path, origin), { status: 303, headers });
  try {
    const config = authSettings();
    if (!config.configured) return to('/login?verify=failed');
    const token = request.nextUrl.searchParams.get('t') || '';

    let existingUid = null;
    try {
      existingUid = (await readSession(request.cookies.get(SESSION_COOKIE)?.value, config))?.id || null;
    } catch {
      // The saved session could not be checked. Do not replace it; send the person to the sign-in page.
      return to('/login?verified=1');
    }

    const decision = await completeVerifyLink({ token, secret: config.secret, auth: firebaseAuth(), existingUid });
    if (decision.action !== 'session') {
      const failed = decision.reason === 'invalid_link' || decision.reason === 'not_verified';
      return to(failed ? '/login?verify=failed' : '/login?verified=1');
    }

    const sessionToken = await createSession({ id: decision.uid, name: decision.name, authTime: Math.floor(Date.now() / 1000) }, config);
    const response = to('/dashboard');
    response.cookies.set(SESSION_COOKIE, sessionToken, cookieOptions(request));
    // Welcome email, queued once per verified account after a successful sign-in. A failure here never blocks sign-in.
    try { await enqueueWelcome(getDatabase(), decision.uid); } catch {}
    return response;
  } catch {
    return to('/login?verify=failed');
  }
}
