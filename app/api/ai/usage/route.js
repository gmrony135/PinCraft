import { apiError, json, sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { aiUsage } from '@/lib/ai/usage.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  try { const user = await sessionUser(request); return json(await aiUsage(getDatabase(), user.id)); }
  catch (error) { return apiError(error); }
}
