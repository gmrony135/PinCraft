import { apiError, json, readBody, sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { generatePinPostInfo } from '@/lib/ai/pin-post-info.mjs';
import { publicAIResult } from '@/lib/ai/public.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  try {
    const user = await sessionUser(request, true);
    const input = await readBody(request, 1000000);
    return json(publicAIResult(await generatePinPostInfo(getDatabase(), user.id, input)));
  } catch (error) { return apiError(error); }
}
