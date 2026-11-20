import { apiError, json, sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { recordVisit } from '@/lib/email/planner.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Signed-in pages call this to record the last visit. Used only for the re-engagement and weekly emails.
export async function POST(request) {
  try {
    const user = await sessionUser(request, true);
    const result = await recordVisit(getDatabase(), user.id);
    return json({ ok: true, result });
  } catch (error) {
    return apiError(error);
  }
}
