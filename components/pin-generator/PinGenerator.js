"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { generatePinPack } from "@/lib/generator";
import { saveToLibrary } from "@/lib/library";
import { saveCloudDraft } from "@/lib/cloud-library";
import { useAuth } from "../providers/AppProvider";
import { generateWithAI } from "@/lib/ai-client";
import ImageGenerator from "../ai/ImageGenerator";
import { CATEGORIES } from "@/lib/product.mjs";
import { handoffPin } from "@/lib/publishing/review-content.mjs";
import {
  Sparkles,
  Wand2,
  ArrowRight,
  AlertCircle,
  Search,
  Loader2,
} from "lucide-react";

function createPinArtworkPrompt(topic, visualDirection = '') {
  const cleanTopic = String(topic || '').trim();
  if (!cleanTopic) return '';
  const direction = visualDirection ? `Visual direction: ${visualDirection} ` : '';
  return `Create original, polished vertical Pinterest Pin artwork inspired by "${cleanTopic}". ${direction}Use a clear focal point, a balanced editorial composition and a cohesive color palette. Leave clean space for an optional headline. Do not include text, letters, logos or watermarks.`;
}

export default function PinGenerator() {
  const { user, authLoading, openLogin } = useAuth();
  // Pin Generator keeps the workflow simple: signed-in users get live AI;
  // guests get the clearly labelled offline template without a mode selector.
  const mode = authLoading ? null : user ? 'ai' : 'local';
  const generationRequest = useRef({ sequence: 0, controller: null });
  const [language, setLanguage] = useState('en');
  const identity = useRef(null);
  identity.current = user?.id || "device";
  const [topic, setTopic] = useState("");
  const [artworkPrompt, setArtworkPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [pack, setPack] = useState(null);
  const [historySave, setHistorySave] = useState({ status: 'idle', content: null, requestKey: null, cloud: false, message: '' });
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => { const value = new URLSearchParams(window.location.search).get('topic'); if (value) { const clean = value.slice(0, 160); setTopic(clean); setArtworkPrompt(createPinArtworkPrompt(clean)); } }, []);
  useEffect(() => {
    generationRequest.current.sequence++; generationRequest.current.controller?.abort();
    setLoading(false); setError(''); setPack(null); setHistorySave({ status: 'idle', content: null, requestKey: null, cloud: false, message: '' });
    return () => { generationRequest.current.sequence++; generationRequest.current.controller?.abort(); };
  }, [user?.id]);

  function flash(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }

  async function persistPinHistory(content, requestKey, cloud, owner, sequence, alreadySaved = false) {
    setHistorySave({ status: alreadySaved ? 'saved' : 'saving', content, requestKey, cloud, message: '' });
    if (alreadySaved) return;
    try {
      if (cloud) await saveCloudDraft('pin', content, requestKey);
      else saveToLibrary({ type: 'pin', ...content });
      if (generationRequest.current.sequence === sequence && identity.current === owner) setHistorySave({ status: 'saved', content, requestKey, cloud, message: '' });
    } catch (issue) {
      if (generationRequest.current.sequence === sequence && identity.current === owner) setHistorySave({ status: 'error', content, requestKey, cloud, message: issue.message || 'The Pin result is available, but its Library save could not be confirmed.' });
    }
  }

  async function retryPinHistory() {
    if (!historySave.content || !historySave.requestKey) return;
    await persistPinHistory(historySave.content, historySave.requestKey, historySave.cloud, identity.current, generationRequest.current.sequence, false);
  }

  async function handleGenerate(e) {
    e?.preventDefault?.();
    const value = topic.trim();
    if (!value) {
      setError("Please type a topic first — e.g. “Home Decor Ideas”.");
      return;
    }
    if (value.length < 3) {
      setError("Topic is too short. Try at least 3 characters.");
      return;
    }
    if (loading || authLoading) return;
    if (mode === 'ai' && !user) { setError('Sign in with a verified account to use live Pin generation.'); openLogin(); return; }
    const owner = identity.current, sequence = ++generationRequest.current.sequence;
    generationRequest.current.controller = new AbortController();
    setError(''); setPack(null); setHistorySave({ status: 'idle', content: null, requestKey: null, cloud: false, message: '' }); setLoading(true);
    try {
      let generated, requestKey, alreadySaved = false;
      if (mode === 'ai') {
        const result = await generateWithAI('pin', { topic: value, language }, { signal: generationRequest.current.controller.signal });
        generated = { ...result.result, generation: result.generation };
        requestKey = result.requestKey; alreadySaved = result.library?.saved === true;
      } else {
        await new Promise(resolve => requestAnimationFrame(resolve));
        generated = generatePinPack(value); requestKey = crypto.randomUUID();
      }
      if (sequence !== generationRequest.current.sequence || identity.current !== owner) return;
      setPack(generated);
      setArtworkPrompt(generated.imageIdea?.prompt || createPinArtworkPrompt(generated.topic || value));
      flash(mode === 'ai' ? 'AI Pin pack generated' : 'Offline pin template generated');
      await persistPinHistory(generated, requestKey, mode === 'ai', owner, sequence, alreadySaved);
    } catch (issue) { if (issue.name !== 'AbortError' && sequence === generationRequest.current.sequence && identity.current === owner) setError(issue.message); }
    finally { if (sequence === generationRequest.current.sequence) setLoading(false); }
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
            <Sparkles size={13} /> Pin copy + downloadable artwork
          </span>

          <h1 className="h1 mt-4 text-neutral-900">Pin Generator</h1>
          <p className="lead mt-3 max-w-2xl">
            Explore ten categories, create Pin copy, or use the custom Pin artwork option to generate downloadable art—no Pin text is required to make an image.
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
                  placeholder="e.g. Balcony garden ideas"
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

              {/* Suggestions stay in sync with the product's canonical categories. */}
              <div className="mt-4">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-[11.5px] font-bold uppercase tracking-wide text-neutral-500">
                    Top 10 categories
                  </p>
                  <p className="text-[11px] font-medium text-neutral-400">
                    Select one to fill your topic and suggest Pin artwork
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      data-testid="pin-category-suggestion"
                      onClick={() => {
                        setTopic(category.label);
                        setArtworkPrompt(createPinArtworkPrompt(category.label, category.description));
                        setError("");
                      }}
                      className="min-h-11 max-w-full whitespace-normal rounded-full border border-neutral-200 bg-neutral-50 px-3.5 py-2 text-left text-[11.5px] font-semibold leading-snug text-neutral-600 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 active:scale-[0.98]"
                    >
                      {category.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  type="submit"
                  disabled={loading || authLoading}
                  className="btn-primary min-w-[150px] px-5 text-[13px]"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Generating ideas…
                    </>
                  ) : (
                    <>
                      <Wand2 size={16} aria-hidden="true" /> Pin ideas
                    </>
                  )}
                </button>
              </div>
              <p className="mt-2.5 text-right text-[11.5px] text-neutral-400">
                Suggest a matching Pin artwork prompt from your topic.
              </p>
            </form>
            {pack && <section aria-label="Generated Pin ideas" data-testid="pin-ideas-result" className="mt-5 space-y-4 rounded-2xl border border-neutral-200 bg-white p-5">
              <h2 className="text-lg font-extrabold">Your Pin ideas</h2>
              <ol className="list-inside list-decimal space-y-2">{pack.titles.map((title,index)=><li key={index} className="text-sm font-bold">{title}</li>)}</ol>
              <h3 className="text-sm font-bold">Description</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">{pack.description}</p>
              <p className="text-xs text-neutral-500">{pack.description.trim().split(/\s+/u).length} words · {pack.description.length} characters. Check Pinterest’s field limit before posting.</p>
              <p className="break-words text-sm text-brand-700">{pack.hashtags.join(' ')}</p>
            </section>}
            {pack && historySave.status === 'saved' && <p role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] leading-relaxed text-emerald-800">Pin ideas automatically saved to {historySave.cloud ? 'your private Cloud Library' : 'My Library on this device'}. This is a draft only—not a Pinterest upload. <Link href="/library" prefetch={false} className="font-extrabold underline underline-offset-2">Open My Library</Link></p>}
            {pack && historySave.status === 'saving' && <p role="status" className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-[11px] text-neutral-600">Saving Pin ideas to My Library…</p>}
            {pack && historySave.status === 'error' && <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">{historySave.message} Keep this page open and retry. <button type="button" onClick={retryPinHistory} className="ml-1 min-h-9 font-extrabold underline underline-offset-2">Retry Library save</button></p>}

            <section id="pin-artwork-generator" data-testid="pin-artwork-section" className="mt-5 scroll-mt-20">
              <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                <div>
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-brand-700">Artwork · Pinterest Pin</p>
                  <h2 className="mt-1 text-[18px] font-extrabold tracking-tight text-neutral-900">Generate Pin artwork</h2>
                  <p className="mt-1 max-w-xl text-[11.5px] leading-relaxed text-neutral-500">Create a 1000 × 1500 image here—Pin copy is optional. Choose one of the Top 10 categories above for a matching prompt, or describe your own scene.</p>
                </div>
                <span className="inline-flex min-h-8 shrink-0 items-center rounded-full bg-neutral-100 px-3 text-[10px] font-bold text-neutral-600">1000 × 1500 · WebP</span>
              </div>
              {topic.trim() && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5">
                <p className="min-w-0 break-words text-[11px] text-neutral-500">Current topic: <strong className="text-neutral-700">{topic}</strong></p>
                <button type="button" onClick={() => setArtworkPrompt(createPinArtworkPrompt(topic))} className="min-h-11 shrink-0 rounded-lg px-2 text-[11px] font-bold text-brand-700 hover:bg-brand-50">Use topic for artwork prompt</button>
              </div>}
              {!authLoading && !user && <div className="mb-3 flex flex-col gap-2 rounded-xl border border-amber-100 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] leading-relaxed text-amber-900">A verified account is required for AI artwork. After generation, the image is automatically saved in your private Cloud Library. Shared website-wide capacity and provider limits still apply.</p>
                <button type="button" onClick={openLogin} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-white px-3 text-[11px] font-bold text-amber-900 hover:bg-amber-50">Sign in / create account</button>
              </div>}
              <ImageGenerator initialPrompt={artworkPrompt} useCase="pin" editable topic={topic} categoryId={CATEGORIES.find(category => category.label.toLocaleLowerCase() === topic.trim().toLocaleLowerCase())?.id || ''} language={language} />
            </section>

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
                  ["1", "SEO description", "250–480 characters; review before posting"],
                  ["10", "Hashtags", "Copy all in one tap"],
                  ["1", "Pin image idea + artwork", "Prompt, then optional 1000 × 1500 AI download"],
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
                Turn this pin into a 1,000–1,600 word SEO article
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
                saves.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
