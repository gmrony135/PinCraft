import { apiError, json, readBody } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { AutomationError } from '@/lib/automation/errors.mjs';
import { claimPinterestDelivery, runPinterestValidationWorker, verifyPinterestWorkload } from '@/lib/publishing/pinterest-workload.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

export async function POST(request) {
  try {
    // Only the exact public main-branch GitHub Actions workflow can perform a
    // bounded audit. It never receives user cookies, Pinterest credentials,
    // board IDs, Pin content or publishing instructions.
    const identity = await verifyPinterestWorkload(request.headers.get('authorization'));
    const body = await readBody(request, 128);
    if (Object.keys(body).length) throw new AutomationError('invalid_request', 'Pinterest validation accepts no injected jobs, content or user settings.');
    const db = getDatabase();
    await claimPinterestDelivery(db, identity);
    return json({ ok: true, ...(await runPinterestValidationWorker(db, { limit: 10, deadlineMs: 45000 })) });
  } catch (error) { return apiError(error); }
}
