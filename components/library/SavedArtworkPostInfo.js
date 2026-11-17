"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import { generateWithAI } from "@/lib/ai-client";
import { saveCloudDraft } from "@/lib/cloud-library";
import { useAuth } from "../providers/AppProvider";
import CopyButton from "../CopyButton";

export default function SavedArtworkPostInfo({ artwork }) {
  const { user, authLoading, openLogin } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [save, setSave] = useState({ status: "idle", content: null, requestKey: null, message: "" });
  const [result, setResult] = useState(null);
  const owner = useRef(null), sequence = useRef(0), controller = useRef(null);
  owner.current = user?.id || null;

  useEffect(() => {
    sequence.current++; controller.current?.abort();
    setOpen(false); setBusy(false); setError(""); setResult(null);
    setSave({ status: "idle", content: null, requestKey: null, message: "" });
    return () => { sequence.current++; controller.current?.abort(); };
  }, [artwork?.imageAssetId, user?.id]);

  async function archive(entry, account, request) {
    setSave({ status: "saving", content: entry.content, requestKey: entry.requestKey, message: "" });
    try {
      await saveCloudDraft("history", entry.content, entry.requestKey);
      if (sequence.current === request && owner.current === account) setSave({ status: "saved", content: entry.content, requestKey: entry.requestKey, message: "" });
    } catch (issue) {
      if (sequence.current === request && owner.current === account) setSave({ status: "error", content: entry.content, requestKey: entry.requestKey, message: issue.message || "Post Info is ready, but its Library save could not be confirmed." });
    }
  }

  async function generate() {
    if (busy || authLoading) return;
    if (!user) { openLogin(); return; }
    const account = user.id, request = ++sequence.current;
    controller.current?.abort(); controller.current = new AbortController();
    setBusy(true); setError(""); setResult(null); setSave({ status: "idle", content: null, requestKey: null, message: "" });
    try {
      const generated = await generateWithAI("pin_info", {
        prompt: artwork.prompt,
        topic: artwork.topic || artwork.title,
        categoryId: artwork.categoryId || "",
        language: artwork.language || "en",
        imageAssetId: artwork.imageAssetId,
      }, { signal: controller.current.signal });
      if (sequence.current !== request || owner.current !== account) return;
      setResult(generated.result);
      const content = {
        historyType: "pin_info",
        title: generated.result.title,
        topic: artwork.topic || generated.result.title,
        category: "Pinterest Post Info",
        language: artwork.language || "en",
        imageAssetId: artwork.imageAssetId,
        useCase: "pin",
        prompt: artwork.prompt,
        description: generated.result.description,
        hashtags: generated.result.hashtags,
        generation: generated.generation,
      };
      const entry = { content, requestKey: generated.requestKey };
      if (generated.library?.saved === true) {
        setSave({ status: "saved", ...entry, message: "" });
        window.dispatchEvent(new Event("pincraft:cloud-library-updated"));
      } else await archive(entry, account, request);
    } catch (issue) {
      if (issue.name !== "AbortError" && sequence.current === request && owner.current === account) setError(issue.message || "Post Info could not be generated.");
    } finally {
      if (sequence.current === request) setBusy(false);
    }
  }

  async function retry() {
    if (!user || !save.content || !save.requestKey) return;
    await archive({ content: save.content, requestKey: save.requestKey }, user.id, sequence.current);
  }

  const copyText = result ? [`Title: ${result.title}`, `Description: ${result.description}`, `Hashtags: ${result.hashtags.join(" ")}`].join("\n\n") : "";
  return <div className="mt-3 border-t border-neutral-100 pt-3" data-testid="saved-artwork-post-info">
    <button type="button" aria-expanded={open} aria-controls={`saved-post-info-${artwork.imageAssetId}`} onClick={() => setOpen(value => !value)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3.5 text-[11px] font-extrabold text-brand-800 hover:bg-brand-100"><Sparkles size={14} aria-hidden="true" />{open ? "Hide Post Info tool" : "Generate Pinterest Post Info"}</button>
    {open && <section id={`saved-post-info-${artwork.imageAssetId}`} className="mt-3 space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3" aria-label="Generate Post Info from saved artwork" aria-busy={busy}>
      <p className="text-[10.5px] leading-relaxed text-neutral-600">This sends your saved Pin artwork and its visual prompt to AI to create one title, description and four or five hashtags. The result is saved privately in My Library; nothing is posted.</p>
      {!result && <button type="button" onClick={generate} disabled={busy || authLoading} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-neutral-900 px-3 text-[11px] font-bold text-white disabled:opacity-50">{busy ? <><LoaderCircle size={14} className="animate-spin" aria-hidden="true" />Analyzing saved artwork…</> : user ? "Generate Post Info" : "Sign in to generate Post Info"}</button>}
      {error && <p role="alert" className="rounded-lg bg-brand-50 p-3 text-[10.5px] leading-relaxed text-brand-800">{error}</p>}
      {save.status === "saved" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[10px] text-emerald-800">Post Info is saved privately in My Library. Nothing was published.</p>}
      {save.status === "saving" && <p role="status" className="rounded-lg border border-neutral-200 bg-white p-3 text-[10px] text-neutral-600">Saving Post Info to My Library…</p>}
      {save.status === "error" && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10px] leading-relaxed text-amber-900">{save.message} <button type="button" onClick={retry} className="ml-1 min-h-9 font-extrabold underline underline-offset-2">Retry Library save</button></p>}
      {result && <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-3"><p className="text-[11px] font-extrabold">{result.title}</p><p className="text-[10.5px] leading-relaxed text-neutral-600">{result.description}</p><p className="break-words text-[10px] leading-relaxed text-brand-700">{result.hashtags.join(" ")}</p><CopyButton text={copyText} label="Copy all Post Info" className="min-h-10 px-3 text-[10px]" /><button type="button" onClick={generate} disabled={busy || authLoading} className="inline-flex min-h-10 items-center justify-center px-2 text-[10px] font-bold text-neutral-600 underline underline-offset-2 disabled:opacity-50">Generate another variation</button></div>}
    </section>}
  </div>;
}
