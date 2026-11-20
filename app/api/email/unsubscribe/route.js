import { getDatabase } from '@/lib/automation/db.mjs';
import { unsubscribeSecret } from '@/lib/email/config.mjs';
import { verifyUnsubscribeToken } from '@/lib/email/token.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const page = (title, message) => new Response(`<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="margin:0;padding:40px 16px;font-family:'Noto Sans Bengali',Arial,sans-serif;background:#f5f5f4;color:#1c1917;text-align:center;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px 24px;">
<h1 style="font-size:22px;margin:0 0 12px;color:#be123c;">PinCraft</h1>
<p style="font-size:16px;line-height:1.7;margin:0 0 18px;">${message}</p>
<a href="https://pincraftly.vercel.app" style="color:#be123c;font-weight:700;">PinCraft-এ ফিরে যান</a>
</div></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

// One-click unsubscribe. The HMAC token alone authorises the change. No sign-in is needed.
export async function GET(request) {
  const url = new URL(request.url);
  const uid = url.searchParams.get('u') || '';
  const kind = url.searchParams.get('k') || '';
  const token = url.searchParams.get('t') || '';
  const secret = unsubscribeSecret();
  const invalid = page('PinCraft', 'এই লিংকটি সঠিক নয় বা মেয়াদোত্তীর্ণ। অনুগ্রহ করে সর্বশেষ ইমেইলের লিংকটি আবার ব্যবহার করুন।');
  if (!verifyUnsubscribeToken(uid, kind, token, secret)) return invalid;
  const update = kind === 'all'
    ? { unsubscribedWeekly: true, unsubscribedReengage: true, unsubscribedAll: true }
    : kind === 'weekly' ? { unsubscribedWeekly: true } : { unsubscribedReengage: true };
  await getDatabase().collection('email_state').doc(uid).set({ ...update, unsubscribedUpdatedAt: new Date() }, { merge: true });
  return page('PinCraft', kind === 'all'
    ? 'আপনি PinCraft-এর সব অপ্রয়োজনীয় ইমেইল থেকে সরে গেছেন। নিরাপত্তা ও অ্যাকাউন্টের ইমেইল আগের মতোই পাবেন।'
    : 'আপনার অনুরোধ অনুযায়ী এই ধরনের ইমেইল আর পাঠানো হবে না।');
}
