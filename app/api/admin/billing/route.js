// Owner-only payment review. Lists real pending requests and records each approve/reject decision.
// Plan pricing and public payment collection are not changed here (publicPlan stays disabled).
import { apiError, json, readBody, sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { adminBilling, reviewPayment } from '@/lib/billing/repository.mjs';
import { AutomationError } from '@/lib/automation/errors.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request) {
  try { return json(await adminBilling(getDatabase(), await sessionUser(request))); } catch (issue) { return apiError(issue); }
}

export async function POST(request) {
  try {
    const user = await sessionUser(request, true), body = await readBody(request), db = getDatabase();
    if (!['approve', 'reject'].includes(body.action)) throw new AutomationError('invalid_action', 'Choose Approve or Reject.');
    await reviewPayment(db, user, { id: body.id, action: body.action, confirmWalletReceipt: body.confirmWalletReceipt, note: body.note });
    return json(await adminBilling(db, user));
  } catch (issue) { return apiError(issue); }
}
