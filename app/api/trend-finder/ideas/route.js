import { apiError, json, readBody, sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { validJobId } from '@/lib/automation/images.mjs';
import { archiveDraft, draftInput } from '@/lib/automation/drafts.mjs';
import { AutomationError } from '@/lib/automation/errors.mjs';
import { managedText } from '@/lib/ai/managed-text.mjs';
import { requestFingerprint } from '@/lib/ai/usage.mjs';
import { publicGeneration } from '@/lib/ai/public.mjs';
import { trendIdeasTask } from '@/lib/ai/trend-ideas.mjs';
import { TREND_FINDER_REGION_CODES, findTrendInSnapshot, snapshotIsFresh, trendRegionLabel } from '@/lib/trend-finder/core.mjs';
import { readTrendConsent } from '@/lib/trend-finder/consent.mjs';
import { recentTrendSnapshots } from '@/lib/trend-finder/service.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  try {
    const user = await sessionUser(request, true);
    const body = await readBody(request, 2_000);
    const allowed = new Set(['task', 'requestKey', 'consent', 'region', 'trendId', 'language']);
    if (Object.keys(body).some(key => !allowed.has(key)) || body.task !== 'trend_ideas' || body.consent !== true || !validJobId(body.requestKey) || !TREND_FINDER_REGION_CODES.includes(body.region) || typeof body.trendId !== 'string' || !/^[a-f0-9]{64}$/.test(body.trendId) || !['en', 'bn'].includes(body.language || 'en')) {
      throw new AutomationError('invalid_ai_request', 'Choose a current trend, output language and unique request key, and confirm AI usage.');
    }

    const db = getDatabase();
    // The browser's checkbox is not enough on its own: the account must have a stored, current consent.
    const consent = await readTrendConsent(db, user.id);
    if (!consent.accepted) throw new AutomationError('ai_consent_required', 'Confirm the AI-use notice in Trend Finder before generating ideas.', { status: 403 });
    const [snapshot] = await recentTrendSnapshots(db, 1);
    if (!snapshot) throw new AutomationError('trend_snapshot_unavailable', 'A daily Google Trends snapshot is not available yet. No sample trends were substituted.', { status: 503, retryable: true });
    if (!snapshotIsFresh(snapshot, Date.now())) throw new AutomationError('trend_snapshot_stale', 'The latest daily trend snapshot is older than 48 hours. Refresh trend collection before generating ideas.', { status: 503, retryable: true });
    const trend = findTrendInSnapshot(snapshot, body.region, body.trendId);
    if (!trend) throw new AutomationError('trend_selection_expired', 'This trend is not in the latest snapshot. Reload the trend list and choose a current item.', { status: 409 });

    const language = body.language || 'en';
    const task = 'trend_ideas';
    const fingerprint = requestFingerprint({ task, region: body.region, trendId: trend.id, language });
    const result = await managedText(db, user.id, {
      requestKey: body.requestKey.toLowerCase(),
      task,
      fingerprint,
      ...trendIdeasTask({ trend: trend.title, region: trendRegionLabel(body.region), language }),
    });
    const generation = publicGeneration(result.generation);
    if (!generation || !result.result) throw new AutomationError('invalid_content', 'The AI ideas could not be confirmed. No substitute content was presented.', { status: 502 });
    let library = { saved: false };
    try {
      const content = { historyType: 'trend_ideas', title: `${result.result.trend} Pin ideas`, topic: result.result.trend, category: `Trend Finder · ${result.result.region}`, region: result.result.region, trendId: trend.id, language, result: result.result, generation, description: result.result.note };
      const draft = draftInput({ action: 'archive', kind: 'history', requestKey: result.requestKey, content });
      library = { saved: true, id: await archiveDraft(db, user.id, draft) };
    } catch {
      // Keep the verified ideas visible; the browser can retry the same
      // idempotent Library archive without another AI request.
    }
    return json({ task, requestKey: result.requestKey, result: result.result, generation, library, ...(result.replayed === true ? { replayed: true } : {}) });
  } catch (error) {
    const issue = error?.code === 'setup_required' ? new AutomationError('trend_storage_unavailable', 'Daily trend data is temporarily unavailable. No sample trends were substituted.', { status: 503, retryable: true }) : error;
    return apiError(issue);
  }
}
