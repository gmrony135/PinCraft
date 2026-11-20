import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDatabase } from '@/lib/automation/db.mjs';
import { SENDER_EMAIL, SITE_URL, unsubscribeSecret } from '@/lib/email/config.mjs';
import { exchangeCode, stateMatches, verifyGrant } from '@/lib/email/gmail.mjs';
import { saveGmailGrant } from '@/lib/email/gmail-store.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = '__Host-pc-gmail-state';
const noStore = { 'Cache-Control': 'no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow' };

function page(title, message, status = 200) {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;max-width:520px;margin:48px auto;padding:0 18px;color:#1f2937;line-height:1.5"><h1 style="font-size:22px">${title}</h1><p>${message}</p><p><a href="${SITE_URL}/">PinCraft</a></p></body></html>`;
  const response = new NextResponse(body, { status, headers: { ...noStore, 'Content-Type': 'text/html; charset=utf-8' } });
  response.cookies.set(STATE_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}

// Google redirects here after the owner approves as the Dream Boost account. Nothing is stored unless the
// state matches this browser, the token exchange works, and the verified account is the Dream Boost address.
export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get('error')) return page('Not connected', 'Google did not approve the connection. Start again from the connect page.', 400);
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const secret = unsubscribeSecret();
  const cookieValue = (await cookies()).get(STATE_COOKIE)?.value || '';
  if (!code || !secret || !stateMatches(state, cookieValue, secret)) {
    return page('Start again', 'This link has expired or was opened in another browser. Start again from the connect page.', 400);
  }
  try {
    const tokens = await exchangeCode({ code });
    const check = verifyGrant(tokens);
    if (!check.ok) {
      // Generic on purpose: the reason is logged by code only, never the token or identity.
      console.error('gmail connect refused', check.reason);
      return page('Wrong account', `Connect only the ${SENDER_EMAIL} account. Nothing was saved.`, 403);
    }
    await saveGmailGrant(getDatabase(), { account: check.account, refreshToken: check.refreshToken });
    return page('Gmail connected', `PinCraft can now send email as ${SENDER_EMAIL}. Queued messages go out on the next scheduled run.`);
  } catch (error) {
    console.error('gmail connect failed', error?.code || error?.name || 'error');
    return page('Not connected', 'The connection could not be completed. Start again from the connect page.', 503);
  }
}
