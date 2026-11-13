"use client";
import { useEffect, useRef, useState } from 'react';
import { Download, ImagePlus, Loader2 } from 'lucide-react';
import { generateWithAI } from '@/lib/ai-client';
import { useAuth } from '../providers/AppProvider';
import { GenerationReceipt } from './GenerationMode';

export default function ImageGenerator({ initialPrompt = '', useCase = 'pin', editable = false, onUsageChange }) {
  const { user, authLoading, openLogin } = useAuth();
  const [prompt, setPrompt] = useState(initialPrompt), [image, setImage] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const sequence = useRef(0), controller = useRef(null), owner = useRef(null);
  owner.current = user?.id || null;
  useEffect(() => { sequence.current++; controller.current?.abort(); setPrompt(initialPrompt); setImage(null); setError(''); setBusy(false); return () => { sequence.current++; controller.current?.abort(); }; }, [initialPrompt, useCase, user?.id]);
  async function generate() {
    if (busy || authLoading) return;
    if (!user) return openLogin();
    if (prompt.trim().length < 10) { setError('Describe the image in at least 10 characters.'); return; }
    const account = user.id, request = ++sequence.current;
    controller.current = new AbortController(); setBusy(true); setError('');
    try {
      const result = await generateWithAI('image', { prompt: prompt.trim(), useCase }, { signal: controller.current.signal });
      if (sequence.current === request && owner.current === account) { setImage({ ...result.result, generation: result.generation }); }
    } catch (issue) { if (issue.name !== 'AbortError' && sequence.current === request && owner.current === account) setError(issue.message); }
    finally { if (sequence.current === request) { setBusy(false); onUsageChange?.(); } }
  }
  return <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-3.5" data-testid="ai-image-generator">
    <div><p className="text-[12px] font-extrabold text-neutral-800">{useCase === 'pin' ? 'Generate Pin artwork' : 'Generate a featured image'}</p><p className="mt-1 text-[10.5px] leading-relaxed text-neutral-500">Cloudflare FLUX · {useCase === 'pin' ? '1000 × 1500' : '1200 × 630'} WebP. Uses provider quota only when you click Generate.</p></div>
    {editable && <label className="block text-[11px] font-bold text-neutral-700">Visual description<textarea value={prompt} maxLength={1700} onChange={event => setPrompt(event.target.value)} rows={4} disabled={busy} className="mt-2 min-h-24 w-full resize-y rounded-xl border border-neutral-300 px-3 py-2.5 text-[16px] font-normal outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-50 sm:text-[13px]" placeholder="A sunny reading corner with leafy plants, warm natural colors, editorial photography, no text…" /></label>}
    <button type="button" disabled={busy || authLoading} onClick={generate} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-3 py-2.5 text-[12px] font-bold text-white hover:bg-black disabled:opacity-50">{busy ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" />Generating artwork…</> : <><ImagePlus size={16} aria-hidden="true" />{image ? 'Generate another image' : 'Generate image with AI'}</>}</button>
    {error && <p role="alert" className="rounded-lg bg-brand-50 p-3 text-[11.5px] leading-relaxed text-brand-800">{error}</p>}
    {image && <div>
      <GenerationReceipt generation={image.generation} />
      <img src={image.dataUrl} alt={`AI-generated ${useCase === 'pin' ? 'Pinterest artwork' : 'blog featured artwork'}`} width={image.width} height={image.height} className={`mx-auto h-auto max-h-[600px] w-full rounded-xl object-contain ${useCase === 'pin' ? 'max-w-[380px]' : ''}`} />
      <a href={image.dataUrl} download={`pincraft-${useCase}-${Date.now()}.webp`} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 px-3 text-[12px] font-bold text-neutral-700"><Download size={15} aria-hidden="true" />Download WebP</a>
    </div>}
    <p className="text-[10px] leading-relaxed text-neutral-500">Artwork only; add lettering in your design editor if needed. Download before leaving. Image bytes are not saved to the Library or hosted publicly, and nothing is published automatically. Model fallback cannot overcome a Cloudflare-wide outage or exhausted account quota.</p>
  </div>;
}
