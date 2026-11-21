import { requireTelegramVerified } from '@/lib/showcase/gate.mjs';
import { apiError, json, readBody, sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { AutomationError } from '@/lib/automation/errors.mjs';
import {
  consumePinterestRateLimit,
  confirmPinterestSaved,
  listPinterestJobs,
  markPinterestOpened,
  markPinterestPublished,
  preparePinterestJob,
  retryPinterestValidation,
  savePinterestSettings,
} from '@/lib/publishing/pinterest-workflow.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const exactKeys = (body, keys) => Object.keys(body).every(key => keys.includes(key));

export async function GET(request) {
  try {
    const user = await sessionUser(request);
    return json(await listPinterestJobs(getDatabase(), user.id));
  } catch (error) {
    // Return actionable categories, never raw database messages or index URLs.
    if ([9, '9', 'failed-precondition'].includes(error?.code) && /index/i.test(error?.message || '')) {
      return apiError(new AutomationError('pin_jobs_index_required', 'The private Pin jobs index is not ready. The site owner must finish its database index setup; no job count or empty result has been assumed.', { status: 503, retryable: true }));
    }
    return apiError(error);
  }
}

export async function POST(request) {
  try {
    const user = await sessionUser(request, true);
    await requireTelegramVerified(getDatabase(), user.id);
    const body = await readBody(request, 1000000);
    if (!exactKeys(body, ['action', 'requestId', 'title', 'description', 'destinationURL', 'imageDataUrl', 'consent', 'rememberDestination', 'jobId', 'confirmedSaved', 'pinURL', 'confirmedPublic', 'defaultDestinationURL'])) {
      throw new AutomationError('invalid_pin_request', 'The Pinterest workflow request contains unsupported fields.');
    }
    const db = getDatabase();
    if (body.action === 'prepare') {
      await consumePinterestRateLimit(db, user.id, 'prepare');
      const result = await preparePinterestJob(db, user.id, body);
      return json(result, result.duplicate ? 200 : 201);
    }
    if (body.action === 'settings') {
      if (!exactKeys(body, ['action', 'defaultDestinationURL'])) throw new AutomationError('invalid_pin_settings', 'Only your private default destination URL can be saved.');
      await consumePinterestRateLimit(db, user.id, 'settings');
      return json(await savePinterestSettings(db, user.id, body));
    }
    if (typeof body.jobId !== 'string' || !exactKeys(body, ['action', 'jobId', ...(body.action === 'confirm' ? ['confirmedSaved'] : body.action === 'published' ? ['pinURL', 'confirmedPublic'] : [])])) {
      throw new AutomationError('invalid_pin_request', 'Select one of your saved Pin jobs and send only the action details it needs.');
    }
    await consumePinterestRateLimit(db, user.id, 'transition');
    if (body.action === 'opened') return json(await markPinterestOpened(db, user.id, body.jobId));
    if (body.action === 'confirm') return json(await confirmPinterestSaved(db, user.id, body.jobId, { action: body.action, confirmedSaved: body.confirmedSaved }));
    if (body.action === 'published') return json(await markPinterestPublished(db, user.id, body.jobId, { action: body.action, pinURL: body.pinURL, confirmedPublic: body.confirmedPublic }));
    if (body.action === 'retry') return json(await retryPinterestValidation(db, user.id, body.jobId, { action: body.action }));
    throw new AutomationError('not_found', 'Pinterest workflow action not found.', { status: 404 });
  } catch (error) { return apiError(error); }
}
