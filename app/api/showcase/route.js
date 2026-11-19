import { apiError, json, readBody, sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { confirmJoin, readJoinStatus } from '@/lib/showcase/joins.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Only the signed-in owner of a record can read or update it (UID comes from the verified session).
export async function GET(request) {
  try {
    const user = await sessionUser(request);
    return json(await readJoinStatus(getDatabase(), user.id));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request) {
  try {
    const user = await sessionUser(request, true);
    const body = await readBody(request, 512);
    return json(await confirmJoin(getDatabase(), user.id, body.channel));
  } catch (error) {
    return apiError(error);
  }
}
