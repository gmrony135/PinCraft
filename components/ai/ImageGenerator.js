"use client";
import { useEffect, useRef, useState } from 'react';
import { Download, ImagePlus, Loader2 } from 'lucide-react';
import { generateWithAI } from '@/lib/ai-client';
import { saveCloudDraft } from '@/lib/cloud-library';
import { useAuth } from '../providers/AppProvider';
import { GenerationReceipt } from './GenerationMode';
import CopyButton from '../CopyButton';

export default function ImageGenerator({ initialPrompt = '', useCase = 'pin', editable = true, onUsageChange, onBusyChange, topic = '', categoryId = '', language = 'en' }) {
  const { user, authLoading, openLogin } = useAuth();
  const [prompt, setPrompt] = useState(initialPrompt), [image, setImage] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [historySave, setHistorySave] = useState({ status: 'idle', content: null, requestKey: null, message: '' });
  const [showPostInfo, setShowPostInfo] = useState(false), [postInfo, setPostInfo] = useState(null), [postInfoBusy, setPostInfoBusy] = useState(false), [postInfoError, setPostInfoError] = useState('');
  const [postInfoSave, setPostInfoSave] = useState({ status: 'idle', content: null, requestKey: null, message: '' });
  const sequence = useRef(0), postInfoSequence = useRef(0), controller = useRef(null), postInfoController = useRef(null), owner = useRef(null), imageRef = useRef(null);
  owner.current = user?.id || null;
  imageRef.current = image;
  useEffect(() => { setPrompt(initialPrompt); }, [initialPrompt, user?.id]);
  // A Pin's Post Info stays attached to the exact artwork and visual prompt
  // that produced it; changing account or image format clears all private data.
  useEffect(() => {
    sequence.current++; postInfoSequence.current++;
    controller.current?.abort(); postInfoController.current?.abort();
    setImage(null); setError(''); setBusy(false); setHistorySave({ status: 'idle', content: null, requestKey: null, message: '' }); setShowPostInfo(false); setPostInfo(null); setPostInfoBusy(false); setPostInfoError(''); setPostInfoSave({ status: 'idle', content: null, requestKey: null, message: '' });
    return () => { sequence.current++; postInfoSequence.current++; controller.current?.abort(); postInfoController.current?.abort(); };
  }, [useCase, user?.id]);
  useEffect(() => { onBusyChange?.(busy || postInfoBusy); }, [busy, postInfoBusy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  const allPostInfo = postInfo ? [`Title: ${postInfo.title}`, `Description: ${postInfo.description}`, `Hashtags: ${postInfo.hashtags.join(' ')}`].join('\n\n') : '';

  function artworkHistoryContent(artwork) {
    const pin = useCase === 'pin', historyTopic = String(artwork.topic || artwork.prompt).trim().slice(0, 160);
    return {
      historyType: pin ? 'pin_artwork' : 'featured_image',
      title: `${pin ? 'Pin artwork' : 'Featured image'} — ${historyTopic}`,
      topic: historyTopic,
      category: pin ? 'Pinterest artwork' : 'Blog featured image',
      language,
      imageAssetId: artwork.assetId,
      useCase,
      prompt: artwork.prompt,
      categoryId: artwork.categoryId || '',
      width: artwork.width,
      height: artwork.height,
      generation: artwork.generation,
    };
  }

  async function persistArtworkHistory(entry, account, request, alreadySaved = false) {
    setHistorySave({ status: alreadySaved ? 'saved' : 'saving', content: entry.content, requestKey: entry.requestKey, message: '' });
    if (alreadySaved) return;
    try {
      await saveCloudDraft('history', entry.content, entry.requestKey);
      if (sequence.current === request && owner.current === account) setHistorySave({ status: 'saved', content: entry.content, requestKey: entry.requestKey, message: '' });
    } catch (issue) {
      if (sequence.current === request && owner.current === account) setHistorySave({ status: 'error', content: entry.content, requestKey: entry.requestKey, message: issue.message || 'The artwork is available on this page, but its Library save could not be confirmed.' });
    }
  }

  async function retryArtworkHistory() {
    if (!historySave.content || !historySave.requestKey || !user) return;
    const request = sequence.current, account = user.id;
    await persistArtworkHistory({ content: historySave.content, requestKey: historySave.requestKey }, account, request, false);
  }

  async function persistPostInfoHistory(entry, account, request, artwork) {
    setPostInfoSave({ status: entry.alreadySaved ? 'saved' : 'saving', content: entry.content, requestKey: entry.requestKey, message: '' });
    if (entry.alreadySaved) return;
    try {
      await saveCloudDraft('history', entry.content, entry.requestKey);
      if (postInfoSequence.current === request && owner.current === account && imageRef.current?.assetId === artwork.assetId) setPostInfoSave({ status: 'saved', content: entry.content, requestKey: entry.requestKey, message: '' });
    } catch (issue) {
      if (postInfoSequence.current === request && owner.current === account && imageRef.current?.assetId === artwork.assetId) setPostInfoSave({ status: 'error', content: entry.content, requestKey: entry.requestKey, message: issue.message || 'Post Info is ready, but its Library save could not be confirmed.' });
    }
  }

  async function retryPostInfoHistory() {
    if (!postInfoSave.content || !postInfoSave.requestKey || !user || !imageRef.current) return;
    const account = user.id, request = postInfoSequence.current, artwork = imageRef.current;
    await persistPostInfoHistory({ content: postInfoSave.content, requestKey: postInfoSave.requestKey, alreadySaved: false }, account, request, artwork);
  }

  async function generate() {
    if (busy || postInfoBusy || authLoading) return;
    if (!user) return openLogin();
    if (prompt.trim().length < 10) { setError('Describe the image in at least 10 characters.'); return; }
    const account = user.id, request = ++sequence.current, submittedPrompt = prompt.trim(), submittedTopic = topic.trim();
    postInfoController.current?.abort(); postInfoSequence.current++;
    controller.current = new AbortController(); setBusy(true); setError('');
    try {
      const result = await generateWithAI('image', { prompt: submittedPrompt, useCase, topic: submittedTopic, categoryId, language }, { signal: controller.current.signal });
      if (sequence.current === request && owner.current === account) {
        const generatedImage = { ...result.result, generation: result.generation, prompt: submittedPrompt, topic: submittedTopic, categoryId, downloadName: `pincraft-${useCase}-${result.requestKey}.webp` };
        setImage(generatedImage);
        setPostInfo(null); setPostInfoError(''); setPostInfoSave({ status: 'idle', content: null, requestKey: null, message: '' });
        const entry = { content: artworkHistoryContent(generatedImage), requestKey: result.requestKey };
        await persistArtworkHistory(entry, account, request, result.library?.saved === true);
      }
    } catch (issue) { if (issue.name !== 'AbortError' && sequence.current === request && owner.current === account) setError(issue.message); }
    finally { if (sequence.current === request) { setBusy(false); onUsageChange?.(); } }
  }

  async function generatePostInfo() {
    if (busy || postInfoBusy || authLoading || !image) return;
    if (!user) return openLogin();
    const account = user.id, artwork = image, request = ++postInfoSequence.current;
    postInfoController.current?.abort(); postInfoController.current = new AbortController();
    setPostInfoBusy(true); setPostInfoError('');
    try {
      const generated = await generateWithAI('pin_info', {
        prompt: artwork.prompt,
        topic: artwork.topic,
        categoryId: artwork.categoryId,
        language,
        imageAssetId: artwork.assetId,
      }, { signal: postInfoController.current.signal });
      if (postInfoSequence.current === request && owner.current === account && imageRef.current?.dataUrl === artwork.dataUrl) {
        setPostInfo(generated.result);
        const content = { historyType: 'pin_info', title: generated.result.title, topic: artwork.topic || generated.result.title, category: 'Pinterest Post Info', language, imageAssetId: artwork.assetId, useCase: 'pin', prompt: artwork.prompt, description: generated.result.description, hashtags: generated.result.hashtags, generation: generated.generation };
        await persistPostInfoHistory({ content, requestKey: generated.requestKey, alreadySaved: generated.library?.saved === true }, account, request, artwork);
      }
    } catch (issue) {
      if (issue.name !== 'AbortError' && postInfoSequence.current === request && owner.current === account && imageRef.current?.dataUrl === artwork.dataUrl) setPostInfoError(issue.message);
    } finally {
      if (postInfoSequence.current === request) { setPostInfoBusy(false); onUsageChange?.(); }
    }
  }

  return <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-3.5 sm:p-4" data-testid="ai-image-generator" aria-busy={busy || postInfoBusy}>
    <div><p className="text-[12px] font-extrabold text-neutral-800">{useCase === 'pin' ? 'Generate Pin artwork' : 'Generate a featured image'}</p><p className="mt-1 text-[10.5px] leading-relaxed text-neutral-500">Original AI artwork · {useCase === 'pin' ? '1000 × 1500' : '1200 × 630'} · WebP download</p></div>
    {editable && <label className="block text-[11px] font-bold text-neutral-700">Visual description<textarea aria-label="Visual description" value={prompt} maxLength={1700} onChange={event => { setPrompt(event.target.value); setError(''); }} rows={4} disabled={busy || postInfoBusy} className="mt-2 min-h-24 w-full resize-y rounded-xl border border-neutral-300 px-3 py-2.5 text-[16px] font-normal outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-50 sm:text-[13px]" placeholder="A sunny reading corner with leafy plants, warm natural colors, editorial photography, no text…" /><span className="mt-1 block text-right text-[10px] font-normal text-neutral-400">{prompt.length.toLocaleString()} / 1,700</span></label>}
    <button type="button" disabled={busy || postInfoBusy || authLoading} onClick={generate} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-3 py-2.5 text-[12px] font-bold text-white hover:bg-black disabled:opacity-50">{busy ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" />Generating artwork…</> : <><ImagePlus size={16} aria-hidden="true" />{image ? 'Generate another image' : 'Generate image with AI'}</>}</button>
    <p className="text-[10px] leading-relaxed text-neutral-500">There is no per-account daily image cap. Requests still use shared website-wide capacity and may be subject to cooldowns and provider quotas. Avoid private or sensitive information; failed requests may count toward site-wide usage.</p>
    {busy && <p role="status" className="text-[11px] leading-relaxed text-neutral-500">Creating and checking your artwork. This may take a moment; please keep this tool open.{image ? ' Your previous image remains available below.' : ''}</p>}
    {error && <p role="alert" className="rounded-lg bg-brand-50 p-3 text-[11.5px] leading-relaxed text-brand-800">{error}{image ? ' Your previous image is unchanged and can still be downloaded.' : ''}</p>}
    {image && <div>
      <GenerationReceipt generation={image.generation} />
      {historySave.status === 'saved' && <p role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[11px] leading-relaxed text-emerald-800">Automatically saved to your private My Library. This artwork has not been published.</p>}
      {historySave.status === 'saving' && <p role="status" className="mb-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-[11px] text-neutral-600">Saving artwork to your private My Library…</p>}
      {historySave.status === 'error' && <div role="alert" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">{historySave.message} The image is still downloadable; retry before leaving this page. <button type="button" onClick={retryArtworkHistory} className="ml-1 min-h-9 font-extrabold underline underline-offset-2">Retry Library save</button></div>}
      <img src={image.dataUrl} alt={`AI-generated ${useCase === 'pin' ? 'Pinterest artwork' : 'blog featured artwork'}`} width={image.width} height={image.height} className={`mx-auto h-auto max-h-[600px] w-full rounded-xl bg-neutral-50 object-contain ${useCase === 'pin' ? 'max-w-[380px]' : ''}`} />
      <a href={image.dataUrl} download={image.downloadName} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 px-3 text-[12px] font-bold text-neutral-700 hover:bg-neutral-50"><Download size={15} aria-hidden="true" />Download WebP</a>
      {useCase === 'pin' && <div className="mt-3">
        <button type="button" aria-label={showPostInfo ? 'Hide Post Info' : 'Post Info'} aria-expanded={showPostInfo} aria-controls="pin-post-info" onClick={() => setShowPostInfo(value => !value)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 text-[12px] font-extrabold text-brand-800 hover:bg-brand-100">
          <span aria-hidden="true">✦</span> Post Info <span className="text-[10px] font-semibold text-brand-700">{showPostInfo ? '−' : '+'}</span>
        </button>
        {showPostInfo && <section id="pin-post-info" data-testid="pin-post-info" aria-label="Pinterest Post Info" aria-busy={postInfoBusy} className="mt-3 space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 sm:p-4">
          <div><p className="text-[12px] font-extrabold text-neutral-900">Pinterest Post Info</p><p className="mt-1 text-[10.5px] leading-relaxed text-neutral-500">One image-based title, description and four or five relevant hashtags. Nothing is posted automatically.</p></div>
          {postInfoBusy && <p role="status" className="text-[11px] leading-relaxed text-neutral-600">Analyzing this artwork and preparing one distinct Post Info set…</p>}
          {postInfoError && <p role="alert" className="rounded-lg bg-brand-50 p-3 text-[11.5px] leading-relaxed text-brand-800">{postInfoError}</p>}
          {postInfoSave.status === 'saved' && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[10.5px] text-emerald-800">Post Info automatically saved in My Library. Nothing was posted.</p>}
          {postInfoSave.status === 'saving' && <p role="status" className="rounded-lg border border-neutral-200 bg-white p-3 text-[10.5px] text-neutral-600">Saving Post Info to My Library…</p>}
          {postInfoSave.status === 'error' && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10.5px] leading-relaxed text-amber-900">{postInfoSave.message} <button type="button" onClick={retryPostInfoHistory} className="ml-1 min-h-9 font-extrabold underline underline-offset-2">Retry Library save</button></p>}
          {postInfo ? <>
            <div className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] font-bold text-neutral-700">Title</p><CopyButton text={postInfo.title} label="Copy Pin title" className="min-h-11 px-3 text-[11px]" /></div>
              <p className="mt-2 break-words text-[13px] font-semibold leading-relaxed text-neutral-900">{postInfo.title}</p>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] font-bold text-neutral-700">Description</p><CopyButton text={postInfo.description} label="Copy Pin description" className="min-h-11 px-3 text-[11px]" /></div>
              <p className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-neutral-700">{postInfo.description}</p>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] font-bold text-neutral-700">Hashtags</p><CopyButton text={postInfo.hashtags.join(' ')} label="Copy Pin hashtags" className="min-h-11 px-3 text-[11px]" /></div>
              <div data-testid="pin-post-hashtags" className="mt-2 flex flex-wrap gap-1.5">{postInfo.hashtags.map((tag, index) => <span key={`${index}-${tag}`} className="max-w-full break-all rounded-full bg-brand-50 px-2.5 py-1.5 text-[11px] font-bold text-brand-700">{tag}</span>)}</div>
            </div>
            <CopyButton text={allPostInfo} label="Copy all Post Info" variant="solid" className="min-h-11 w-full px-3 text-[12px]" />
            <button type="button" onClick={generatePostInfo} disabled={busy || postInfoBusy || authLoading} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 text-[11px] font-bold text-neutral-700 hover:bg-neutral-100 disabled:opacity-50">{postInfoBusy ? <><Loader2 size={14} className="animate-spin" aria-hidden="true" />Preparing Post Info…</> : 'Regenerate Post Info'}</button>
          </> : <>
            {!postInfoBusy && <p className="text-[11px] leading-relaxed text-neutral-600">Generate one title, one description and four or five image-relevant hashtags for this artwork.</p>}
            <button type="button" onClick={generatePostInfo} disabled={busy || postInfoBusy || authLoading} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-neutral-900 px-3 text-[11px] font-bold text-white disabled:opacity-50">{postInfoBusy ? <><Loader2 size={14} className="animate-spin" aria-hidden="true" />Preparing Post Info…</> : 'Generate Post Info'}</button>
          </>}
        </section>}
      </div>}
    </div>}
    <p className="text-[10px] leading-relaxed text-neutral-500">Artwork only; add lettering in your design editor if needed. AI artwork and generated Post Info are automatically saved to your private My Library for history. Post Info sends this image and the visual prompt to AI for analysis. Shared website-wide capacity, cooldowns and provider quotas still apply. Saving history does not publish, queue or upload anything.</p>
  </div>;
}
