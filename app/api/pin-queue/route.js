import { requireTelegramVerified } from '@/lib/showcase/gate.mjs';
import { apiError, json, readBody, sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { addPin, listQueue, markPosted, removePin } from '@/lib/pin-queue/queue.mjs';
import { AutomationError } from '@/lib/automation/errors.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const user = await sessionUser(request);
    return json(await listQueue(getDatabase(), user.id));
  } catch (error) {
    return apiError(error);
  }
}

// Body: { action: 'add', title, description, link, imageUrl } | { action: 'posted', id } | { action: 'remove', id }
export async function POST(request) {
  try {
    const user = await sessionUser(request, true);
    const body = await readBody(request, 8000);
    const db = getDatabase();
    if (['add', 'posted'].includes(body.action)) await requireTelegramVerified(db, user.id);
    if (body.action === 'add') return json(await addPin(db, user.id, body));
    if (body.action === 'posted') return json(await markPosted(db, user.id, body.id));
    if (body.action === 'remove') return json(await removePin(db, user.id, body.id));
    throw new AutomationError('invalid_request', 'Unknown action.', { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}
