import { LIMITS, LOGO_URL, SITE_URL, SUPPORT_URL } from './config.mjs';

export const esc = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const bn = value => String(value ?? '').replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[Number(d)]);
const num = value => bn(Number(value || 0).toLocaleString('en-US'));
const SITE_HOST = SITE_URL.replace('https://', '');

// Shared header and footer for every email. The logo is the hosted PNG from the live site (public/brand).
// If images are blocked, the "PinCraft" wordmark next to it still shows, and the alt text names the brand.
function header() {
  return `<tr><td style="padding:22px 28px;border-bottom:1px solid #e7e5e4;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;"><a href="${SITE_URL}" style="text-decoration:none;border:0;"><img src="${LOGO_URL}" width="40" height="40" alt="PinCraft" style="display:block;border:0;width:40px;height:40px;"></a></td>
<td style="vertical-align:middle;padding-left:10px;font-size:20px;font-weight:700;color:#be123c;"><a href="${SITE_URL}" style="color:#be123c;text-decoration:none;">PinCraft</a></td>
</tr></table>
</td></tr>`;
}

function footer(extra = '', lang = 'bn') {
  const strings = lang === 'en'
    ? { site: 'Website', support: 'Support', note: '© PinCraft · This email is related to your PinCraft account.' }
    : { site: 'ওয়েবসাইট', support: 'সহায়তা', note: '© PinCraft · এই ইমেইলটি PinCraft অ্যাকাউন্টের সাথে সম্পর্কিত।' };
  return `<tr><td style="padding:20px 28px;background:#fafaf9;font-size:13px;line-height:1.7;color:#57534e;">
${extra}
<div style="margin-top:8px;">${strings.site}: <a href="${SITE_URL}" style="color:#be123c;">${esc(SITE_HOST)}</a></div>
<div>${strings.support}: <a href="${SUPPORT_URL}" style="color:#be123c;">Telegram @gmrony_12</a></div>
<div style="margin-top:8px;color:#78716c;">${strings.note}</div>
</td></tr>`;
}

// One responsive layout for every customer message: single column, 560px max, inline styles only.
function layout({ preheader, bodyHtml, footerExtra = '', lang = 'bn' }) {
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">
<title>PinCraft</title></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:'Noto Sans Bengali','Kalpurush',Arial,sans-serif;color:#1c1917;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
${header()}
<tr><td style="padding:28px;font-size:16px;line-height:1.75;">${bodyHtml}</td></tr>
${footer(footerExtra, lang)}
</table>
</td></tr></table>
</body></html>`;
}

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td style="border-radius:10px;background:#be123c;">
<a href="${esc(href)}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(label)}</a>
</td></tr></table>`;
}

const signOff = '<p style="margin:22px 0 0;">ধন্যবাদান্তে,<br><strong>PinCraft Team</strong></p>';

const limitsList = `<ul style="padding-left:20px;margin:8px 0 0;">
<li>${num(LIMITS.pinPacks)}টি পিন আইডিয়া প্যাক</li>
<li>${num(LIMITS.text)}টি টেক্সট রিকোয়েস্ট (আর্টিকেলও এর মধ্যে)</li>
<li>${num(LIMITS.image)}টি ইমেজ রিকোয়েস্ট</li></ul>`;

const unsubFooter = (weeklyUrl, allUrl) => `<div>এই ধরনের ইমেইল বন্ধ করতে <a href="${esc(weeklyUrl)}" style="color:#be123c;">এখানে ক্লিক করুন</a>। PinCraft-এর সব ইমেইল বন্ধ করতে <a href="${esc(allUrl)}" style="color:#be123c;">এখানে ক্লিক করুন</a>।</div>`;

