"use client";

// Shown only when the server found today's relevant trends. Titles are inspiration, not performance data.
export function TrendingHint({ trendContext }) {
  if (!trendContext || !Array.isArray(trendContext.topics) || !trendContext.topics.length) return null;
  return <p className="mb-3 break-words rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900" data-testid="trending-now-hint"><strong>Trending now</strong>{trendContext.regionLabel ? ` (${trendContext.regionLabel})` : ''}: {trendContext.topics.join(' · ')}. Used as inspiration only; no search volume or performance is claimed.</p>;
}

export function GenerationReceipt({ generation }) {
  if (!generation) return <p className="mb-3 rounded-xl bg-neutral-100 px-3 py-2 text-[11px] leading-relaxed text-neutral-600">Offline template · not a live AI request. Review and personalize before publishing.</p>;
  return <p className="mb-3 break-words rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] leading-relaxed text-emerald-900" data-testid="ai-generation-receipt"><strong>AI-generated.</strong> Review facts and originality before publishing.</p>;
}
