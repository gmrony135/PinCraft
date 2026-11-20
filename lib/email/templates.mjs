import { LIMITS, LOGO_URL, SITE_URL } from './config.mjs';

export const esc = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const bn = value => String(value ?? '').replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[Number(d)]);
const num = value => bn(Number(value || 0).toLocaleString('en-US'));

// One responsive layout for every message: single column, 560px max, inline styles only.
function layout({ preheader, bodyHtml, footerHtml = '' }) {
  return `<!doctype html>
<html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PinCraft</title></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:'Noto Sans Bengali','Kalpurush',Arial,sans-serif;color:#1c1917;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td style="padding:24px 28px;border-bottom:1px solid #e7e5e4;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;"><img src="${LOGO_URL}" width="40" height="40" alt="PinCraft logo" style="display:block;border:0;width:40px;height:40px;"></td>
<td style="vertical-align:middle;padding-left:10px;font-size:20px;font-weight:700;color:#be123c;">PinCraft</td>
</tr></table>
</td></tr>
<tr><td style="padding:28px;font-size:16px;line-height:1.7;">${bodyHtml}</td></tr>
<tr><td style="padding:20px 28px;background:#fafaf9;font-size:13px;line-height:1.6;color:#57534e;">
${footerHtml}
<div style="margin-top:8px;">PinCraft · <a href="${SITE_URL}" style="color:#be123c;">${SITE_URL.replace('https://', '')}</a></div>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td style="border-radius:10px;background:#be123c;">
<a href="${esc(href)}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(label)}</a>
</td></tr></table>`;
}

const limitsList = `<ul style="padding-left:20px;margin:8px 0 0;">
<li>${num(LIMITS.pinPacks)}টি পিন আইডিয়া প্যাক</li>
<li>${num(LIMITS.text)}টি টেক্সট রিকোয়েস্ট (আর্টিকেলও এর মধ্যে)</li>
<li>${num(LIMITS.image)}টি ইমেজ রিকোয়েস্ট</li></ul>`;

const unsubFooter = (weeklyUrl, allUrl) => `<div>এই ইমেইল বন্ধ করতে <a href="${esc(weeklyUrl)}" style="color:#be123c;">এখানে ক্লিক করুন</a>। সব PinCraft ইমেইল বন্ধ করতে <a href="${esc(allUrl)}" style="color:#be123c;">এখানে ক্লিক করুন</a>।</div>`;

