import { apiError, json, readBody, sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { AutomationError } from '@/lib/automation/errors.mjs';
import { readTrendConsent, writeTrendConsent } from '@/lib/trend-finder/consent.mjs';
import { TREND_AI_NOTICE_VERSION } from '@/lib/trend-finder/notice.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const storageError = error => error?.code === 'setup_required' ? new AutomationError('trend_storage_unavailable', 'Trend consent storage is temporarily unavailable. Your choice was not saved.', { status: 503, retryable: true }) : error;

export async function GET(request) {
  try {
    const user = await sessionUser(request);
    return json({ consent: await readTrendConsent(getDatabase(), user.id) });
  } catch (error) {
    return apiError(storageError(error));
  }
}

export async function POST(request) {
  try {
    const user = await sessionUser(request, true);
    const body = await readBody(request, 500);
    const allowed = new Set(['accepted', 'noticeVersion']);
    if (Object.keys(body).some(key => !allowed.has(key)) || typeof body.accepted !== 'boolean' || body.noticeVersion !== TREND_AI_NOTICE_VERSION) {
      throw new AutomationError('invalid_request', 'Confirm the current AI-use notice before saving this choice.');
    }
    return json({ consent: await writeTrendConsent(getDatabase(), user.id, body.accepted) });
  } catch (error) {
    return apiError(storageError(error));
  }
}
