"use client";
import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
export function useGenerationMode(user) {
  const [status, setStatus] = useState(null), [mode, setMode] = useState(user ? 'ai' : 'local');
  const selected = useRef('');
  useEffect(() => { const controller = new AbortController(); fetch('/api/ai/status', { cache: 'no-store', signal: controller.signal }).then(r => r.ok ? r.json() : null).then(setStatus).catch(() => {}); return () => controller.abort(); }, []);
  // A status response never overrides a deliberate choice or silently replaces
  // a failed live request with offline content.
  useEffect(() => { const key = user?.id || 'guest'; if (selected.current !== key) { selected.current = key; setMode(user ? 'ai' : 'local'); } }, [user?.id]);
  return { mode, setMode, status };
}
export default function GenerationMode({ mode, setMode, status, disabled }) {
  return <fieldset className="mb-5 rounded-xl border border-neutral-200 bg-neutral-50/60 p-3">
    <legend className="px-1 text-[11px] font-bold text-neutral-600">Content generation mode</legend>
    <div className="grid grid-cols-2 gap-2">{[['local', 'Offline template'], ['ai', 'Live AI + fallback']].map(([id, label]) => <button key={id} type="button" aria-pressed={mode === id} disabled={disabled} onClick={() => setMode(id)} className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-bold disabled:opacity-60 ${mode === id ? 'bg-neutral-900 text-white' : 'border border-neutral-200 bg-white text-neutral-600'}`}>{id === 'ai' && <Sparkles size={13} aria-hidden="true" />}{label}</button>)}</div>
    <p className="mt-2 text-[10.5px] leading-relaxed text-neutral-500">{mode === 'local' ? 'Free device-only templates. Not a live AI request; your text is not sent to an AI service.' : status && !status.textConfigured ? 'AI writing is temporarily unavailable. You can choose Offline template separately; it is never substituted automatically.' : 'Verified sign-in required. Generating sends your text to an AI service and uses your daily allowance. Automatic recovery is included. Do not enter private or sensitive information.'}</p>
  </fieldset>;
}
export function GenerationReceipt({ generation }) {
  if (!generation) return <p className="mb-3 rounded-xl bg-neutral-100 px-3 py-2 text-[11px] leading-relaxed text-neutral-600">Offline template · not a live AI request. Review and personalize before publishing.</p>;
  return <p className="mb-3 break-words rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] leading-relaxed text-emerald-900" data-testid="ai-generation-receipt"><strong>AI-generated</strong>{generation.fallbackUsed ? ' · Automatic fallback used' : ''}. Review facts and originality before publishing.</p>;
}
