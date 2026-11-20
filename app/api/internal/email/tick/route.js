import { apiError, json } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { AutomationError } from '@/lib/automation/errors.mjs';
import { cronSecret } from '@/lib/email/config.mjs';
import { sendPending } from '@/lib/email/outbox.mjs';
import { sendGmail } from '@/lib/email/gmail.mjs';
import { loadGmailRefreshToken } from '@/lib/email/gmail-store.mjs';
import { htmlForSend } from '@/lib/email/verification.mjs';
import { firebaseAuth } from '@/lib/firebase/admin.mjs';
import { applyPlan, planEmails } from '@/lib/email/planner.mjs';
import { timingSafeEqual } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Scheduled caller: an external cron job presenting EMAIL_CRON_SECRET as a bearer token.
// Browser cookies cannot authorise this route. Without the secret configured, the route refuses every request.
function authorised(request) {
  const expected = cronSecret();
  if (!expected) return false;
  const actual = request.headers.get('authorization') || '';
  const want = Buffer.from(`Bearer ${expected}`);
  const got = Buffer.from(actual);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function POST(request) {
  try {
    if (!authorised(request)) throw new AutomationError('unauthorised', 'Not authorised.', { status: 401 });
    const db = getDatabase();
    const now = Date.now();
    const plan = await planEmails(db, now);
    const queued = await applyPlan(db, plan, now);
    // Sends only when the Dream Boost Gmail grant is connected. Otherwise messages wait in the outbox.
    const refreshToken = await loadGmailRefreshToken(db);
    // Verify rows get a fresh Firebase link at send time (see verification.mjs). Other rows send their stored html.
    const sender = refreshToken ? async row => {
      const html = await htmlForSend(row, { auth: firebaseAuth() });
      return sendGmail({ refreshToken, to: row.to, subject: row.subject, html });
    } : null;
    const delivery = await sendPending(db, { now, sender });
    return json({
      ok: true,
      planned: {
        admin: plan.admin.length, payments: plan.payments.length, welcome: plan.welcome.length,
        weekly: plan.weekly.length, reengage: plan.reengage.length,
      },
      queued,
      delivery,
      skipped: plan.skipped,
    });
  } catch (error) {
    return apiError(error);
  }
}
