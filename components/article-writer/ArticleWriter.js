"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import CopyButton from "../CopyButton";
import ArticleView from "./ArticleView";
import { generateArticle, countWords } from "@/lib/article";
import { getLibrary, saveToLibrary } from "@/lib/library";
import { saveCloudDraft } from "@/lib/cloud-library";
import { useAuth } from "../providers/AppProvider";
import { generateWithAI } from "@/lib/ai-client";
import GenerationMode, { GenerationReceipt, useGenerationMode } from "../ai/GenerationMode";
import { handoffPin } from "@/lib/publishing/review-content.mjs";
import {
  Sparkles,
  FileText,
  ImagePlus,
  Loader2,
  AlertCircle,
  Wand2,
  BookOpen,
  Check,
  Copy,
  Bookmark,
  ArrowRight,
  Gauge,
  Clock,
  RotateCcw,
  Link2,
} from "lucide-react";

const EXAMPLES = [
  "Simple Balcony Garden Ideas for Small Spaces",
  "Easy Weeknight Dinner Planning for Busy Families",
  "Warm Neutral Bedroom Ideas for a Rental Home",
  "A Beginner’s Guide to Caring for Indoor Herbs",
];

export default function ArticleWriter() {
  const params = useSearchParams(), router = useRouter();
  const { user, authLoading, openLogin } = useAuth();
  const { mode, setMode, status: aiStatus } = useGenerationMode(user);
  const [language, setLanguage] = useState('en');
  const generationRequest = useRef({ sequence: 0, controller: null });
  const imageRequest = useRef({ sequence: 0, controller: null, keys: {}, lastStartedAt: 0 });
  const [saving, setSaving] = useState(false);
  const saveRequest = useRef(null), saveSequence = useRef(0), savePending = useRef(false);
  const [saveError, setSaveError] = useState('');
  const identity = useRef(null);
  identity.current = user?.id || "device";
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageMessage, setImageMessage] = useState("");
  const [article, setArticle] = useState(null);
  const currentContent = useRef(null);
  currentContent.current = article?.id;
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState("");
  const [libraryDrop, setLibraryDrop] = useState(null); // owner-tagged Pin suggestion
  const sourcePin = libraryDrop?.owner === identity.current ? libraryDrop : null;
  const resultRef = useRef(null);
  const toastTimer = useRef(null);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    generationRequest.current.sequence++; generationRequest.current.controller?.abort();
    imageRequest.current.sequence++; imageRequest.current.controller?.abort();imageRequest.current.keys={};imageRequest.current.lastStartedAt=0;setImageBusy(false);setImageMessage('');
    setLoading(false); setError(''); setArticle(previous => previous?.generation ? null : previous);
    return () => { generationRequest.current.sequence++; generationRequest.current.controller?.abort();imageRequest.current.sequence++;imageRequest.current.controller?.abort(); };
  }, [user?.id]);

  // Pull title/topic handed over by the Pin Generator
  useEffect(() => {
    const t = params.get("title");
    const topic = params.get("topic");
    if (t) setTitle(t.slice(0, 200));
    if (['en', 'bn'].includes(params.get('language'))) setLanguage(params.get('language'));
    if (!t && topic) setTitle(topic.slice(0, 200));
  }, [params]);


  const titleWords = useMemo(() => countWords(title), [title]);

  function flash(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2400);
  }

  async function generateArticleImages(target, ownerId=identity.current) {
    if(!user){setImageMessage('Sign in to generate and privately save the three required article images.');openLogin();return;}
    if(!Array.isArray(target?.imageBriefs)||target.imageBriefs.length!==3){setImageMessage('This offline template has no verified AI image briefs. Choose Live AI for a complete illustrated article.');return;}
    const imageSequence=++imageRequest.current.sequence;imageRequest.current.controller?.abort();const controller=new AbortController();imageRequest.current.controller=controller;
    let next={...target,images:Array.isArray(target.images)?[...target.images]:[],imageStatus:'pending',imageError:''};setImageBusy(true);setImageMessage('Preparing the featured image and two section illustrations…');
    try{
      for(let index=0;index<target.imageBriefs.length;index++){
        const brief=target.imageBriefs[index];if(next.images.some(image=>image.role===brief.role&&image.sectionIndex===brief.sectionIndex&&image.assetId))continue;
        if(imageRequest.current.sequence!==imageSequence||identity.current!==ownerId)return;
        setImageMessage(`Generating article image ${index+1} of 3…`);
        const key=`${target.id}:${brief.role}:${brief.sectionIndex===null?'cover':brief.sectionIndex}`,requestKey=imageRequest.current.keys[key]||(imageRequest.current.keys[key]=crypto.randomUUID());
        // The server starts its 15-second cooldown after the request arrives;
        // keep a one-second network/clock margin so the next sequential image
        // does not receive an avoidable 429 after waiting on the client clock.
        const cooldown=Math.max(0,16100-(Date.now()-imageRequest.current.lastStartedAt));
        if(cooldown){setImageMessage(`Waiting ${Math.ceil(cooldown/1000)} seconds for the existing image-quota cooldown…`);await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);const issue=new Error('Image generation was cancelled.');issue.name='AbortError';reject(issue);};const timer=setTimeout(()=>{controller.signal.removeEventListener('abort',abort);resolve();},cooldown);controller.signal.addEventListener('abort',abort,{once:true});});}
        imageRequest.current.lastStartedAt=Date.now();
        const result=await generateWithAI('image',{prompt:brief.prompt,useCase:brief.role==='cover'?'article-cover':'article-section',language},{signal:controller.signal,requestKey});
        if(imageRequest.current.sequence!==imageSequence||identity.current!==ownerId)return;
        if(!/^[a-f0-9]{64}$/.test(result.result?.assetId||''))throw new Error('The image was not saved to private durable storage.');
        next={...next,images:[...next.images,{assetId:result.result.assetId,role:brief.role,sectionIndex:brief.sectionIndex,sectionHeading:brief.sectionIndex===null?'':next.sections[brief.sectionIndex]?.heading||'',altText:brief.altText,width:result.result.width,height:result.result.height}],imageStatus:'pending',imageError:''};
        setArticle(next);setImageMessage(`Saved image ${index+1} of 3 to your private Library.`);
      }
      next={...next,imageStatus:next.images.length===3?'complete':'incomplete',imageError:next.images.length===3?'':'One or more article images are missing.'};setArticle(next);setImageMessage(next.imageStatus==='complete'?'All three AI images are saved privately and ready for review.':next.imageError);
    }catch(issue){
      if(issue.name==='AbortError'||imageRequest.current.sequence!==imageSequence||identity.current!==ownerId)return;
      next={...next,imageStatus:'incomplete',imageError:`Image generation stopped before all three images were saved: ${issue.message}`};setArticle(next);setImageMessage(next.imageError);
    }finally{if(imageRequest.current.sequence===imageSequence&&identity.current===ownerId)setImageBusy(false);}
  }

  async function handleGenerate(e) {
    e?.preventDefault?.();
    const value = title.trim();
    if (!value) { setError("Enter a topic or title first — for example, “Simple Balcony Garden Ideas for Small Spaces”."); return; }
    if (value.length < 10) { setError("That title is a little short. Try at least 10 characters for a clearer article."); return; }
    if (loading || imageBusy || authLoading) return;
    if (mode === 'ai' && !user) { setError('Sign in with a verified account to use live AI, or choose Offline template.'); openLogin(); return; }
    const owner = identity.current, sequence = ++generationRequest.current.sequence;
    imageRequest.current.sequence++;imageRequest.current.controller?.abort();imageRequest.current.keys={};imageRequest.current.lastStartedAt=0;generationRequest.current.controller = new AbortController();
    setError('');setImageMessage('');setSaved(false);setArticle(null);setLoading(true);
    try {
      const topic = params.get('topic')?.slice(0, 160) || undefined;let generated;
      if (mode === 'ai') {
        const result = await generateWithAI('article', { title: value, ...(topic ? { topic } : {}), language }, { signal: generationRequest.current.controller.signal });
        generated = { ...result.result, generation: result.generation, images:[], imageStatus:'pending', imageError:'' };
      } else {
        await new Promise(resolve => requestAnimationFrame(resolve));generated = generateArticle(value, topic);
      }
      if (sequence !== generationRequest.current.sequence || identity.current !== owner) return;
      setArticle(generated);setLoading(false);flash(mode === 'ai' ? 'AI article draft ready' : 'Offline article template generated');
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      if(mode==='ai')await generateArticleImages(generated,owner);
      else setImageMessage('The offline template is text-only. Live AI is required for the featured image and two section images.');
    } catch (issue) { if (issue.name !== 'AbortError' && sequence === generationRequest.current.sequence && identity.current === owner) setError(issue.message); }
    finally { if (sequence === generationRequest.current.sequence) setLoading(false); }
  }

  useEffect(() => { saveSequence.current++; setSaving(false); setSaved(false); setSaveError(''); saveRequest.current = null; savePending.current = false; }, [user?.id, article?.id]);
  useEffect(() => {
    setLibraryDrop(null);
    if (authLoading) return;
    if (!user) {
      const pin = getLibrary().find(item => item.type === "pin");
      if (pin) setLibraryDrop({ owner: "device", topic: pin.topic, title: pin.titles?.[0], description: pin.description, hashtags: pin.hashtags });
      return;
    }
    let active = true;
    fetch("/api/library", { credentials: "same-origin", cache: "no-store" }).then(r => r.ok ? r.json() : null).then(data => {
      const pin = data?.items?.find(item => item.kind !== "article_draft" && item.content?.title);
      if (active && pin) setLibraryDrop({ owner: user.id, topic: pin.topic, title: pin.content.title, description: pin.content.description, hashtags: pin.content.hashtags });
    }).catch(() => {});
    return () => { active = false; };
  }, [authLoading, user?.id]);
  async function storeArticle(openReview = false) {
    if (!article || savePending.current || authLoading || imageBusy) return;
    if(openReview&&(article.wordCount<1000||article.wordCount>1600)){setSaveError('Publishing review accepts articles between 1,000 and 1,600 words. Generate a complete Live AI article first. No job was created.');return;}
    if(openReview&&(article.imageStatus!=='complete'||article.images?.length!==3)){setSaveError(article.imageError||'Generate and save the AI cover plus both section images before opening publishing review. No job was created.');return;}
    if (openReview && !user) { openLogin(); return; }
    const owner = identity.current, contentId = article.id, request = ++saveSequence.current;
    savePending.current = true; setSaving(true); setSaveError('');
    try {
      let draftId;
      if (user) {
        if (!saveRequest.current) saveRequest.current = crypto.randomUUID();
        draftId = await saveCloudDraft("article", article, saveRequest.current);
      } else saveToLibrary({ type: "article", ...article });
      if (identity.current !== owner || currentContent.current !== contentId || request !== saveSequence.current) return;
      setSaved(true);
      if (openReview) {
        if (sourcePin) handoffPin(user.id, sourcePin);
        router.push('/publish?draft=' + encodeURIComponent(draftId));
      } else flash(user ? "Saved privately to your Cloud Library." : "Saved to My Library on this device 📚");
    } catch (issue) {
      if (identity.current === owner && currentContent.current === contentId && request === saveSequence.current) setSaveError(issue.message || 'Your draft could not be saved. Keep this page open and try again.');
    } finally {
      if (request === saveSequence.current) { savePending.current = false; setSaving(false); }
    }
  }
  function handleSave() { return storeArticle(false); }



  return (
    <div className="relative">
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center px-5">
          <div role="status" className="animate-pop-in max-w-lg rounded-2xl bg-neutral-900 px-4 py-2.5 text-center text-[13px] font-bold text-white shadow-xl">
            {toast}
          </div>
        </div>
      )}

      {/* header */}
      <section className="relative overflow-hidden border-b border-neutral-100">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -left-20 -top-28 h-80 w-80 rounded-full bg-brand-50 blur-3xl" />
          <div className="absolute -right-24 top-10 h-72 w-72 rounded-full bg-amber-50 blur-3xl" />
        </div>

        <div className="container-x py-10 sm:py-14">
          <nav className="mb-4 flex items-center gap-1.5 text-[12px] font-semibold text-neutral-400">
            <Link href="/" prefetch={false} className="hover:text-brand-600">
              Home
            </Link>
            <span>/</span>
            <span className="text-neutral-600">Article Writer</span>
          </nav>

          <span className="eyebrow">
            <Sparkles size={13} /> Professional SEO article · 1,000–1,600 words
          </span>

          <h1 className="h1 mt-4 text-neutral-900">Auto Article Writer</h1>
          <p className="lead mt-3 max-w-2xl">
            Create a practical draft with a 50–60-character H1, linked contents, useful H2/H3 sections, tips and common mistakes, FAQs, SEO suggestions and three original AI illustrations. Factual claims are not source-verified; add only exact sources you have opened and checked during publishing review.
          </p>
        </div>
      </section>

      <div className="container-x py-8 sm:py-12">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          {/* ------------------------------ main ------------------------------ */}
          <div className="min-w-0">
            <form
              onSubmit={handleGenerate}
              className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6"
            >
              <GenerationMode mode={mode} setMode={setMode} status={aiStatus} disabled={loading || authLoading} />
              {mode === 'ai' && <label className="mb-4 flex items-center justify-between gap-3 text-[12px] font-bold text-neutral-600">AI output language<select aria-label="AI output language" value={language} onChange={event => setLanguage(event.target.value)} disabled={loading} className="min-h-11 rounded-lg border border-neutral-300 bg-white px-3 text-[13px]"><option value="en">English</option><option value="bn">বাংলা</option></select></label>}
              <label
                htmlFor="pin-title"
                className="mb-2 block text-[13px] font-bold uppercase tracking-[0.08em] text-neutral-500"
              >
                Enter a topic or working title
              </label>

              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300">
                  <FileText size={18} />
                </span>
                <input
                  id="pin-title"
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setError("");
                  }}
                  placeholder="Simple Balcony Garden Ideas for Small Spaces"
                  autoComplete="off"
                  maxLength={200}
                  aria-invalid={!!error}
                  aria-describedby={error ? "article-title-error" : undefined}
                  className={`h-[58px] w-full rounded-xl border-2 bg-white pl-11 pr-4 text-[16px] font-semibold text-neutral-900 outline-none transition placeholder:font-normal placeholder:text-neutral-400 focus:ring-4 ${
                    error
                      ? "border-brand-600 focus:ring-brand-50"
                      : "border-neutral-200 focus:border-brand-600 focus:ring-brand-50"
                  }`}
                />
              </div>

              {error && (
                <p id="article-title-error" role="alert" className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-600">
                  <AlertCircle size={14} /> {error}
                </p>
              )}

              {/* use title from pin generator */}
              <button
                type="button"
                onClick={() => {
                  if (sourcePin?.title) {
                    setTitle(sourcePin.title);
                    setError("");
                    flash("Title pulled from your saved pin");
                  } else {
                    flash("No saved pin yet — generate a pin first");
                  }
                }}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/40 px-4 py-3 text-[13px] font-bold text-brand-700 transition-colors hover:border-brand-400 hover:bg-brand-50 active:scale-[.99]"
              >
                <Link2 size={15} /> Use Title From Pin Generator
              </button>

              {sourcePin?.title ? (
                <p className="mt-1.5 truncate px-1 text-[11px] text-neutral-400">
                  Latest saved pin: “{sourcePin.title}”
                </p>
              ) : (
                <p className="mt-1.5 px-1 text-[11px] text-neutral-400">
                  Nothing saved yet —{" "}
                  <Link
                    href="/pin-generator"
                    prefetch={false}
                    className="font-bold text-brand-600"
                  >
                    create a pin first
                  </Link>
                  .
                </p>
              )}

              {/* examples */}
              <div className="mt-3">
                <p className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wide text-neutral-400">
                  Try an example
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => {
                        setTitle(ex);
                        setError("");
                      }}
                      className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[12px] font-semibold text-neutral-600 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 active:scale-95"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              <button type="submit" disabled={loading || imageBusy || authLoading} className="btn-primary mt-5 w-full">
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Writing your article…
                  </>
                ) : (
                  <>
                    <Wand2 size={18} /> Generate Article
                  </>
                )}
              </button>
              <p className="mt-2.5 text-center text-[11.5px] text-neutral-400">
                {titleWords ? `${titleWords} words in title · ` : ""}
                50–60-character H1 + linked contents + 4 H2/H3 sections + tips + FAQs
              </p>
            </form>

            {/* loading skeleton */}
            {loading && (
              <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-5">
                <div className="h-3 w-24 animate-pulse rounded-full bg-neutral-100" />
                <div className="mt-4 h-6 w-3/4 animate-pulse rounded-lg bg-neutral-100" />
                <div className="mt-5 space-y-2">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-2.5 animate-pulse rounded-full bg-neutral-100"
                      style={{ width: `${92 - i * 9}%` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ------------------------------ article ------------------------------ */}
            {article && !loading && (
              <div ref={resultRef} className="animate-fade-up mt-6 scroll-mt-20">
                <GenerationReceipt generation={article.generation} />
                {saveError && <p role="alert" className="mb-4 rounded-xl border border-brand-100 bg-brand-50 p-3 text-[12px] leading-relaxed text-brand-800">{saveError} Your article is still on this page; use Save to retry.</p>}
                <ArticleView article={article} />
                {article.generation?.kind==='ai'&&<section className={`mt-4 rounded-2xl border p-4 sm:p-5 ${article.imageStatus==='complete'?'border-emerald-200 bg-emerald-50/40':'border-amber-200 bg-amber-50/50'}`} data-testid="article-image-status" aria-live="polite"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-brand-700"><ImagePlus size={17} aria-hidden="true"/></span><div className="min-w-0 flex-1"><h2 className="text-[13px] font-extrabold">Three article images · {article.images?.length||0}/3 saved</h2><p className="mt-1 text-[11px] leading-relaxed text-neutral-600">{imageBusy?imageMessage:article.imageStatus==='complete'?'All three original AI images are stored privately and ready for publication review.':article.imageError||imageMessage||'The cover and two section images are required before publication. Image generation uses the existing daily allowance.'}</p>{article.imageStatus!=='complete'&&<button type="button" disabled={imageBusy||!user||!article.imageBriefs?.length} onClick={()=>generateArticleImages(article)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 text-[11px] font-bold text-neutral-700 disabled:opacity-50">{imageBusy?<Loader2 size={14} className="animate-spin" aria-hidden="true"/>:<ImagePlus size={14} aria-hidden="true"/>}{imageBusy?'Generating image…':article.images?.length?'Generate missing image':'Generate three AI images'}</button>}</div></div></section>}

                <section className="mt-4 rounded-2xl border border-brand-100 bg-brand-50/30 p-5" data-testid="article-publishing-handoff">
                  <h2 className="text-[15px] font-extrabold">Ready to publish this article?</h2>
                  <p className="mt-2 text-[12px] leading-relaxed text-neutral-600">Publishing review requires 1,000–1,600 words and the original AI cover plus both section illustrations. Choose your verified blog and add two to five relevant live internal links in the review. This step creates no job or recurring permission.</p>
                  {(article.wordCount<1000||article.wordCount>1600||article.imageStatus!=='complete'||article.images?.length!==3)&&<p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">Not publish-ready: {article.wordCount<1000||article.wordCount>1600?'the word count is outside 1,000–1,600. ':''}{article.imageStatus!=='complete'||article.images?.length!==3?'one or more required AI images are missing.':''} Offline templates can be saved, but they cannot enter publishing review.</p>}
                  <button type="button" disabled={saving || imageBusy || authLoading || article.wordCount<1000 || article.wordCount>1600 || article.imageStatus!=='complete' || article.images?.length!==3} onClick={() => storeArticle(true)} className="btn-primary mt-4 !min-h-11 !px-4 !text-[12px]">{saving ? <Loader2 size={15} className="animate-spin" aria-hidden="true"/> : <ArrowRight size={15} aria-hidden="true"/>}{saved ? 'Open publishing review' : 'Save & open publishing review'}</button>
                </section>

                {/* stats + actions */}
                <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="grid grid-cols-3 gap-2.5">
                    <Stat
                      icon={FileText}
                      label="Word Count"
                      value={article.wordCount}
                      tone="neutral"
                    />
                    <Stat
                      icon={Gauge}
                      label="SEO Score"
                      value={`${article.seoScore.total}/100`}
                      tone="brand"
                    />
                    <Stat
                      icon={Clock}
                      label="Read Time"
                      value={`${article.readMinutes} min`}
                      tone="neutral"
                    />
                  </div>

                  {/* SEO breakdown */}
                  <details className="mt-3 rounded-xl bg-neutral-50 p-3">
                    <summary className="cursor-pointer text-[12px] font-bold text-neutral-600">
                      Why this score? ({article.seoScore.detail.length} checks)
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {article.seoScore.detail.map((d, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-neutral-500"
                        >
                          <Check size={12} className="mt-0.5 shrink-0 text-emerald-500" />
                          {d}
                        </li>
                      ))}
                    </ul>
                  </details>

                  <div className="mt-4 grid min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <div className="w-full sm:flex-1">
                      <CopyButton
                        text={article.plainText}
                        label="Copy Full Article"
                        copiedLabel="Article Copied"
                        variant="soft"
                        className="h-[52px] w-full rounded-xl text-[14px] hover:bg-neutral-200"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saved || saving || imageBusy || authLoading}
                      className={`w-full !px-3 !text-[14px] sm:flex-1 ${
                        saved ? "btn-outline border-emerald-200 text-emerald-600" : "btn-dark"
                      }`}
                    >
                      {saved ? (
                        <>
                          <Check size={17} strokeWidth={3} /> Saved to My Library
                        </>
                      ) : (
                        <>
                          {saving ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Bookmark size={17} />} {saving ? 'Saving…' : 'Save To My Library'}
                        </>
                      )}
                    </button>
                  </div>
                  <p className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-neutral-600">Saving this article creates a private draft, not a publication. To publish this article, use the publishing review above. A manual Pin pack is optional; Pinterest uploads remain yours.</p>

                  <button
                    type="button"
                    onClick={() => {
                      imageRequest.current.sequence++;imageRequest.current.controller?.abort();setImageBusy(false);setImageMessage('');
                      setArticle(null);
                      setTitle("");
                      setSaved(false);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-neutral-500 hover:text-brand-600"
                  >
                    <RotateCcw size={13} /> Write another article
                  </button>
                </div>
              </div>
            )}

            {/* empty state */}
            {!article && !loading && (
              <div className="mt-5 rounded-2xl border-2 border-dashed border-neutral-200 p-8 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-neutral-100 text-neutral-400">
                  <BookOpen size={22} />
                </div>
                <p className="mt-3 text-[14px] font-bold text-neutral-700">
                  Your article will appear here
                </p>
                <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-neutral-400">
                  Paste a pin title above and tap <b>Generate Article</b>. You get
                  a structured article draft to review before publishing.
                </p>
              </div>
            )}
          </div>

          {/* ------------------------------ sidebar ------------------------------ */}
          <aside className="space-y-4 lg:sticky lg:top-20">
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h2 className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-neutral-500">
                Article structure
              </h2>
              <ul className="mt-3 space-y-2.5">
                {[
                  ["H1", "Main heading", "Your pin title, exactly"],
                  ["¶", "Intro", "80–100 words, emotional"],
                  ["H2", "4 main sections", "2 paragraphs + one H3 each"],
                  ["☰", "3–5 FAQs", "Answers to real search questions"],
                  ["✓", "Conclusion", "Clear takeaway + next step"],
                ].map(([n, t, s]) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-brand-50 text-[10.5px] font-extrabold text-brand-700">
                      {n}
                    </span>
                    <div>
                      <p className="text-[13px] font-bold leading-tight text-neutral-800">
                        {t}
                      </p>
                      <p className="text-[11px] text-neutral-400">{s}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl bg-neutral-950 p-4">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                Why it matters
              </p>
              <p className="mt-1.5 text-[14.5px] font-extrabold leading-snug text-white">
                Give every Pin a useful destination
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-neutral-400">
                Clear headings and original, useful information help people
                decide whether to keep reading. Traffic and earnings are not measured or guaranteed here.
              </p>
              <Link
                href="/pin-generator"
                prefetch={false}
                className="mt-3.5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-[13px] font-bold text-neutral-900 transition-colors hover:bg-neutral-100"
              >
                Back to Pin Generator <ArrowRight size={15} />
              </Link>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-[11.5px] leading-relaxed text-neutral-500">
                <b className="text-neutral-700">Tip:</b> publish at least one
                article per Pin. Each post is a new page that may attract search visits
                and ad impressions over time.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        tone === "brand"
          ? "border-brand-100 bg-brand-50/60"
          : "border-neutral-150 bg-neutral-50/60"
      }`}
    >
      <Icon
        size={14}
        className={tone === "brand" ? "text-brand-600" : "text-neutral-400"}
      />
      <p
        className={`mt-1.5 text-[17px] font-extrabold leading-none ${
          tone === "brand" ? "text-brand-700" : "text-neutral-900"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </p>
    </div>
  );
}
