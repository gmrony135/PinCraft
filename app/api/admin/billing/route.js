import { apiError, json, readBody, sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { adminBilling, savePlan, reviewPayment } from '@/lib/billing/repository.mjs';
import { AutomationError } from '@/lib/automation/errors.mjs';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic'; export const maxDuration = 30;
export async function GET(request) { try { return json(await adminBilling(getDatabase(), await sessionUser(request))); } catch (issue) { return apiError(issue); } }
export async function POST(request) {
  try { const user = await sessionUser(request, true), body = await readBody(request), db = getDatabase();
    if (body.action === 'plan') await savePlan(db, user, body);
    else if (['approve', 'reject'].includes(body.action)) await reviewPayment(db, user, body);
    else throw new AutomationError('invalid_action', 'Choose a billing administration action.');
    return json(await adminBilling(db, user));
  } catch (issue) { return apiError(issue); }
}
