import 'server-only';
import { recentTrendSnapshots } from '../trend-finder/service.mjs';
import { snapshotIsFresh, trendRegionLabel } from '../trend-finder/core.mjs';
import { CATEGORY_TERMS, topicTokens } from '../publishing/category-trends.mjs';

// Default region for inspiration. The Trend Finder covers US, GB and CA only.
const DEFAULT_REGION = 'US';
const MAX_TOPICS = 3;

// Trend titles are untrusted third-party text: strip controls and markup, cap length.
export function cleanTrendTitle(value) {
  return String(value ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

// Returns at most three of today's regional trends that share words with the
// requested topic/title/category. Returns null when nothing is relevant, when the
// snapshot is stale or missing, or when trend storage fails. Generation then
// proceeds exactly as before. No volumes or performance figures are passed on.
export async function trendContextFor(db, input, { now = Date.now(), load = recentTrendSnapshots } = {}) {
  try {
    const [snapshot] = await load(db, 1);
    if (!snapshot || !snapshotIsFresh(snapshot, now)) return null;
    const items = snapshot.regions?.[DEFAULT_REGION]?.items;
    if (!Array.isArray(items)) return null;
    const wanted = new Set(topicTokens([input.topic, input.title, (CATEGORY_TERMS[input.categoryId] || []).join(' ')].filter(Boolean).join(' ')));
    if (!wanted.size) return null;
    const ranked = items
      .map(item => {
        const title = cleanTrendTitle(item?.title);
        const score = topicTokens(title).filter(token => wanted.has(token)).length;
        return { title, score };
      })
      .filter(item => item.title.length >= 2 && item.score > 0)
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    const topics = [...new Set(ranked.map(item => item.title))].slice(0, MAX_TOPICS);
    if (!topics.length) return null;
    return { regionLabel: trendRegionLabel(DEFAULT_REGION), topics };
  } catch {
    return null;
  }
}

// Shape allowed in browser responses.
export function publicTrendContext(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.topics)) return null;
  const topics = value.topics.map(cleanTrendTitle).filter(Boolean);
  if (!topics.length || topics.length > MAX_TOPICS || typeof value.regionLabel !== 'string') return null;
  return { regionLabel: value.regionLabel.slice(0, 60), topics };
}
