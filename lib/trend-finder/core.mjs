import { createHash } from 'node:crypto';
import { AutomationError } from '../automation/errors.mjs';

export const TREND_FINDER_REGIONS = Object.freeze([
  { code: 'US', label: 'United States', sourceUrl: 'https://trends.google.com/trending/rss?geo=US' },
  { code: 'GB', label: 'United Kingdom', sourceUrl: 'https://trends.google.com/trending/rss?geo=GB' },
  { code: 'CA', label: 'Canada', sourceUrl: 'https://trends.google.com/trending/rss?geo=CA' },
]);
export const TREND_FINDER_REGION_CODES = Object.freeze(TREND_FINDER_REGIONS.map(region => region.code));
export const TREND_SNAPSHOT_COLLECTION = 'pincraft_trend_snapshots';
export const MAX_TREND_SNAPSHOT_AGE_MS = 48 * 60 * 60 * 1000;
export const ESTIMATE_METHOD = 'For the same trend in two consecutive daily snapshots, PinCraft compares the lower-bound numbers in Google Trends RSS approximate-traffic buckets: ((current bucket floor ÷ previous bucket floor) − 1) × 100, rounded to a whole percent. This coarse PinCraft estimate is not Google’s official growth percentage, exact search volume, Pinterest demand, or a reach forecast. No percentage is shown without a matching consecutive-day baseline.';

const rejectedFeed = () => new AutomationError('invalid_trends', 'The Google Trends feed format could not be confirmed. No snapshot was saved.', { retryable: true, status: 502 });
const regionInfo = code => TREND_FINDER_REGIONS.find(region => region.code === code);

export function normalizedTrendTerm(value) {
  return typeof value === 'string'
    ? value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    : '';
}

export function trendIdentity(region, term) {
  if (!TREND_FINDER_REGION_CODES.includes(region)) return null;
  const normalized = normalizedTrendTerm(term);
  return normalized ? createHash('sha256').update(`${region}\0${normalized}`).digest('hex') : null;
}

export function parseTrafficBucketFloor(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*([KMB])?\+?$/i);
  if (!match) return null;
  const multiplier = ({ K: 1e3, M: 1e6, B: 1e9 })[String(match[2] || '').toUpperCase()] || 1;
  const result = Math.floor(Number(match[1]) * multiplier);
  return Number.isSafeInteger(result) && result > 0 && result <= 1e12 ? result : null;
}

function decodeXMLText(value) {
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);)/i.test(value)) throw rejectedFeed();
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, entity => {
    const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    if (Object.hasOwn(named, entity.toLowerCase())) return named[entity.toLowerCase()];
    const raw = entity.slice(2, -1);
    const codePoint = raw[0]?.toLowerCase() === 'x' ? Number.parseInt(raw.slice(1), 16) : Number(raw);
    if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return '\uFFFD';
    return String.fromCodePoint(codePoint);
  });
}

