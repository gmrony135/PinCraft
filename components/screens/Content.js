"use client";

import { useState } from "react";
import { BackHeader, Spinner, CopyButton, SectionTitle } from "../ui";
import { CATEGORIES, generateContent, resolveCategory } from "@/lib/store";
import {
  Wand2,
  Check,
  ChevronDown,
  Image as ImageIcon,
  Hash,
  FileText,
  Sparkles,
  PenLine,
} from "lucide-react";

const EXAMPLES = [
  "Sad Quotes for Broken Heart",
  "Morning Motivation for Students",
  "Easy 15-Minute Dinner Recipes",
  "Budget Travel in Asia",
];

export default function Content({ go, state, actions, toast }) {
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [open, setOpen] = useState("titles");
  const [posted, setPosted] = useState({ pins: false, blog: false });

  const category = resolveCategory(state.selectedCategory) || "motivation";

  async function generate() {
    if (!topic.trim()) {
      toast("Write your topic first", "error");
      return;
    }
    setLoading(true);
    setResult(null);
    setPosted({ pins: false, blog: false });
    // Simulated AI latency for realistic feel
    await new Promise((r) => setTimeout(r, 1100));
    const data = generateContent(topic, category);
    actions.addPin(data);
    setResult(data);
    setLoading(false);
    setOpen("titles");
    setTimeout(() => {
      document.getElementById("results")?.scrollIntoView({ behavior: "smooth" });
    }, 80);
  }

  const tabs = result
    ? [
        { key: "titles", label: "Pin Titles", count: 5, icon: Sparkles },
        { key: "desc", label: "Descriptions", count: 5, icon: Hash },
        { key: "prompts", label: "Image Prompts", count: 5, icon: ImageIcon },
        { key: "blog", label: "Blog Post", count: 1, icon: FileText },
      ]
    : [];

  const catMeta = CATEGORIES.find((c) => c.id === category);

  return (
    <div className="app-shell pb-10">
      <BackHeader
        title="Create content"
        subtitle={`Category: ${catMeta?.name || "Not set"}`}
        onBack={() => go("dashboard")}
        right={
          <button
            onClick={() => go("dashboard")}
            className="chip bg-neutral-100 text-neutral-600"
          >
            {catMeta?.emoji}
          </button>
        }
      />

      {/* Topic form */}
      <div className="card p-4">
        <label className="label">Write your topic</label>
        <textarea
          className="field resize-none"
          rows={3}
          placeholder='e.g. "Sad Quotes for Broken Heart"'
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />

        <div className="no-scrollbar -mx-1 mt-2.5 flex gap-2 overflow-x-auto px-1 pb-1">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setTopic(ex)}
              className="chip shrink-0 bg-neutral-100 text-neutral-600 active:bg-neutral-200"
            >
              {ex}
            </button>
          ))}
        </div>

        <button
          onClick={generate}
          disabled={loading}
          className="btn-primary mt-3.5 w-full"
        >
          {loading ? (
            <>
              <Spinner /> Crafting your content…
            </>
          ) : (
            <>
              <Wand2 size={18} /> Generate with AI
            </>
          )}
        </button>
        <p className="mt-2 text-center text-[11px] text-neutral-400">
          Creates 5 pins + 1 blog post · usually 2 seconds
        </p>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="mt-4 space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="card flex items-center gap-3 p-4"
              style={{ opacity: 1 - i * 0.25 }}
            >
              <div className="h-9 w-9 animate-pulse rounded-xl bg-neutral-100" />
              <div className="flex-1 space-y-2">
                <div className="h-2.5 w-2/3 animate-pulse rounded-full bg-neutral-100" />
                <div className="h-2.5 w-1/3 animate-pulse rounded-full bg-neutral-100" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {result && (
        <div id="results" className="animate-fade-up mt-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[17px] font-bold tracking-tight">Your content pack</h2>
            <span className="chip bg-emerald-50 text-emerald-600">
              <Check size={12} /> Saved
            </span>
          </div>

          <div className="space-y-2.5">
            {tabs.map((t) => {
              const Icon = t.icon;
              const isOpen = open === t.key;
              return (
                <div key={t.key} className="card overflow-hidden">
                  <button
                    onClick={() => setOpen(isOpen ? null : t.key)}
                    className="flex w-full items-center gap-3 p-4 text-left"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-pin-50 text-pin-600">
                      <Icon size={17} />
                    </span>
                    <div className="flex-1">
                      <p className="text-[14px] font-bold text-neutral-900">
                        {t.label}
                      </p>
                      <p className="text-[11px] text-neutral-400">
                        {t.count} {t.count > 1 ? "items" : "item"}
                        {t.key === "blog" ? ` · ${result.blog.wordCount} words` : ""}
                      </p>
                    </div>
                    <ChevronDown
                      size={18}
                      className={`text-neutral-400 transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div className="animate-fade-up space-y-2 border-t border-neutral-100 p-3.5 pt-3">
                      {t.key === "titles" &&
                        result.titles.map((x, i) => (
                          <Row key={i} index={i} text={x} />
                        ))}
                      {t.key === "desc" &&
                        result.descriptions.map((x, i) => (
                          <Row key={i} index={i} text={x} multiline />
                        ))}
                      {t.key === "prompts" &&
                        result.prompts.map((x, i) => (
                          <Row key={i} index={i} text={x} multiline />
                        ))}
                      {t.key === "blog" && (
                        <div className="rounded-2xl bg-neutral-50 p-3.5">
                          <p className="text-[13.5px] font-bold text-neutral-900">
                            {result.blog.title}
                          </p>
                          <p className="mt-1 text-[11px] font-medium text-neutral-500">
                            SEO: {result.blog.keywords.join(" · ")}
                          </p>
                          <div className="mt-3 max-h-[320px] overflow-y-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-neutral-700">
                            {result.blog.body}
                          </div>
                          <div className="mt-3 flex gap-2">
                            <CopyButton text={result.blog.body} label="Copy blog" />
                            <CopyButton
                              text={`${result.blog.title}\n\nSEO Keywords: ${result.blog.keywords.join(", ")}\n\n${result.blog.body}`}
                              label="Copy with SEO"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Post actions */}
          <div className="mt-4 grid grid-cols-1 gap-2.5">
            <button
              onClick={() => {
                actions.postPinterest(result.id);
                setPosted((p) => ({ ...p, pins: true }));
                toast("5 pins queued to Pinterest 📌");
              }}
              disabled={posted.pins}
              className={posted.pins ? "btn-ghost w-full" : "btn-primary w-full"}
            >
              {posted.pins ? (
                <>
                  <Check size={18} /> Posted to Pinterest
                </>
              ) : (
                <>Post to Pinterest</>
              )}
            </button>
            <button
              onClick={() => {
                actions.postBlog(result.id);
                setPosted((p) => ({ ...p, blog: true }));
                toast("Blog post published ✅");
              }}
              disabled={posted.blog}
              className={posted.blog ? "btn-ghost w-full" : "btn-dark w-full"}
            >
              {posted.blog ? (
                <>
                  <Check size={18} /> Blog published
                </>
              ) : (
                <>
                  <PenLine size={17} /> Post to Blog
                </>
              )}
            </button>
          </div>

          <button
            onClick={() => {
              setResult(null);
              setTopic("");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="btn-outline mt-2.5 w-full"
          >
            Create another
          </button>
        </div>
      )}

      {!result && !loading && (
        <div className="mt-6 rounded-3xl border-2 border-dashed border-neutral-200 p-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-neutral-100 text-neutral-400">
            <Wand2 size={22} />
          </div>
          <p className="mt-3 text-[13.5px] font-semibold text-neutral-700">
            Nothing generated yet
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-neutral-400">
            Type a topic above and tap Generate — you&apos;ll get pin titles,
            descriptions, image prompts and a full blog post.
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ index, text, multiline }) {
  return (
    <div className="rounded-2xl bg-neutral-50 p-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-pin-600 text-[10px] font-bold text-white">
          {index + 1}
        </span>
        <p
          className={`flex-1 text-[12.5px] leading-relaxed text-neutral-700 ${
            multiline ? "" : "font-semibold text-neutral-900"
          }`}
        >
          {text}
        </p>
      </div>
      <div className="mt-2 flex justify-end">
        <CopyButton text={text} />
      </div>
    </div>
  );
}