// Sent by Firebase Auth for account confirmation. This is the body pasted into Firebase Console >
// Authentication > Templates > Email address verification. Firebase replaces %LINK% with the real link.
export function firebaseVerificationTemplate() {
  const body = `<p style="margin:0 0 12px;">Hello,</p>
<p style="margin:0 0 12px;">Thanks for signing up for PinCraft. To activate your account, please verify your email address by clicking the button below.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td style="border-radius:10px;background:#be123c;">
<a href="%LINK%" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">Verify email</a>
</td></tr></table>
<p style="margin:0 0 8px;font-size:14px;color:#57534e;">If the button doesn't work, open this link in your browser:<br><a href="%LINK%" style="color:#be123c;word-break:break-all;">%LINK%</a></p>
<p style="margin:22px 0 0;">Thanks,<br><strong>PinCraft Team</strong></p>`;
  return layout({ preheader: 'Verify your email to activate your PinCraft account', bodyHtml: body, lang: 'en' });
}

export function welcomeEmail({ name }) {
  const first = esc(name || 'বন্ধু');
  const html = layout({
    preheader: 'PinCraft-এ স্বাগতম। আপনার প্রতিদিনের ফ্রি সীমা ও শুরু করার উপায়',
    bodyHtml: `<h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;">স্বাগতম, ${first}!</h1>
<p style="margin:0 0 12px;">আপনার ইমেইল যাচাই হয়েছে এবং PinCraft-এ আপনার অ্যাকাউন্ট প্রস্তুত। PinCraft দিয়ে AI-এর সাহায্যে পিন আইডিয়া, আর্টিকেল ও ছবি তৈরি করতে পারবেন এবং Pin Queue-তে পিন সাজিয়ে রাখতে পারবেন।</p>
<p style="margin:16px 0 4px;font-weight:700;">আপনার প্রতিদিনের ফ্রি সীমা</p>
${limitsList}
<p style="margin:12px 0 0;font-size:14px;color:#57534e;">এই সীমা প্রতিদিন বাংলাদেশ সময় মধ্যরাতে (রাত ১২টা) নতুন করে শুরু হয়।</p>
${button(`${SITE_URL}/dashboard`, 'PinCraft খুলুন')}
<p style="margin:0;">শুরু করতে কোনো সমস্যা হলে Telegram-এ যোগাযোগ করুন।</p>
${signOff}`,
    footerExtra: '<div>এই ইমেইলটি আপনার ইমেইল যাচাইয়ের পর একবারই পাঠানো হয়।</div>',
  });
  return { subject: 'PinCraft-এ স্বাগতম, আপনার অ্যাকাউন্ট প্রস্তুত', html };
}

export function weeklyEmail({ name, stats, today, weeklyUrl, allUrl }) {
  const row = (label, value) => `<tr><td style="padding:10px 0;border-bottom:1px solid #f5f5f4;">${label}</td><td style="padding:10px 0;border-bottom:1px solid #f5f5f4;text-align:right;font-weight:700;">${num(value)}</td></tr>`;
  const html = layout({
    preheader: 'গত ৭ দিনে আপনার PinCraft কাজের সারাংশ',
    bodyHtml: `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">আপনার সাপ্তাহিক সারাংশ</h1>
<p style="margin:0 0 12px;">প্রিয় ${esc(name || 'বন্ধু')}, গত ৭ দিনে PinCraft-এ আপনার কাজের হিসাব নিচে দেওয়া হলো:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;">
${row('তৈরি পিন আইডিয়া প্যাক', stats.pinPacks)}
${row('টেক্সট রিকোয়েস্ট (আর্টিকেল সহ)', stats.text)}
${row('ইমেজ রিকোয়েস্ট', stats.image)}
${row('Pin Queue থেকে পোস্ট হওয়া পিন', stats.pinsPosted)}
</table>
<p style="margin:18px 0 4px;font-weight:700;">আজকের ব্যবহার (দৈনিক সীমা)</p>
<p style="margin:0;font-size:15px;">পিন প্যাক: ${num(today.pinPacks)} / ${num(LIMITS.pinPacks)} · টেক্সট: ${num(today.text)} / ${num(LIMITS.text)} · ইমেজ: ${num(today.image)} / ${num(LIMITS.image)}</p>
${button(`${SITE_URL}/dashboard`, 'PinCraft-এ কাজ চালিয়ে যান')}
${signOff}`,
    footerExtra: unsubFooter(weeklyUrl, allUrl),
  });
  return { subject: 'PinCraft: আপনার সাপ্তাহিক সারাংশ', html };
}

