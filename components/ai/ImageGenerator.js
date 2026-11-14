"use client";
import { useEffect, useRef, useState } from 'react';
import { Download, ImagePlus, Loader2 } from 'lucide-react';
import { generateWithAI } from '@/lib/ai-client';
import { useAuth } from '../providers/AppProvider';
import { GenerationReceipt } from './GenerationMode';

export default function ImageGenerator({ initialPrompt = '', useCase = 'pin', editable = true, onUsageChange, onBusyChange }) {
  const { user, authLoading, openLogin } = useAuth();
  const [prompt, setPrompt] = useState(initialPrompt), [image, setImage] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const sequence = useRef(0), controller = useRef(null), owner = useRef(null);
  owner.current = user?.id || null;
  useEffect(() => { setPrompt(initialPrompt); }, [initialPrompt, user?.id]);
  useEffect(() => { sequence.current++; controller.current?.abort(); setImage(null); setError(''); setBusy(false); return () => { sequence.current++; controller.current?.abort(); }; }, [initialPrompt, useCase, user?.id]);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  async function generate() {
    if (busy || authLoading) return;
    if (!user) return openLogin();
    if (prompt.trim().length < 10) { setError('Describe the image in at least 10 characters.'); return; }
    const account = user.id, request = ++sequence.current;
    controller.current = new AbortController(); setBusy(true); setError('');
    try {
      const result = await generateWithAI('image', { prompt: prompt.trim(), useCase }, { signal: controller.current.signal });
      if (sequence.current === request && owner.current === account) setImage({ ...result.result, generation: result.generation, downloadName: `pincraft-${useCase}-${result.requestKey}.webp` });
    } catch (issue) { if (issue.name !== 'AbortError' && sequence.current === request && owner.current === account) setError(issue.message); }
    finally { if (sequence.current === request) { setBusy(false); onUsageChange?.(); } }
  }
  return <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-3.5 sm:p-4" data-testid="ai-image-generator" aria-busy={busy}>
    <div><p className="text-[12px] font-extrabold text-neutral-800">{useCase === 'pin' ? 'Generate Pin artwork' : 'Generate a featured image'}</p><p className="mt-1 text-[10.5px] leading-relaxed text-neutral-500">Original AI artwork · {useCase === 'pin' ? '1000 × 1500' : '1200 × 630'} · WebP download</p></div>
    {editable && <label className="block text-[11px] font-bold text-neutral-700">Visual description<textarea aria-label="Visual description" value={prompt} maxLength={1700} onChange={event => { setPrompt(event.target.value); setError(''); }} rows={4} disabled={busy} className="mt-2 min-h-24 w-full resize-y rounded-xl border border-neutral-300 px-3 py-2.5 text-[16px] font-normal outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-50 sm:text-[13px]" placeholder="A sunny reading corner with leafy plants, warm natural colors, editorial photography, no text…" /><span className="mt-1 block text-right text-[10px] font-normal text-neutral-400">{prompt.length.toLocaleString()} / 1,700</span></label>}
    <button type="button" disabled={busy || authLoading} onClick={generate} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-3 py-2.5 text-[12px] font-bold text-white hover:bg-black disabled:opacity-50">{busy ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" />Generating artwork…</> : <><ImagePlus size={16} aria-hidden="true" />{image ? 'Generate another image' : 'Generate image with AI'}</>}</button>
    <p className="text-[10px] leading-relaxed text-neutral-500">Generating sends your visual description to an AI service and uses your daily image allowance. Avoid private or sensitive information. Failed requests also count.</p>
    {busy && <p role="status" className="text-[11px] leading-relaxed text-neutral-500">Creating and checking your artwork. This may take a moment; please keep this tool open.{image ? ' Your previous image remains available below.' : ''}</p>}
    {error && <p role="alert" className="rounded-lg bg-brand-50 p-3 text-[11.5px] leading-relaxed text-brand-800">{error}{image ? ' Your previous image is unchanged and can still be downloaded.' : ''}</p>}
    {image && <div>
      <GenerationReceipt generation={image.generation} />
      <img src={image.dataUrl} alt={`AI-generated ${useCase === 'pin' ? 'Pinterest artwork' : 'blog featured artwork'}`} width={image.width} height={image.height} className={`mx-auto h-auto max-h-[600px] w-full rounded-xl bg-neutral-50 object-contain ${useCase === 'pin' ? 'max-w-[380px]' : ''}`} />
      <a href={image.dataUrl} download={image.downloadName} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 px-3 text-[12px] font-bold text-neutral-700 hover:bg-neutral-50"><Download size={15} aria-hidden="true" />Download WebP</a>
    </div>}
    <p className="text-[10px] leading-relaxed text-neutral-500">Artwork only; add lettering in your design editor if needed. Download before leaving. Image bytes are not saved to the Library or hosted publicly, and nothing is published automatically. Temporary service limits may prevent generation even with automatic recovery.</p>
  </div>;
}
