import 'server-only';
import { requestData } from '../automation/http.mjs';
import { transaction } from '../automation/db.mjs';
import { AutomationError } from '../automation/errors.mjs';
import { googleNewsSearchUrl, NICHE_TOPICS_PER_REGION, parseGoogleNewsRSS, parseGoogleTrendsRSS, snapshotHasNiches, TREND_FINDER_REGIONS, TREND_NICHES, TREND_SNAPSHOT_COLLECTION, snapshotCounts, utcSnapshotDate } from './core.mjs';

// Each niche query is best-effort: a failed query never blocks the trending
// snapshot. The first query is the direct niche match; later queries only fill
// gaps and are labelled as closest related topics.
export async function fetchNicheTopics(region, { send = requestData } = {}) {
  const niches = {};
  await Promise.all(TREND_NICHES.map(async niche => {
    const results = await Promise.all(niche.queries.map(async (query, index) => {
      try {
        const xml = await send(googleNewsSearchUrl(region, query), {
          provider: 'Google News RSS',
          format: 'text',
          headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
          contentTypes: ['application/rss+xml', 'application/xml', 'text/xml'],
          timeout: 15_000,
          maxBytes: 256_000,
        });
        return { index, items: parseGoogleNewsRSS(xml, region, niche.key) };
      } catch {
        return { index, items: [] };
      }
    }));
    const seen = new Set();
    const items = [];
    for (const result of results.sort((a, b) => a.index - b.index)) {
      for (const item of result.items) {
        if (items.length >= NICHE_TOPICS_PER_REGION || seen.has(item.id)) continue;
        seen.add(item.id);
        items.push({ ...item, matchType: result.index === 0 ? 'matches_niche' : 'closest_related' });
      }
    }
    const direct = results[0]?.items.length > 0;
    niches[niche.key] = {
      label: niche.label,
      status: items.length === 0 ? 'unavailable' : direct ? 'ready' : 'closest_related',
      items,
    };
  }));
  return niches;
}

async function fetchAllNicheTopics({ send = requestData } = {}) {
  const regions = await Promise.all(TREND_FINDER_REGIONS.map(async region => [region.code, await fetchNicheTopics(region.code, { send })]));
  return Object.fromEntries(regions);
}

export async function fetchDailyTrendSnapshot({ send = requestData, now = new Date() } = {}) {
  const capturedAt = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (!Number.isFinite(capturedAt.getTime())) throw new AutomationError('invalid_snapshot_date', 'A valid snapshot time is required.');
  const [regions, niches] = await Promise.all([
    Promise.all(TREND_FINDER_REGIONS.map(async region => {
      const xml = await send(region.sourceUrl, {
        provider: 'Google Trends RSS',
        format: 'text',
        headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
        contentTypes: ['application/rss+xml', 'application/xml', 'text/xml'],
        timeout: 15_000,
        maxBytes: 256_000,
      });
      return [region.code, { items: parseGoogleTrendsRSS(xml, region.code) }];
    })),
    fetchAllNicheTopics({ send }),
  ]);
  const merged = Object.fromEntries(regions.map(([code, row]) => [code, { ...row, niches: niches[code] }]));
  return {
    snapshotDate: utcSnapshotDate(capturedAt),
    capturedAt,
    source: 'Google Trends Trending Now RSS; Google News RSS niche topics',
    regions: merged,
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
    // A snapshot saved before niche topics existed gets them added once, without
    // changing its trending items. An all-empty niche result is not saved, so the
    // next scheduled run retries.
    if (!snapshotHasNiches(stored)) {
      const niches = await fetchAllNicheTopics({ send });
      const hasTopics = Object.values(niches).some(regionNiches => Object.values(regionNiches).some(niche => niche.items.length > 0));
      if (hasTopics) {
        const regions = Object.fromEntries(TREND_FINDER_REGIONS.map(region => [region.code, { ...(stored?.regions?.[region.code] || {}), niches: niches[region.code] }]));
        await ref.set({ regions }, { merge: true });
        return { outcome: 'already_collected', snapshotDate, capturedAt: stored?.capturedAt || null, counts: snapshotCounts(stored), nicheTopics: 'added' };
      }
      return { outcome: 'already_collected', snapshotDate, capturedAt: stored?.capturedAt || null, counts: snapshotCounts(stored), nicheTopics: 'unavailable' };
    }
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
