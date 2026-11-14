import { apiError, json, readBody, sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { aiInput } from '@/lib/ai/tasks.mjs';
import { generateForUser } from '@/lib/ai/service.mjs';
import { publicAIResult } from '@/lib/ai/public.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(request) {
  try {
    const user = await sessionUser(request, true);
    const input = aiInput(await readBody(request, 64000));
    return json(publicAIResult(await generateForUser(getDatabase(), user.id, input)));
  } catch (error) { return apiError(error); }
}
