import { apiError, json } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { AutomationError } from '@/lib/automation/errors.mjs';
import { publicTrendReport } from '@/lib/trend-finder/core.mjs';
import { recentTrendSnapshots } from '@/lib/trend-finder/service.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshots = await recentTrendSnapshots(getDatabase(), 2);
    return json(publicTrendReport(snapshots[0] || null, snapshots[1] || null, Date.now()));
  } catch (error) {
    const issue = error?.code === 'setup_required' ? new AutomationError('trend_storage_unavailable', 'Daily trend data is temporarily unavailable. No sample trends were substituted.', { status: 503, retryable: true }) : error;
    return apiError(issue);
  }
}
