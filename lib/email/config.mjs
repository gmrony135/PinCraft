// PinCraft email configuration. Secrets come only from server environment variables or the encrypted
// Firestore grant (email_system/gmail). Sending uses the Gmail API as the Dream Boost account.
// Until that account is connected, nothing is sent: messages wait in email_outbox and expire after OUTBOX_TTL_MS.

export const SITE_URL = 'https://pincraftly.vercel.app';
export const LOGO_URL = `${SITE_URL}/brand/pincraft-mark-red-160.png`;
export const ADMIN_NOTIFY_EMAIL = 'gmrony135@gmail.com';
export const SUPPORT_URL = 'https://t.me/gmrony_12';

// Emails are only queued for accounts created on or after this moment.
// Earlier accounts never receive a launch-day welcome or admin alert.
export const EMAIL_LAUNCH_AT = Date.parse('2026-11-20T00:00:00Z');

// Free-plan daily limits, same values as PinCraft (lib/free-plan.mjs and lib/ai/config.mjs).
export const LIMITS = Object.freeze({ pinPacks: 20, text: 150, image: 20 });

export const OUTBOX_TTL_MS = 48 * 3600000;
export const REENGAGE_MIN_LAPSE_MS = 24 * 3600000;   // no visit for at least 24 hours
export const REENGAGE_MAX_LAPSE_MS = 7 * 86400000;   // users lapsed longer than this are not emailed
export const REENGAGE_SPACING_MS = 24 * 3600000;     // at most one re-engagement email per 24 hours
export const VISIT_WRITE_SPACING_MS = 10 * 60000;    // visit timestamp written at most every 10 minutes

// Sender: the Dream Boost Gmail account. Never the owner's personal address.
export const SENDER_EMAIL = 'dream.boost154@gmail.com';
export const SENDER_NAME = 'PinCraft';
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
// Must be registered as an authorised redirect URI on the existing Google OAuth client.
export const GMAIL_REDIRECT_URI = `${SITE_URL}/api/internal/gmail/callback`;

// Existing PinCraft Google OAuth client (the same one the Blogger connection uses).
export function gmailOAuthClient(env = process.env) {
  return { clientId: String(env.GOOGLE_CLIENT_ID || '').trim(), clientSecret: String(env.GOOGLE_CLIENT_SECRET || '').trim() };
}

export function unsubscribeSecret(env = process.env) {
  return String(env.EMAIL_UNSUBSCRIBE_SECRET || '').trim();
}

export function cronSecret(env = process.env) {
  return String(env.EMAIL_CRON_SECRET || '').trim();
}
