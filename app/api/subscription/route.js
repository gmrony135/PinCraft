import { apiError, json, readBody, sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { billingStatus, planStatus, submitPayment } from '@/lib/billing/repository.mjs';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic'; export const maxDuration = 30;
export async function GET(request) { try { const user = await sessionUser(request); return json(await billingStatus(getDatabase(), user)); } catch (issue) { return apiError(issue); } }
export async function POST(request) { try { const user = await sessionUser(request, true), body = await readBody(request), db = getDatabase(), receipt = await submitPayment(db, user.id, body); return json({ ...await billingStatus(db, user), receipt }, 202); } catch (issue) { return apiError(issue); } }