function xmlField(block, name) {
  const pattern = new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[A-Za-z_][\\w.-]*):)?${name}\\s*>`, 'i');
  const match = block.match(pattern);
  if (!match) return '';
  const text = match[1].split(/(<!\[CDATA\[[\s\S]*?\]\]>)/g).map(piece => {
    if (piece.startsWith('<![CDATA[') && piece.endsWith(']]>')) return piece.slice(9, -3);
    return decodeXMLText(piece.replace(/<[^>]*>/g, ''));
  }).join('');
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').replace(/\s+/gu, ' ').trim();
}

export function parseGoogleTrendsRSS(xml, region) {
  if (!TREND_FINDER_REGION_CODES.includes(region)) throw new AutomationError('invalid_region', 'Choose the United States, United Kingdom or Canada.');
  if (typeof xml !== 'string' || Buffer.byteLength(xml, 'utf8') > 256_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || !/<rss\b/i.test(xml)) throw rejectedFeed();
  const blocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi)].slice(0, 40);
  const items = [];
  const seen = new Set();
  for (const match of blocks) {
    const title = xmlField(match[1], 'title').normalize('NFKC').trim();
    if (title.length < 2 || title.length > 160) continue;
    const id = trendIdentity(region, title);
    if (!id || seen.has(id)) continue;
    const trafficBucket = xmlField(match[1], 'approx_traffic');
    if (trafficBucket.length > 32) continue;
    seen.add(id);
    items.push({ id, title, trafficBucket: trafficBucket || null, trafficBucketFloor: parseTrafficBucketFloor(trafficBucket) });
  }
  if (!items.length) throw new AutomationError('trends_unavailable', 'No trend topics could be confirmed in the Google Trends RSS feed. No fixed or sample trends were substituted.', { retryable: true, status: 502 });
  return items;
}

// Niche topics come from Google News RSS search (public, no key). Google Trends
// has no public category feed, so these are news headlines, not search volume.
export const TREND_NICHES = Object.freeze([
  { key: 'home_decor', label: 'Home decor', queries: ['home decor', 'interior design'] },
  { key: 'fashion_style', label: 'Fashion style', queries: ['fashion style', 'outfit ideas'] },
  { key: 'recipe', label: 'Recipes', queries: ['recipe', 'easy dinner recipes'] },
]);
export const NICHE_TOPICS_PER_REGION = 5;
const NEWS_LOCALES = Object.freeze({ US: ['en-US', 'US:en'], GB: ['en-GB', 'GB:en'], CA: ['en-CA', 'CA:en'] });

export function googleNewsSearchUrl(region, query) {
  const locale = NEWS_LOCALES[region];
  if (!locale) throw new AutomationError('invalid_region', 'Choose the United States, United Kingdom or Canada.');
  const url = new URL('https://news.google.com/rss/search');
  url.searchParams.set('q', query);
  url.searchParams.set('hl', locale[0]);
  url.searchParams.set('gl', region);
  url.searchParams.set('ceid', locale[1]);
  return url.href;
}

export function parseGoogleNewsRSS(xml, region, nicheKey) {
  if (!TREND_FINDER_REGION_CODES.includes(region)) throw new AutomationError('invalid_region', 'Choose the United States, United Kingdom or Canada.');
  if (typeof xml !== 'string' || Buffer.byteLength(xml, 'utf8') > 256_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || !/<rss\b/i.test(xml)) throw rejectedFeed();
  const rows = [];
  const seen = new Set();
  for (const match of [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi)].slice(0, 30)) {
    const source = xmlField(match[1], 'source');
    let title = xmlField(match[1], 'title').normalize('NFKC').trim();
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
    if (title.length < 8 || title.length > 180) continue;
    const id = trendIdentity(region, `${nicheKey} ${title}`);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const published = Date.parse(xmlField(match[1], 'pubDate'));
    rows.push({ id, title, source: source.slice(0, 80) || null, publishedAt: Number.isFinite(published) ? new Date(published).toISOString() : null });
  }
  return rows;
}

export function findTrendInSnapshot(snapshot, region, trendId) {
  const row = snapshot?.regions?.[region];
  const trending = Array.isArray(row?.items) ? row.items.find(item => item?.id === trendId) : null;
  if (trending) return { ...trending, origin: 'trending' };
  for (const niche of Object.values(row?.niches || {})) {
    const hit = Array.isArray(niche?.items) ? niche.items.find(item => item?.id === trendId) : null;
    if (hit) return { ...hit, origin: 'niche', nicheLabel: niche.label || null };
  }
  return null;
}

export function snapshotHasNiches(snapshot) {
  return TREND_FINDER_REGION_CODES.every(code => snapshot?.regions?.[code]?.niches && typeof snapshot.regions[code].niches === 'object');
}

export function utcSnapshotDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new AutomationError('invalid_snapshot_date', 'A valid snapshot time is required.');
  return date.toISOString().slice(0, 10);
}

function dateStart(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}

export function hasConsecutiveDailySnapshots(currentDate, previousDate) {
  const current = dateStart(currentDate), previous = dateStart(previousDate);
  return current !== null && previous !== null && current - previous === 86_400_000;
}

function dateValue(value) {
  if (value && typeof value.toDate === 'function') value = value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function snapshotIsFresh(snapshot, now = Date.now()) {
  const captured = dateValue(snapshot?.capturedAt)?.getTime();
  const instant = now instanceof Date ? now.getTime() : Number(now);
  return Number.isFinite(captured) && Number.isFinite(instant) && captured <= instant + 5 * 60_000 && instant - captured <= MAX_TREND_SNAPSHOT_AGE_MS;
}

function estimateFor(item, previousSnapshot, consecutive) {
  if (!previousSnapshot) return { status: 'baseline_building', percent: null, comparedDate: null };
  if (!consecutive) return { status: 'snapshot_gap', percent: null, comparedDate: previousSnapshot.snapshotDate || null };
  const previousItems = previousSnapshot.regions?.[item.region]?.items;
  const previous = Array.isArray(previousItems) ? previousItems.find(row => row?.id === item.id) : null;
  if (!previous) return { status: 'no_matching_trend', percent: null, comparedDate: previousSnapshot.snapshotDate || null };
  const currentFloor = Number.isSafeInteger(item.trafficBucketFloor) ? item.trafficBucketFloor : null;
  const previousFloor = Number.isSafeInteger(previous.trafficBucketFloor) ? previous.trafficBucketFloor : null;
  if (!currentFloor || !previousFloor) return { status: 'traffic_bucket_unavailable', percent: null, comparedDate: previousSnapshot.snapshotDate || null };
  const percent = Math.round(((currentFloor / previousFloor) - 1) * 100);
  if (!Number.isSafeInteger(percent)) return { status: 'traffic_bucket_unavailable', percent: null, comparedDate: previousSnapshot.snapshotDate || null };
  return { status: 'ready', percent, comparedDate: previousSnapshot.snapshotDate || null };
}

function capturedAtISO(value) {
  const date = dateValue(value);
  return date ? date.toISOString() : null;
}

export function publicTrendReport(currentSnapshot, previousSnapshot = null, now = Date.now()) {
  const snapshotDate = typeof currentSnapshot?.snapshotDate === 'string' ? currentSnapshot.snapshotDate : null;
  const consecutive = Boolean(snapshotDate && previousSnapshot && hasConsecutiveDailySnapshots(snapshotDate, previousSnapshot.snapshotDate));
  return {
    source: 'Google Trends Trending Now RSS',
    estimateMethod: ESTIMATE_METHOD,
    snapshotDate,
    capturedAt: capturedAtISO(currentSnapshot?.capturedAt),
    snapshotFresh: snapshotIsFresh(currentSnapshot, now),
    previousSnapshotDate: previousSnapshot?.snapshotDate || null,
    regions: TREND_FINDER_REGIONS.map(region => {
      const rows = currentSnapshot?.regions?.[region.code]?.items;
      return {
        code: region.code,
        label: region.label,
        sourceUrl: region.sourceUrl,
        niches: TREND_NICHES.map(niche => {
          const stored = currentSnapshot?.regions?.[region.code]?.niches?.[niche.key];
          return {
            key: niche.key,
            label: niche.label,
            status: typeof stored?.status === 'string' ? stored.status : 'not_collected',
            items: (Array.isArray(stored?.items) ? stored.items : []).map(item => ({
              id: typeof item?.id === 'string' ? item.id : null,
              title: typeof item?.title === 'string' ? item.title : '',
              source: typeof item?.source === 'string' ? item.source : null,
              publishedAt: capturedAtISO(item?.publishedAt),
              matchType: item?.matchType === 'matches_niche' || item?.matchType === 'closest_related' ? item.matchType : null,
            })).filter(item => item.id && item.title),
          };
        }),
        trends: (Array.isArray(rows) ? rows : []).map(row => {
          const item = { ...row, region: region.code };
          return {
            id: typeof row?.id === 'string' ? row.id : trendIdentity(region.code, row?.title),
            title: typeof row?.title === 'string' ? row.title : '',
            approxTraffic: typeof row?.trafficBucket === 'string' ? row.trafficBucket : null,
            pinCraftEstimate: estimateFor(item, previousSnapshot, consecutive),
          };
        }).filter(row => row.id && row.title),
      };
    }),
  };
}

export function snapshotCounts(snapshot) {
  return Object.fromEntries(TREND_FINDER_REGIONS.map(region => [region.code, Array.isArray(snapshot?.regions?.[region.code]?.items) ? snapshot.regions[region.code].items.length : 0]));
}

export function trendRegionLabel(code) {
  return regionInfo(code)?.label || null;
}
