import { apiError, json, readBody, sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { aiInput } from '@/lib/ai/tasks.mjs';
import { generateForUser } from '@/lib/ai/service.mjs';
import { publicAIResult } from '@/lib/ai/public.mjs';
import { trendContextFor } from '@/lib/ai/trend-context.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
export async function POST(request) {
  try {
    const user = await sessionUser(request, true);
    const input = aiInput(await readBody(request, 64000));
    const db = getDatabase();
    // Current trends are inspiration only for Pin and Article text. Failures are silent: no trend, no change.
    const trendContext = ['pin', 'article'].includes(input.task) ? await trendContextFor(db, input) : null;
    return json(publicAIResult(await generateForUser(db, user.id, input, trendContext ? { trendContext } : {})));
  } catch (error) { return apiError(error); }
}