export function reengageEmail({ name, weeklyUrl, allUrl }) {
  const html = layout({
    preheader: 'PinCraft-এ ফিরে আসুন, নতুন পিন আইডিয়া অপেক্ষা করছে',
    bodyHtml: `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">আবার স্বাগতম, ${esc(name || 'বন্ধু')}</h1>
<p style="margin:0 0 12px;">গত ২৪ ঘণ্টায় আপনি PinCraft-এ আসেননি। আপনার প্রতিদিনের ফ্রি সীমা প্রতিদিন নতুন করে শুরু হয়, তাই আজই নতুন পিন আইডিয়া বা আর্টিকেল তৈরি করার সুযোগ আছে।</p>
${button(`${SITE_URL}/dashboard`, 'PinCraft-এ ফিরে যান')}
${signOff}`,
    footerExtra: unsubFooter(weeklyUrl, allUrl),
  });
  return { subject: 'PinCraft-এ ফিরে আসুন, নতুন পিন আইডিয়া অপেক্ষা করছে', html };
}

// Admin notifications (owner only). Bengali, same logo header. Values are escaped and never altered.
function adminLayout(title, intro, rows, note) {
  const body = rows.map(([label, value]) => `<tr><td style="padding:8px 12px 8px 0;color:#57534e;vertical-align:top;">${esc(label)}</td><td style="padding:8px 0;font-weight:600;word-break:break-word;">${esc(value)}</td></tr>`).join('');
  return `<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:16px;background:#f5f5f4;font-family:'Noto Sans Bengali','Kalpurush',Arial,sans-serif;color:#1c1917;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
${header()}
<tr><td style="padding:24px 28px;">
<h2 style="margin:0 0 8px;font-size:19px;">${esc(title)}</h2>
<p style="margin:0 0 14px;color:#57534e;font-size:15px;">${esc(intro)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:15px;">${body}</table>
<p style="margin:16px 0 0;font-size:14px;color:#57534e;">${esc(note)}</p>
${signOff}
</td></tr>
${footer('<div>এটি PinCraft-এর অ্যাডমিন বিজ্ঞপ্তি। শুধু মালিকের ইমেইলে পাঠানো হয়।</div>')}
</table>
</body></html>`;
}

export function adminNewUserEmail({ email, name, registeredAt }) {
  return {
    subject: `[PinCraft] New user registered: ${email}`,
    html: adminLayout(
      'নতুন ব্যবহারকারী নিবন্ধিত হয়েছে',
      'একটি নতুন অ্যাকাউন্ট তৈরি হয়েছে।',
      [['ইমেইল', email], ['নাম', name || '—'], ['নিবন্ধনের সময় (ঢাকা)', registeredAt]],
      'বিস্তারিত দেখতে অ্যাডমিন সাইট খুলুন।',
    ),
  };
}

export function adminPaymentEmail({ amount, method, transactionLast4, payerLast3, email, submittedAt }) {
  return {
    subject: `[PinCraft] Payment request ৳${amount} via ${method}`,
    html: adminLayout(
      'নতুন পেমেন্ট অনুরোধ জমা হয়েছে',
      'একটি পেমেন্ট অনুরোধ পর্যালোচনার জন্য অপেক্ষা করছে।',
      [
        ['পরিমাণ', `BDT ${amount}`], ['মাধ্যম', method], ['ট্রানজেকশন রেফারেন্স (শেষ ৪ অক্ষর)', transactionLast4],
        ['পেয়ারের নম্বর (শেষ ৩ সংখ্যা)', payerLast3], ['অ্যাকাউন্টের ইমেইল', email || '—'], ['জমার সময় (ঢাকা)', submittedAt],
      ],
      'অ্যাডমিন সাইটের Billing review থেকে অনুমোদন বা প্রত্যাখ্যান করুন। সম্পূর্ণ রেফারেন্স এনক্রিপ্টেড অবস্থায় সংরক্ষিত আছে।',
    ),
  };
}