// Sent by Firebase Auth (sendEmailVerification) for account confirmation. This is the Firebase template
// body that must be pasted into Firebase Console > Authentication > Templates > Email address verification.
// Firebase replaces %LINK% with the real confirmation link. The link itself is unchanged.
export function firebaseVerificationTemplate() {
  const body = `<p style="margin:0 0 12px;">নমস্কার,</p>
<p style="margin:0 0 12px;">PinCraft-এ নিবন্ধনের জন্য ধন্যবাদ। আপনার অ্যাকাউন্ট চালু করতে নিচের বোতামে ক্লিক করে ইমেইল ঠিকানাটি যাচাই করুন।</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td style="border-radius:10px;background:#be123c;">
<a href="%LINK%" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">ইমেইল যাচাই করুন</a>
</td></tr></table>
<p style="margin:0 0 8px;font-size:14px;color:#57534e;">বোতামটি কাজ না করলে এই লিংকটি ব্রাউজারে খুলুন:<br><a href="%LINK%" style="color:#be123c;word-break:break-all;">%LINK%</a></p>
<p style="margin:16px 0 0;font-size:14px;color:#57534e;">আপনি এই অনুরোধ না করে থাকলে এই ইমেইলটি উপেক্ষা করুন।</p>`;
  return layout({ preheader: 'আপনার PinCraft অ্যাকাউন্টের ইমেইল যাচাই করুন', bodyHtml: body });
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
${button(`${SITE_URL}/dashboard`, 'PinCraft খুলুন')}`,
    footerHtml: 'এই ইমেইলটি আপনার অ্যাকাউন্ট তৈরির পর একবারই পাঠানো হয়।',
  });
  return { subject: 'PinCraft-এ স্বাগতম, আপনার অ্যাকাউন্ট প্রস্তুত', html };
}

export function weeklyEmail({ name, stats, today, weeklyUrl, allUrl }) {
  const row = (label, value) => `<tr><td style="padding:10px 0;border-bottom:1px solid #f5f5f4;">${label}</td><td style="padding:10px 0;border-bottom:1px solid #f5f5f4;text-align:right;font-weight:700;">${num(value)}</td></tr>`;
  const html = layout({
    preheader: 'গত ৭ দিনে আপনার PinCraft কাজের সারাংশ',
    bodyHtml: `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">আপনার সাপ্তাহিক সারাংশ</h1>
<p style="margin:0 0 12px;">নমস্কার ${esc(name || 'বন্ধু')}, গত ৭ দিনে আপনার কাজ:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;">
${row('তৈরি পিন আইডিয়া প্যাক', stats.pinPacks)}
${row('টেক্সট রিকোয়েস্ট (আর্টিকেল সহ)', stats.text)}
${row('ইমেজ রিকোয়েস্ট', stats.image)}
${row('Pin Queue থেকে পোস্ট হওয়া পিন', stats.pinsPosted)}
</table>
<p style="margin:18px 0 4px;font-weight:700;">আজকের ব্যবহার (দৈনিক সীমা)</p>
<p style="margin:0;font-size:15px;">পিন প্যাক: ${num(today.pinPacks)} / ${num(LIMITS.pinPacks)} · টেক্সট: ${num(today.text)} / ${num(LIMITS.text)} · ইমেজ: ${num(today.image)} / ${num(LIMITS.image)}</p>
${button(`${SITE_URL}/dashboard`, 'PinCraft-এ কাজ চালিয়ে যান')}`,
    footerHtml: unsubFooter(weeklyUrl, allUrl),
  });
  return { subject: 'PinCraft: আপনার সাপ্তাহিক সারাংশ', html };
}

export function reengageEmail({ name, weeklyUrl, allUrl }) {
  const html = layout({
    preheader: 'PinCraft-এ ফিরে আসুন, নতুন পিন আইডিয়া অপেক্ষা করছে',
    bodyHtml: `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">আবার স্বাগতম, ${esc(name || 'বন্ধু')}</h1>
<p style="margin:0 0 12px;">গত ২৪ ঘণ্টায় আপনি PinCraft-এ আসেননি। আপনার প্রতিদিনের ফ্রি সীমা প্রতিদিন নতুন করে শুরু হয়, তাই আজই নতুন পিন আইডিয়া বা আর্টিকেল তৈরি করার সুযোগ আছে।</p>
${button(`${SITE_URL}/dashboard`, 'PinCraft-এ ফিরে যান')}`,
    footerHtml: unsubFooter(weeklyUrl, allUrl),
  });
  return { subject: 'PinCraft-এ ফিরে আসুন, নতুন পিন আইডিয়া অপেক্ষা করছে', html };
}

// Admin notifications are in English for quick reading on a phone. Values are escaped.
function adminLayout(title, rows) {
  const body = rows.map(([label, value]) => `<tr><td style="padding:8px 12px 8px 0;color:#57534e;vertical-align:top;">${esc(label)}</td><td style="padding:8px 0;font-weight:600;word-break:break-word;">${esc(value)}</td></tr>`).join('');
  return `<!doctype html><html><body style="margin:0;padding:16px;font-family:Arial,sans-serif;color:#1c1917;">
<h2 style="margin:0 0 12px;font-size:18px;">${esc(title)}</h2>
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:15px;">${body}</table>
<p style="margin:16px 0 0;font-size:12px;color:#78716c;">PinCraft admin notification. Sent only to the owner address.</p>
</body></html>`;
}

export function adminNewUserEmail({ email, name, registeredAt }) {
  return {
    subject: `[PinCraft] New user registered: ${email}`,
    html: adminLayout('New user registered', [
      ['Email', email], ['Name', name || '—'], ['Registered (Dhaka)', registeredAt],
    ]),
  };
}

export function adminPaymentEmail({ amount, method, transactionLast4, payerLast3, email, submittedAt }) {
  return {
    subject: `[PinCraft] Payment request ৳${amount} via ${method}`,
    html: adminLayout('Payment request submitted', [
      ['Amount', `BDT ${amount}`], ['Method', method], ['Transaction ref (last 4)', transactionLast4],
      ['Payer number (last 3)', payerLast3], ['Account email', email || '—'], ['Submitted (Dhaka)', submittedAt],
      ['Review', 'Approve or reject in the admin site (Billing review). Full reference is kept encrypted.'],
    ]),
  };
}
