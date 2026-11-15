"use client";

export function GenerationReceipt({ generation }) {
  if (!generation) return <p className="mb-3 rounded-xl bg-neutral-100 px-3 py-2 text-[11px] leading-relaxed text-neutral-600">Offline template · not a live AI request. Review and personalize before publishing.</p>;
  return <p className="mb-3 break-words rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] leading-relaxed text-emerald-900" data-testid="ai-generation-receipt"><strong>AI-generated</strong>{generation.fallbackUsed ? ' · Automatic fallback used' : ''}. Review facts and originality before publishing.</p>;
}
