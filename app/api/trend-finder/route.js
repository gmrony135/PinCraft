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
    const next = new Date();next.setUTCHours(6,43,0,0);if(next.getTime()<=Date.now())next.setUTCDate(next.getUTCDate()+1);
    return json({...publicTrendReport(snapshots[0] || null, snapshots[1] || null, Date.now()),collectionSchedule:{cron:'43 6 * * *',timezone:'UTC',nextScheduledAt:next.toISOString(),status:'Scheduled time only; execution is not confirmed until a snapshot is stored.'}});
  } catch (error) {
    const issue = error?.code === 'setup_required' ? new AutomationError('trend_storage_unavailable', 'Daily trend data is temporarily unavailable. No sample trends were substituted.', { status: 503, retryable: true }) : error;
    return apiError(issue);
  }
}
