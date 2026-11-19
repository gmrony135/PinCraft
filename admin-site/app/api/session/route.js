import { NextResponse } from 'next/server';
import { auth } from '../../../lib/firebase.mjs';
import { OWNER_EMAIL } from '../../../lib/config.mjs';
import { COOKIE, SESSION_SECONDS, signSession } from '../../../lib/session.mjs';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

// Verify a Firebase ID token and allow only the owner. Everyone else gets access denied.
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore }); }
  const idToken = typeof body?.idToken === 'string' && body.idToken.length < 5000 ? body.idToken : '';
  if (!idToken) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });

  let decoded;
  try {
    decoded = await auth().verifyIdToken(idToken, true);
  } catch {
    return NextResponse.json({ error: 'sign_in_failed' }, { status: 401, headers: noStore });
  }
  const email = String(decoded.email || '').toLowerCase();
  if (email !== OWNER_EMAIL || decoded.email_verified !== true) {
    return NextResponse.json({ error: 'access_denied' }, { status: 403, headers: noStore });
  }

  const response = NextResponse.json({ ok: true }, { headers: noStore });
  response.cookies.set(COOKIE, signSession(email), { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: SESSION_SECONDS });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true }, { headers: noStore });
  response.cookies.set(COOKIE, '', { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 0 });
  return response;
}
