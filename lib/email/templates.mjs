import { LIMITS, LOGO_URL, SITE_URL, SUPPORT_URL } from './config.mjs';

export const esc = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const bn = value => String(value ?? '').replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[Number(d)]);
const num = value => bn(Number(value || 0).toLocaleString('en-US'));
const numEn = value => Number(value || 0).toLocaleString('en-US');
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

const signOff = '<p style="margin:22px 0 0;">Thanks,<br><strong>PinCraft Team</strong></p>';

const limitsList = `<ul style="padding-left:20px;margin:8px 0 0;">
<li>${numEn(LIMITS.pinPacks)} pin idea packs</li>
<li>${numEn(LIMITS.text)} text requests (articles included)</li>
<li>${numEn(LIMITS.image)} image requests</li></ul>`;

const unsubFooter = (weeklyUrl, allUrl) => `<div>To stop these emails, <a href="${esc(weeklyUrl)}" style="color:#be123c;">click here</a>. To stop all PinCraft emails, <a href="${esc(allUrl)}" style="color:#be123c;">click here</a>.</div>`;

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
  const first = esc(name || 'friend');
  const html = layout({
    preheader: 'Welcome to PinCraft. Your daily free limits and how to get started',
    bodyHtml: `<h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;">Welcome, ${first}!</h1>
<p style="margin:0 0 12px;">Your email is verified and your PinCraft account is ready. With PinCraft you can use AI to create pin ideas, articles and images, and arrange pins in the Pin Queue.</p>
<p style="margin:16px 0 4px;font-weight:700;">Your daily free limits</p>
${limitsList}
<p style="margin:12px 0 0;font-size:14px;color:#57534e;">These limits reset every day at midnight Bangladesh time (12:00 am).</p>
${button(`${SITE_URL}/dashboard`, 'Open PinCraft')}
<p style="margin:0;">If you need any help getting started, contact us on Telegram.</p>
${signOff}`,
    footerExtra: '<div>This email is sent only once, after your email is verified.</div>',
    lang: 'en',
  });
  return { subject: 'Welcome to PinCraft, your account is ready', html };
}

export function weeklyEmail({ name, stats, today, weeklyUrl, allUrl }) {
  const row = (label, value) => `<tr><td style="padding:10px 0;border-bottom:1px solid #f5f5f4;">${label}</td><td style="padding:10px 0;border-bottom:1px solid #f5f5f4;text-align:right;font-weight:700;">${numEn(value)}</td></tr>`;
  const html = layout({
    preheader: 'Your PinCraft work summary for the last 7 days',
    bodyHtml: `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">Your weekly summary</h1>
<p style="margin:0 0 12px;">Hi ${esc(name || 'friend')}, here is your PinCraft work for the last 7 days:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;">
${row('Pin idea packs created', stats.pinPacks)}
${row('Text requests (including articles)', stats.text)}
${row('Image requests', stats.image)}
${row('Pins posted from Pin Queue', stats.pinsPosted)}
</table>
<p style="margin:18px 0 4px;font-weight:700;">Today's usage (daily limits)</p>
<p style="margin:0;font-size:15px;">Pin packs: ${numEn(today.pinPacks)} / ${numEn(LIMITS.pinPacks)} · Text: ${numEn(today.text)} / ${numEn(LIMITS.text)} · Images: ${numEn(today.image)} / ${numEn(LIMITS.image)}</p>
${button(`${SITE_URL}/dashboard`, 'Continue working on PinCraft')}
${signOff}`,
    footerExtra: unsubFooter(weeklyUrl, allUrl),
    lang: 'en',
  });
  return { subject: 'PinCraft: your weekly summary', html };
}

export function reengageEmail({ name, weeklyUrl, allUrl }) {
  const html = layout({
    preheader: 'Come back to PinCraft, new pin ideas are waiting',
    bodyHtml: `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">Welcome back, ${esc(name || 'friend')}</h1>
<p style="margin:0 0 12px;">You haven't visited PinCraft in the last 24 hours. Your daily free limits reset every day, so you can create new pin ideas or articles today.</p>
${button(`${SITE_URL}/dashboard`, 'Go back to PinCraft')}
${signOff}`,
    footerExtra: unsubFooter(weeklyUrl, allUrl),
    lang: 'en',
  });
  return { subject: 'Come back to PinCraft, new pin ideas are waiting', html };
}

// Admin notifications (owner only). Bengali, same logo header. Values are escaped and never altered.
function adminLayout(title, intro, rows, note) {
  const body = rows.map(([label, value]) => `<tr><td style="padding:8px 12px 8px 0;color:#57534e;vertical-align:top;">${esc(label)}</td><td style="padding:8px 0;font-weight:600;word-break:break-word;">${esc(value)}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:16px;background:#f5f5f4;font-family:Arial,sans-serif;color:#1c1917;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
${header()}
<tr><td style="padding:24px 28px;">
<h2 style="margin:0 0 8px;font-size:19px;">${esc(title)}</h2>
<p style="margin:0 0 14px;color:#57534e;font-size:15px;">${esc(intro)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:15px;">${body}</table>
<p style="margin:16px 0 0;font-size:14px;color:#57534e;">${esc(note)}</p>
${signOff}
</td></tr>
${footer('<div>This is a PinCraft admin notification. It is sent only to the owner\'s email.</div>', 'en')}
</table>
</body></html>`;
}

export function adminNewUserEmail({ email, name, registeredAt }) {
  return {
    subject: `[PinCraft] New user registered: ${email}`,
    html: adminLayout(
      'New user registered',
      'A new account has been created.',
      [['Email', email], ['Name', name || '—'], ['Registered at (Dhaka)', registeredAt]],
      'Open the admin site for details.',
    ),
  };
}

export function adminPaymentEmail({ amount, method, transactionLast4, payerLast3, email, submittedAt }) {
  return {
    subject: `[PinCraft] Payment request ৳${amount} via ${method}`,
    html: adminLayout(
      'New payment request submitted',
      'A payment request is waiting for review.',
      [
        ['Amount', `BDT ${amount}`], ['Method', method], ['Transaction reference (last 4 characters)', transactionLast4],
        ['Payer number (last 3 digits)', payerLast3], ['Account email', email || '—'], ['Submitted at (Dhaka)', submittedAt],
      ],
      'Approve or reject it from Billing review on the admin site. The full reference is stored encrypted.',
    ),
  };
}
