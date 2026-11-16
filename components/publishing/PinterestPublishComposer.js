"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, ImagePlus, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../providers/AppProvider';

const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const field = 'mt-1.5 min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-[16px] font-normal outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-50 sm:text-[13px]';

function toDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The selected image could not be read.'));
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The selected image could not be prepared.'));
    reader.readAsDataURL(blob);
  });
}
function toBlob(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}
function postInfoDescription(postInfo) {
  if (!postInfo) return '';
  const description = String(postInfo.description || '').trim();
  const tags = Array.isArray(postInfo.hashtags) ? postInfo.hashtags.join(' ') : '';
  const combined = [description, tags].filter(Boolean).join('\n\n');
  return combined.length <= 500 ? combined : description.slice(0, 500);
}

export default function PinterestPublishComposer({ image, postInfo }) {
  const { user, authLoading, openLogin } = useAuth();
  const [imageDataUrl, setImageDataUrl] = useState(image?.dataUrl || '');
  const [imageName, setImageName] = useState('Generated Pin artwork');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [destinationURL, setDestinationURL] = useState('');
  const [rememberDestination, setRememberDestination] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preparedJob, setPreparedJob] = useState(null);
  const [readingFile, setReadingFile] = useState(false);
  const requestId = useRef(null);
  const titleEdited = useRef(false);
  const descriptionEdited = useRef(false);
  const destinationEdited = useRef(false);

  useEffect(() => {
    if (!titleEdited.current) setTitle(postInfo?.title || image?.topic || '');
    if (!descriptionEdited.current) setDescription(postInfoDescription(postInfo));
  }, [image?.topic, postInfo]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetch('/api/pinterest/publishing', { cache: 'no-store', credentials: 'same-origin' })
      .then(async response => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Private Pin settings could not be loaded.');
        return result;
      })
      .then(result => { if (alive && !destinationEdited.current && result.settings?.defaultDestinationURL) setDestinationURL(result.settings.defaultDestinationURL); })
      .catch(() => {});
    return () => { alive = false; };
  }, [user?.id]);

  function resetAfterEdit() {
    requestId.current = null;
    setError('');
    setNotice('');
  }

  async function chooseFile(file) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('Choose a still PNG, JPEG or WebP image.'); return; }
    if (file.size < 100 || file.size > 12000000) { setError('The source file must be under 12 MB. PinCraft will resize it locally before upload.'); return; }
    setReadingFile(true); setError(''); setNotice(''); setPreparedJob(null); setConsent(false); resetAfterEdit();
    let bitmap;
    try {
      if (typeof createImageBitmap !== 'function') throw new Error('This browser cannot safely resize the selected image. Use the generated Pin artwork or a current browser.');
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const width = bitmap.width, height = bitmap.height;
      if (!width || !height || width < 400 || height < 600 || width > 4096 || height > 4096 || width * height > 16000000 || width / height < 0.4 || width / height > 1.0) {
        throw new Error('Choose a portrait image at least 400 × 600 pixels with a 0.4–1.0 width/height ratio.');
      }
      const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 1500;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Your browser could not prepare this image.');
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / width, canvas.height / height);
      const outputWidth = Math.round(width * scale), outputHeight = Math.round(height * scale);
      context.drawImage(bitmap, Math.round((canvas.width - outputWidth) / 2), Math.round((canvas.height - outputHeight) / 2), outputWidth, outputHeight);
      let output = await toBlob(canvas, 'image/webp', 0.82);
      if (!output || !['image/webp', 'image/jpeg'].includes(output.type)) output = await toBlob(canvas, 'image/jpeg', 0.8);
      if (output && output.size > 650000) output = await toBlob(canvas, output.type, 0.62);
      if (!output || output.size > 680000) throw new Error('This image remains too large after resizing. Choose a simpler image or use the generated Pin artwork.');
      const data = await toDataURL(output);
      setImageDataUrl(data); setImageName(file.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 100) || 'Selected Pin artwork');
      setNotice('A 1000 × 1500 copy was prepared in this browser. The original file was not uploaded.');
    } catch (issue) { setError(issue.message || 'The selected image could not be prepared.'); }
    finally { bitmap?.close?.(); setReadingFile(false); }
  }

  async function prepare() {
    if (authLoading || busy || readingFile) return;
    if (!user) { openLogin(); return; }
    if (!consent) { setError('Review the image-retention and public-image notice and confirm before preparing.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      if (!requestId.current) requestId.current = crypto.randomUUID();
      const response = await fetch('/api/pinterest/publishing', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prepare', requestId: requestId.current, title, description, destinationURL, imageDataUrl, consent: true, rememberDestination }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'The Pin could not be prepared. No Pinterest publication was attempted.');
      setPreparedJob(result.job);
      setNotice(result.duplicate ? 'An identical recent Pin job was reused; no duplicate job was created.' : 'Pin Prepared. Nothing has been sent to Pinterest.');
    } catch (issue) { setError(issue.message || 'The Pin could not be prepared. No success was assumed.'); }
    finally { setBusy(false); }
  }

  return <section data-testid="pinterest-publish-composer" className="mt-4 rounded-xl border border-brand-200 bg-brand-50/40 p-3.5 sm:p-4">
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-brand-700"><ImagePlus size={17} aria-hidden="true" /></span>
      <div><h3 className="text-[12px] font-extrabold text-neutral-900">Prepare a Pin for Pinterest</h3><p className="mt-1 text-[10.5px] leading-relaxed text-neutral-600">Create a private job, then open Pinterest yourself to choose a board, review and manually Save. PinCraft never signs in or posts for you.</p></div>
    </div>

    {preparedJob ? <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-3.5" role="status">
      <p className="flex items-center gap-2 text-[12px] font-extrabold text-emerald-800"><CheckCircle2 size={16} aria-hidden="true" />Pin Prepared</p>
      <p className="mt-2 text-[11px] leading-relaxed text-neutral-600">The image, title, description and destination were saved to your private job. This is not a published Pin.</p>
      <p className="mt-2 break-all font-mono text-[10px] text-neutral-500">Job ID: {preparedJob.id}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/jobs" prefetch={false} className={`${button} bg-brand-600 text-white hover:bg-brand-700`}>Open Publishing Jobs <ArrowRight size={14} aria-hidden="true" /></Link>
        <button type="button" onClick={() => { setPreparedJob(null); setConsent(false); requestId.current = null; setNotice(''); setError(''); }} className={`${button} border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50`}>Prepare another Pin</button>
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-neutral-500">Next: open the job in Publishing Jobs, select a board and click Save in Pinterest. Confirming and recording a Pin are separate steps.</p>
    </div> : <>
      <label className="mt-4 block text-[11px] font-bold text-neutral-700">Pin title<input aria-label="Publishing Pin title" value={title} maxLength={100} onChange={event => { titleEdited.current = true; setTitle(event.target.value); resetAfterEdit(); }} className={field} placeholder="A clear, useful Pin title" /></label>
      <div className="mt-3"><label htmlFor="pinterest-publish-description" className="block text-[11px] font-bold text-neutral-700">Description</label><textarea id="pinterest-publish-description" aria-label="Publishing Pin description" value={description} maxLength={500} onChange={event => { descriptionEdited.current = true; setDescription(event.target.value); resetAfterEdit(); }} rows={4} className={`${field} min-h-24 resize-y`} placeholder="Describe what viewers will find and why the Pin is useful…" /><p className="mt-1 text-right text-[10px] font-normal text-neutral-400">{description.length} / 500</p></div>
      <label className="mt-3 block text-[11px] font-bold text-neutral-700">Destination URL<input aria-label="Pinterest destination URL" type="url" value={destinationURL} maxLength={2048} onChange={event => { destinationEdited.current = true; setDestinationURL(event.target.value); resetAfterEdit(); }} className={field} placeholder="https://example.com/your-page" /></label>

      <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
        <p className="text-[11px] font-extrabold text-neutral-800">Pin image · {imageName}</p>
        <p className="mt-1 text-[10px] leading-relaxed text-neutral-500">One still portrait PNG, JPEG or WebP. A normalized copy is 1000 × 1500 WebP; image metadata is stripped.</p>
        {imageDataUrl && <img src={imageDataUrl} alt="Preview of the image selected for your Pinterest Pin" width="1000" height="1500" className="mx-auto mt-3 max-h-56 w-auto max-w-full rounded-lg bg-neutral-50 object-contain" />}
        <label className="mt-3 block text-[10.5px] font-bold text-neutral-700">Choose different artwork (optional)<input aria-label="Alternative Pinterest Pin artwork" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || readingFile} onChange={event => chooseFile(event.target.files?.[0])} className="mt-2 block min-h-11 w-full text-[11px] file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:font-bold" /></label>
        {readingFile && <p role="status" className="mt-2 text-[10.5px] text-neutral-600">Resizing this image locally…</p>}
      </div>

      {!authLoading && !user ? <button type="button" onClick={openLogin} className={`${button} mt-4 w-full bg-neutral-900 text-white hover:bg-black`}><ShieldCheck size={15} aria-hidden="true" />Sign in to prepare a private Pin job</button> : <>
        <label className="mt-3 flex items-start gap-2.5 text-[10.5px] leading-relaxed text-neutral-600"><input type="checkbox" checked={rememberDestination} onChange={event => setRememberDestination(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#E60023]" />Save this destination as my private Pin publishing default.</label>
        <label className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10.5px] leading-relaxed text-amber-950"><input aria-label="Confirm Pin image storage and public delivery" type="checkbox" checked={consent} onChange={event => { setConsent(event.target.checked); setError(''); }} className="mt-0.5 h-4 w-4 shrink-0 accent-[#E60023]" /><span>I reviewed this Pin and authorize PinCraft to keep its normalized image in my private job. A signed image URL is publicly fetchable so Pinterest can load it; anyone with that URL may view the image. No Pinterest account data is collected.</span></label>
        <button type="button" onClick={prepare} disabled={busy || readingFile || !consent || !imageDataUrl || title.trim().length < 3 || description.trim().length < 10 || !destinationURL.trim()} className={`${button} mt-4 w-full bg-brand-600 text-white hover:bg-brand-700`}>
          {busy ? <><Loader2 size={15} className="animate-spin" aria-hidden="true" />Preparing and validating…</> : 'Prepare Pin job'}
        </button>
      </>}
    </>}
    {notice && <p className="mt-3 text-[10.5px] leading-relaxed text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-[11px] leading-relaxed text-red-800">{error}</p>}
    <p className="mt-3 text-[10px] leading-relaxed text-neutral-500">Preparing or opening Pinterest does not count as publishing. The title is saved for your review and copy; Pinterest’s official interface may prefill the supported image, destination and description, but you must review its form, select your board and manually confirm Save.</p>
  </section>;
}
