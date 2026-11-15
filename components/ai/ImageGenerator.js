"use client";
import { useEffect, useRef, useState } from 'react';
import { Download, ImagePlus, Loader2 } from 'lucide-react';
import { generateWithAI } from '@/lib/ai-client';
import { useAuth } from '../providers/AppProvider';
import { GenerationReceipt } from './GenerationMode';
import CopyButton from '../CopyButton';

export default function ImageGenerator({ initialPrompt = '', useCase = 'pin', editable = true, onUsageChange, onBusyChange, postInfo = null, onRequestPostInfo, postInfoLoading = false }) {
  const { user, authLoading, openLogin } = useAuth();
  const [prompt, setPrompt] = useState(initialPrompt), [image, setImage] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [showPostInfo, setShowPostInfo] = useState(false), [selectedTitle, setSelectedTitle] = useState('');
  const sequence = useRef(0), controller = useRef(null), owner = useRef(null);
  owner.current = user?.id || null;
  useEffect(() => { setPrompt(initialPrompt); }, [initialPrompt, user?.id]);
  // Keep a completed image when Pin copy supplies a more specific prompt. Only
  // clear private artwork when its owner or image use changes.
  useEffect(() => { sequence.current++; controller.current?.abort(); setImage(null); setError(''); setBusy(false); setShowPostInfo(false); setSelectedTitle(''); return () => { sequence.current++; controller.current?.abort(); }; }, [useCase, user?.id]);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  const postTitles = Array.isArray(postInfo?.titles) ? postInfo.titles.filter(value => typeof value === 'string' && value.trim()) : typeof postInfo?.title === 'string' && postInfo.title.trim() ? [postInfo.title] : [];
  const activePostTitle = postTitles.includes(selectedTitle) ? selectedTitle : postTitles[0] || '';
  const postDescription = typeof postInfo?.description === 'string' ? postInfo.description : '';
  const postHashtags = Array.isArray(postInfo?.hashtags) ? postInfo.hashtags.filter(value => typeof value === 'string' && value.trim()) : [];
  const allPostInfo = [`Title: ${activePostTitle}`, `Description: ${postDescription}`, `Hashtags: ${postHashtags.join(' ')}`].filter(line => !line.endsWith(': ')).join('\n\n');
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
      {useCase === 'pin' && <div className="mt-3">
        <button type="button" aria-label={showPostInfo ? 'Hide Post Info' : 'Post Info'} aria-expanded={showPostInfo} aria-controls="pin-post-info" onClick={() => setShowPostInfo(value => !value)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 text-[12px] font-extrabold text-brand-800 hover:bg-brand-100">
          <span aria-hidden="true">✦</span> Post Info <span className="text-[10px] font-semibold text-brand-700">{showPostInfo ? '−' : '+'}</span>
        </button>
        {showPostInfo && <section id="pin-post-info" data-testid="pin-post-info" aria-label="Pinterest Post Info" className="mt-3 space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 sm:p-4">
          <div>
            <p className="text-[12px] font-extrabold text-neutral-900">Pinterest post details</p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-neutral-500">Choose a title, then copy the prepared description and hashtags into Pinterest. You will choose the board and add any destination link there yourself.</p>
          </div>
          {postTitles.length > 0 ? <>
            <label className="block text-[11px] font-bold text-neutral-700">Pin title<select aria-label="Pinterest Pin title" value={activePostTitle} onChange={event => setSelectedTitle(event.target.value)} className="mt-1.5 min-h-11 w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-3 text-[13px] font-semibold text-neutral-900">
              {postTitles.map((title, index) => <option key={`${index}-${title}`} value={title}>{title}</option>)}
            </select></label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="break-words text-[11px] text-neutral-500">{activePostTitle.length} characters · {postTitles.length} title ideas</span>
              <CopyButton text={activePostTitle} label="Copy Pin title" className="min-h-11 px-3 text-[11px]" />
            </div>
            <div className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-neutral-700">Description</p>
                <CopyButton text={postDescription} label="Copy Pin description" className="min-h-11 px-3 text-[11px]" />
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-neutral-700">{postDescription}</p>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-neutral-700">Hashtags · {postHashtags.length}</p>
                <CopyButton text={postHashtags.join(' ')} label="Copy all Pin hashtags" className="min-h-11 px-3 text-[11px]" />
              </div>
              <div data-testid="pin-post-hashtags" className="mt-2 flex flex-wrap gap-1.5">{postHashtags.map((tag, index) => <span key={`${index}-${tag}`} className="max-w-full break-all rounded-full bg-brand-50 px-2.5 py-1.5 text-[11px] font-bold text-brand-700">{tag}</span>)}</div>
            </div>
            <CopyButton text={allPostInfo} label="Copy all Post Info" variant="solid" className="min-h-11 w-full px-3 text-[12px]" />
            <a href="https://www.pinterest.com/pin-creation-tool/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-[11px] font-bold text-neutral-700 hover:bg-neutral-100">Open Pinterest to post manually</a>
          </> : <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-[11px] leading-relaxed text-amber-900">Your image is ready. Generate Pin copy to prepare the title, description and hashtags for this Post Info panel.</p>
            <button type="button" onClick={onRequestPostInfo} disabled={postInfoLoading || !onRequestPostInfo} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-neutral-900 px-3 text-[11px] font-bold text-white disabled:opacity-60">{postInfoLoading ? <><Loader2 size={14} className="animate-spin" aria-hidden="true" />Preparing Pin info…</> : 'Generate Pin copy'}</button>
          </div>}
        </section>}
      </div>}
    </div>}
    <p className="text-[10px] leading-relaxed text-neutral-500">Artwork only; add lettering in your design editor if needed. Download before leaving. Image bytes are not saved to the Library or hosted publicly, and nothing is published automatically. Temporary service limits may prevent generation even with automatic recovery.</p>
  </div>;
}
