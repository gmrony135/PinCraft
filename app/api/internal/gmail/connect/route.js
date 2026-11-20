import { NextResponse } from 'next/server';
import { sessionUser } from '@/lib/automation/api';
import { billingAdmin } from '@/lib/billing/config';
import { SITE_URL, unsubscribeSecret } from '@/lib/email/config.mjs';
import { consentUrl, newState, stateTag } from '@/lib/email/gmail.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = '__Host-pc-gmail-state';
const noStore = { 'Cache-Control': 'no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow' };

function page(title, message, status = 200) {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;max-width:520px;margin:48px auto;padding:0 18px;color:#1f2937;line-height:1.5"><h1 style="font-size:22px">${title}</h1><p>${message}</p><p><a href="${SITE_URL}/">PinCraft</a></p></body></html>`;
  return new NextResponse(body, { status, headers: { ...noStore, 'Content-Type': 'text/html; charset=utf-8' } });
}

// Owner-only. Start here while signed in to PinCraft as the owner. It redirects to Google's consent screen
// with login_hint set to the Dream Boost account. The callback refuses any other account.
export async function GET(request) {
  let user;
  try { user = await sessionUser(request); } catch {
    return page('Sign in first', 'Sign in to PinCraft as the owner account, then open this page again.', 401);
  }
  try {
    if (!(await billingAdmin(user))) return page('Not allowed', 'This page is only for the owner account.', 403);
  } catch {
    return page('Try again', 'Owner check is unavailable right now. Try again in a few minutes.', 503);
  }
  const secret = unsubscribeSecret();
  if (!secret) return page('Not configured', 'EMAIL_UNSUBSCRIBE_SECRET is not set, so the connection cannot start.', 503);
  const state = newState();
  const response = NextResponse.redirect(consentUrl({ state }), 302);
  Object.entries(noStore).forEach(([key, value]) => response.headers.set(key, value));
  response.cookies.set(STATE_COOKIE, stateTag(state, secret), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
  return response;
}
