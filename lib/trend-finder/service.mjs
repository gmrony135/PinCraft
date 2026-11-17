import 'server-only';
import { requestData } from '../automation/http.mjs';
import { transaction } from '../automation/db.mjs';
import { AutomationError } from '../automation/errors.mjs';
import { parseGoogleTrendsRSS, TREND_FINDER_REGIONS, TREND_SNAPSHOT_COLLECTION, snapshotCounts, utcSnapshotDate } from './core.mjs';

export async function fetchDailyTrendSnapshot({ send = requestData, now = new Date() } = {}) {
  const capturedAt = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (!Number.isFinite(capturedAt.getTime())) throw new AutomationError('invalid_snapshot_date', 'A valid snapshot time is required.');
  const regions = await Promise.all(TREND_FINDER_REGIONS.map(async region => {
    const xml = await send(region.sourceUrl, {
      provider: 'Google Trends RSS',
      format: 'text',
      headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
      contentTypes: ['application/rss+xml', 'application/xml', 'text/xml'],
      timeout: 15_000,
      maxBytes: 256_000,
    });
    return [region.code, { items: parseGoogleTrendsRSS(xml, region.code) }];
  }));
  return {
    snapshotDate: utcSnapshotDate(capturedAt),
    capturedAt,
    source: 'Google Trends Trending Now RSS',
    regions: Object.fromEntries(regions),
  };
}

export async function collectDailyTrendSnapshot({ db, send = requestData, now = new Date() } = {}) {
  if (!db?.collection || typeof db.runTransaction !== 'function') throw new AutomationError('setup_required', 'Daily trend storage is not available yet.', { status: 503 });
  const capturedAt = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  const snapshotDate = utcSnapshotDate(capturedAt);
  const ref = db.collection(TREND_SNAPSHOT_COLLECTION).doc(snapshotDate);
  const existing = await ref.get();
  if (existing.exists) {
    const stored = existing.data();
    return { outcome: 'already_collected', snapshotDate, capturedAt: stored?.capturedAt || null, counts: snapshotCounts(stored) };
  }

  // The three regions are fetched and validated together. A failed/empty region
  // never creates a partial daily snapshot or replaces earlier data.
  const snapshot = await fetchDailyTrendSnapshot({ send, now: capturedAt });
  const created = await transaction(db, async tx => {
    const current = await tx.get(ref);
    if (current.exists) return false;
    tx.create(ref, snapshot);
    return true;
  });
  const stored = created ? snapshot : (await ref.get()).data();
  return {
    outcome: created ? 'collected' : 'already_collected',
    snapshotDate,
    capturedAt: stored?.capturedAt || capturedAt,
    counts: snapshotCounts(stored),
  };
}

export async function recentTrendSnapshots(db, count = 2) {
  if (!db?.collection) throw new AutomationError('setup_required', 'Daily trend storage is not available yet.', { status: 503 });
  const limit = Number.isInteger(count) ? Math.min(2, Math.max(1, count)) : 2;
  try {
    const result = await db.collection(TREND_SNAPSHOT_COLLECTION).orderBy('snapshotDate', 'desc').limit(limit).get();
    return result.docs.map(doc => doc.data()).filter(row => row && typeof row.snapshotDate === 'string').sort((a, b) => b.snapshotDate.localeCompare(a.snapshotDate));
  } catch {
    throw new AutomationError('trend_storage_unavailable', 'Trend snapshots could not be loaded right now. Please try again later.', { status: 503, retryable: true });
  }
}
