import { apiError, json, readBody } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { AutomationError } from '@/lib/automation/errors.mjs';
import { collectDailyTrendSnapshot } from '@/lib/trend-finder/service.mjs';
import { verifyTrendWorkload } from '@/lib/trend-finder/workload.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  try {
    // Only the pinned public main-branch GitHub Actions workflow and matching
    // production deployment SHA can invoke this scheduled, non-publishing job.
    await verifyTrendWorkload(request.headers.get('authorization'));
    const body = await readBody(request, 128);
    if (Object.keys(body).length) throw new AutomationError('invalid_request', 'Daily trend collection accepts no user-supplied trends or settings.');
    const result = await collectDailyTrendSnapshot({ db: getDatabase() });
    return json({ ok: true, ...result });
  } catch (error) {
    const issue = error?.code === 'setup_required' ? new AutomationError('trend_storage_unavailable', 'Daily trend storage is not available yet.', { status: 503, retryable: true }) : error;
    return apiError(issue);
  }
}
