"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import CopyButton from "../CopyButton";
import ResultSection from "./ResultSection";
import { generatePinPack, wordCount } from "@/lib/generator";
import { saveToLibrary } from "@/lib/library";
import { saveCloudDraft } from "@/lib/cloud-library";
import { useAuth } from "../providers/AppProvider";
import { copyText } from "@/lib/clipboard";
import { generateWithAI } from "@/lib/ai-client";
import GenerationMode, { GenerationReceipt, useGenerationMode } from "../ai/GenerationMode";
import ImageGenerator from "../ai/ImageGenerator";
import { handoffPin } from "@/lib/publishing/review-content.mjs";
import {
  Sparkles,
  Wand2,
  Hash,
  Type,
  FileText,
  Image as ImageIcon,
  ArrowRight,
  Bookmark,
  Check,
  AlertCircle,
  Search,
  Loader2,
} from "lucide-react";

const EXAMPLES = [
  "Sad Quotes",
  "Home Decor Ideas",
  "Easy Dinner Recipes",
  "Motivation for Students",
  "Skincare Routine",
  "Balcony Gardening",
];

export default function PinGenerator() {
  const { user, authLoading, openLogin } = useAuth();
  const { mode, setMode, status: aiStatus } = useGenerationMode(user);
  const generationRequest = useRef({ sequence: 0, controller: null });
  const [language, setLanguage] = useState('en');
  const [saving, setSaving] = useState(false);
  const saveRequest = useRef(null), saveSequence = useRef(0);
  const [saveError, setSaveError] = useState('');
  const identity = useRef(null);
  identity.current = user?.id || "device";
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [pack, setPack] = useState(null);
  const currentContent = useRef(null);
  currentContent.current = pack?.id;
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState("");
  const resultsRef = useRef(null);
  const toastTimer = useRef(null);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => { const value = new URLSearchParams(window.location.search).get('topic'); if (value) setTopic(value.slice(0, 160)); }, []);
  useEffect(() => {
    generationRequest.current.sequence++; generationRequest.current.controller?.abort();
    setLoading(false); setError(''); setPack(previous => previous?.generation ? null : previous);
    return () => { generationRequest.current.sequence++; generationRequest.current.controller?.abort(); };
  }, [user?.id]);

  const descWords = useMemo(
    () => (pack ? wordCount(pack.description) : 0),
    [pack]
  );

  function flash(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }

  async function handleGenerate(e) {
    e?.preventDefault?.();
    const value = topic.trim();
    if (!value) {
      setError("Please type a topic first — e.g. “Sad Quotes”.");
      return;
    }
    if (value.length < 3) {
      setError("Topic is too short. Try at least 3 characters.");
      return;
    }
    if (loading || authLoading) return;
    if (mode === 'ai' && !user) { setError('Sign in with a verified account to use live AI, or choose Offline template.'); openLogin(); return; }
    const owner = identity.current, sequence = ++generationRequest.current.sequence;
    generationRequest.current.controller = new AbortController();
    setError(''); setSaved(false); setPack(null); setLoading(true);
    try {
      let generated;
      if (mode === 'ai') {
        const result = await generateWithAI('pin', { topic: value, language }, { signal: generationRequest.current.controller.signal });
        generated = { ...result.result, generation: result.generation };
      } else {
        await new Promise(resolve => requestAnimationFrame(resolve));
        generated = generatePinPack(value);
      }
      if (sequence !== generationRequest.current.sequence || identity.current !== owner) return;
      setPack(generated); flash(mode === 'ai' ? 'AI Pin pack generated' : 'Offline pin template generated');
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (issue) { if (issue.name !== 'AbortError' && sequence === generationRequest.current.sequence && identity.current === owner) setError(issue.message); }
    finally { if (sequence === generationRequest.current.sequence) setLoading(false); }
  }

  useEffect(() => { saveSequence.current++; setSaving(false); setSaved(false); setSaveError(''); saveRequest.current = null; }, [user?.id, pack?.id]);
  async function handleSave() {
    if (!pack || saving || authLoading) return;
    const owner = identity.current, contentId = pack.id, request = ++saveSequence.current;
    setSaving(true); setSaveError('');
    try {
      if (user) {
        if (!saveRequest.current) saveRequest.current = crypto.randomUUID();
        await saveCloudDraft("pin", pack, saveRequest.current);
      } else saveToLibrary({ type: "pin", ...pack });
      if (identity.current !== owner || currentContent.current !== contentId || request !== saveSequence.current) return;
      setSaved(true);
      flash(user ? "Saved privately to your Cloud Library." : "Saved to My Library on this device 📚");
    } catch (issue) { if (identity.current === owner && currentContent.current === contentId && request === saveSequence.current) setSaveError(issue.message || 'Your draft could not be saved. Keep this page open and try again.'); }
    finally { if (request === saveSequence.current) setSaving(false); }
  }

  const articleHref = pack
    ? `/article-writer?title=${encodeURIComponent(pack.titles[0])}&topic=${encodeURIComponent(
        pack.topic
      )}`
    : "/article-writer";

  return (
    <div className="relative">
      {/* toast */}
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
            <span className="text-neutral-600">Pin Generator</span>
          </nav>

          <span className="eyebrow">
            <Sparkles size={13} /> Offline templates + live AI
          </span>

          <h1 className="h1 mt-4 text-neutral-900">Pin Generator</h1>
          <p className="lead mt-3 max-w-2xl">
            Just type your topic, PinCraft will create everything automatically —
            5 title ideas, an SEO description, 10 hashtags and a pin image idea.
          </p>
        </div>
      </section>

      <div className="container-x py-8 sm:py-12">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          {/* ---------------------------- main column ---------------------------- */}
          <div className="min-w-0">
            {/* input card */}
            <form
              onSubmit={handleGenerate}
              className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6"
            >
              <GenerationMode mode={mode} setMode={setMode} status={aiStatus} disabled={loading || authLoading} />
              {mode === 'ai' && <label className="mb-4 flex items-center justify-between gap-3 text-[12px] font-bold text-neutral-600">AI output language<select aria-label="AI output language" value={language} onChange={event => setLanguage(event.target.value)} disabled={loading} className="min-h-11 rounded-lg border border-neutral-300 bg-white px-3 text-[13px]"><option value="en">English</option><option value="bn">বাংলা</option></select></label>}
              <label
                htmlFor="topic"
                className="mb-2 block text-[13px] font-bold uppercase tracking-[0.08em] text-neutral-500"
              >
                Enter your topic
              </label>

              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300">
                  <Search size={18} />
                </span>
                <input
                  id="topic"
                  name="topic"
                  type="text"
                  value={topic}
                  onChange={(e) => {
                    setTopic(e.target.value);
                    setError("");
                  }}
                  placeholder="Sad Quotes"
                  autoComplete="off"
                  maxLength={160}
                  aria-invalid={!!error}
                  aria-describedby={error ? "topic-error" : undefined}
                  className={`h-[58px] w-full rounded-xl border-2 bg-white pl-11 pr-4 text-[16px] font-semibold text-neutral-900 outline-none transition placeholder:font-normal placeholder:text-neutral-400 focus:ring-4 ${
                    error
                      ? "border-brand-600 focus:ring-brand-50"
                      : "border-neutral-200 focus:border-brand-600 focus:ring-brand-50"
                  }`}
                />
              </div>

              {error && (
                <p
                  id="topic-error"
                  role="alert"
                  className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-600"
                >
                  <AlertCircle size={14} /> {error}
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
                        setTopic(ex);
                        setError("");
                      }}
                      className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[12px] font-semibold text-neutral-600 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 active:scale-95"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || authLoading}
                className="btn-primary mt-5 w-full"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Wand2 size={18} /> Generate Pin
                  </>
                )}
              </button>
              <p className="mt-2.5 text-center text-[11.5px] text-neutral-400">
                {mode === 'ai' ? 'Original AI content · Automatic recovery · Daily limits apply' : 'Instant offline templates · 5 titles + description + 10 hashtags + image idea'}
              </p>
            </form>

            {/* loading skeleton */}
            {loading && (
              <div className="mt-5 space-y-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4"
                    style={{ opacity: 1 - i * 0.22 }}
                  >
                    <div className="h-10 w-10 animate-pulse rounded-xl bg-neutral-100" />
                    <div className="flex-1 space-y-2">
                      <div className="h-2.5 w-2/3 animate-pulse rounded-full bg-neutral-100" />
                      <div className="h-2.5 w-1/3 animate-pulse rounded-full bg-neutral-100" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ---------------------------- results ---------------------------- */}
            {pack && !loading && (
              <div ref={resultsRef} className="animate-fade-up mt-6 scroll-mt-20">
                <GenerationReceipt generation={pack.generation} />
                {saveError && <p role="alert" className="mb-4 rounded-xl border border-brand-100 bg-brand-50 p-3 text-[12px] leading-relaxed text-brand-800">{saveError} Your draft is still on this page; use Save to retry.</p>}
                {pack.keywords?.length > 0 && <div className="mb-3 rounded-xl border border-neutral-200 bg-white p-3.5"><p className="text-[11px] font-bold text-neutral-600">SEO keyword suggestions · not measured search data</p><div className="mt-2 flex flex-wrap gap-1.5">{pack.keywords.map(keyword => <span key={keyword} className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] text-neutral-600">{keyword}</span>)}</div></div>}
                {/* result header */}
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-[15px]">
                      {pack.emoji}
                    </span>
                    <div>
                      <p className="text-[15px] font-extrabold leading-tight text-neutral-900">
                        {pack.topic}
                      </p>
                      <p className="text-[11.5px] font-semibold text-neutral-400">
                        Detected niche: {pack.category}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-600">
                    <Check size={12} strokeWidth={3} /> Generated
                  </span>
                </div>

                <div className="space-y-3">
                  {/* 1 · titles */}
                  <ResultSection
                    step="01"
                    title="Pin Title Ideas"
                    meta={`${pack.titles.length} clickable titles`}
                    icon={Type}
                    defaultOpen
                  >
                    <ul className="space-y-2">
                      {pack.titles.map((title, i) => (
                        <li
                          key={i}
                          className="group flex items-start gap-3 rounded-xl border border-neutral-150 bg-neutral-50/60 p-3 transition-colors hover:border-neutral-300"
                        >
                          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-[11px] font-extrabold text-white">
                            {i + 1}
                          </span>
                          <p className="min-w-0 flex-1 text-[13.5px] font-semibold leading-relaxed text-neutral-800">
                            {title}
                          </p>
                          <CopyButton text={title} label="Copy" />
                        </li>
                      ))}
                    </ul>
                  </ResultSection>

                  {/* 2 · description */}
                  <ResultSection
                    step="02"
                    title="Pin Description"
                    meta={`SEO friendly · ${descWords} words`}
                    icon={FileText}
                  >
                    <div className="rounded-xl border border-neutral-150 bg-neutral-50/60 p-3.5">
                      <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-neutral-700">
                        {pack.description}
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">
                          {descWords} words
                        </span>
                        <CopyButton text={pack.description} label="Copy description" />
                      </div>
                    </div>
                  </ResultSection>

                  {/* 3 · hashtags */}
                  <ResultSection
                    step="03"
                    title="Hashtags"
                    meta={`${pack.hashtags.length} hashtags`}
                    icon={Hash}
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {pack.hashtags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={async () => { const copied = await copyText(tag); flash(copied ? `Copied ${tag}` : "Copy failed. Select and copy the hashtag manually, or try again."); }}
                          title="Click to copy this hashtag"
                          className="min-h-11 rounded-full bg-brand-50 px-3 py-1.5 text-[12.5px] font-bold text-brand-700 transition-colors hover:bg-brand-100 active:scale-95"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-neutral-400">
                        Tap any tag to copy it
                      </span>
                      <CopyButton
                        text={pack.hashtags.join(" ")}
                        label="Copy all hashtags"
                        variant="solid"
                        className="h-10 px-3.5 text-[12.5px]"
                      />
                    </div>
                  </ResultSection>

                  {/* 4 · image idea */}
                  <ResultSection
                    step="04"
                    title="Pin Image Idea"
                    meta="Design text + AI prompt"
                    icon={ImageIcon}
                    accent="dark"
                  >
                    <div className="space-y-2.5">
                      <div className="rounded-xl border border-neutral-150 bg-neutral-900 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-400">
                          Headline on the pin
                        </p>
                        <p className="mt-1.5 text-[16px] font-extrabold leading-snug text-white">
                          {pack.imageIdea.headline}
                        </p>
                        <div className="mt-3 h-[3px] w-12 rounded-full bg-brand-600" />
                        <p className="mt-3 text-[10.5px] font-semibold text-neutral-400">
                          {pack.imageIdea.palette}
                        </p>
                      </div>

                      <ul className="space-y-1.5 rounded-xl border border-neutral-150 bg-neutral-50/60 p-3.5">
                        {[
                          ["Layout", pack.imageIdea.layout],
                          ["Style", pack.imageIdea.style],
                        ].map(([k, v]) => (
                          <li key={k} className="text-[12.5px] leading-relaxed text-neutral-600">
                            <span className="font-bold text-neutral-800">{k}: </span>
                            {v}
                          </li>
                        ))}
                      </ul>

                      <div className="rounded-xl border border-neutral-150 bg-neutral-50/60 p-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10.5px] font-bold uppercase tracking-wide text-neutral-400">
                            AI image prompt
                          </p>
                          <CopyButton text={pack.imageIdea.prompt} label="Copy prompt" />
                        </div>
                        <p className="mt-2 text-[12.5px] leading-relaxed text-neutral-600">
                          {pack.imageIdea.prompt}
                        </p>
                      </div>
                      <ImageGenerator initialPrompt={pack.imageIdea.prompt.slice(0, 1700)} useCase="pin" />
                    </div>
                  </ResultSection>

                  {/* 5 · next action */}
                  <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-neutral-900 text-white">
                        <ArrowRight size={17} />
                      </span>
                      <div>
                        <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-neutral-400">
                          Step 05
                        </p>
                        <p className="text-[15px] font-extrabold tracking-tight text-neutral-900">
                          Next action
                        </p>
                      </div>
                    </div>

                    <div className="mt-3.5 flex flex-col gap-2.5 sm:flex-row">
                      <Link
                        href={articleHref} onClick={() => handoffPin(user?.id, pack)}
                        prefetch={false}
                        className="btn-primary w-full whitespace-normal px-4 text-[14px] sm:flex-1"
                      >
                        <FileText size={17} /> Generate Article For This Pin
                      </Link>
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saved || saving || authLoading}
                        className={`w-full whitespace-normal px-4 text-[14px] sm:flex-1 ${
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

                    <p className="mt-2.5 text-center text-[11px] text-neutral-400 sm:text-left">
                      The article writer opens with this title already filled in.
                    </p>
                  </section>
                </div>
              </div>
            )}

            {/* empty state */}
            {!pack && !loading && (
              <div className="mt-5 rounded-2xl border-2 border-dashed border-neutral-200 p-8 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-neutral-100 text-neutral-400">
                  <Wand2 size={22} />
                </div>
                <p className="mt-3 text-[14px] font-bold text-neutral-700">
                  Nothing generated yet
                </p>
                <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-neutral-400">
                  Type a topic above and tap <b>Generate Pin</b>. You&apos;ll get
                  5 titles, an SEO description, 10 hashtags and a pin image idea.
                </p>
              </div>
            )}
          </div>

          {/* ---------------------------- sidebar ---------------------------- */}
          <aside className="space-y-4 lg:sticky lg:top-20">
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h2 className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-neutral-500">
                What you get
              </h2>
              <ul className="mt-3 space-y-2.5">
                {[
                  ["5", "Pin title ideas", "Five angles to review and personalize"],
                  ["1", "SEO description", "100–150 words with keywords"],
                  ["10", "Hashtags", "Copy all in one tap"],
                  ["1", "Pin image idea", "Design text + AI prompt"],
                ].map(([n, t, s]) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-brand-50 text-[11px] font-extrabold text-brand-700">
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
                Next step
              </p>
              <p className="mt-1.5 text-[14.5px] font-extrabold leading-snug text-white">
                Turn this pin into a 500–800 word SEO article
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-neutral-400">
                Give your Pin a relevant, useful article to link to. Review and
                personalize your draft before publishing.
              </p>
              <Link
                href={articleHref} onClick={() => handoffPin(user?.id, pack)}
                prefetch={false}
                className="mt-3.5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-[13px] font-bold text-neutral-900 transition-colors hover:bg-neutral-100"
              >
                Open Article Writer <ArrowRight size={15} />
              </Link>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-[11.5px] leading-relaxed text-neutral-500">
                <b className="text-neutral-700">Tip:</b> pins with a clear
                emotional hook and 3–4 keywords in the description get the most
                saves. All titles above are built that way.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
