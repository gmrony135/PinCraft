"use client";

import Link from "next/link";
import { ArrowRight, Sparkles, Play } from "lucide-react";

function DemoCard() {
  return (
    <div className="relative">
      {/* soft brand glow */}
      <div className="absolute -inset-6 -z-10 rounded-[36px] bg-gradient-to-tr from-brand-600/15 via-brand-100/40 to-transparent blur-2xl" />

      <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-2xl shadow-neutral-900/10">
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50/80 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ml-2 truncate text-[11.5px] font-semibold text-neutral-400">
            pincraftly · demo preview
          </span>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            DEMO
          </span>
        </div>

        <div className="space-y-3.5 p-4 sm:p-5">
          {/* topic input */}
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-neutral-400">
              Your topic
            </p>
            <div className="flex items-center gap-2 rounded-xl border-2 border-brand-100 bg-brand-50/50 px-3 py-2.5">
              <Sparkles size={15} className="shrink-0 text-brand-600" />
              <span className="truncate text-[13.5px] font-semibold text-neutral-800">
                Sad Quotes for Broken Heart
              </span>
              <Link href="/pin-generator" prefetch={false} aria-label="Try the pin generator preview" className="ml-auto hidden min-h-11 shrink-0 items-center rounded-lg bg-brand-600 px-2.5 py-1 text-[10.5px] font-bold text-white hover:bg-brand-700 sm:inline-flex">
                Generate
              </Link>
            </div>
          </div>

          {/* outputs */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: "✍️", label: "5 Viral Titles", tone: "text-neutral-800" },
              { icon: "📝", label: "1 SEO Description", tone: "text-neutral-800" },
              { icon: "#️⃣", label: "10 Hashtags", tone: "text-neutral-800" },
              { icon: "🎨", label: "Pin Image Idea", tone: "text-neutral-800" },
            ].map((o) => (
              <div
                key={o.label}
                className="flex items-center gap-2 rounded-xl border border-neutral-150 bg-neutral-50/70 p-2.5"
              >
                <span className="text-[13px]">{o.icon}</span>
                <span className={`text-[11.5px] font-bold ${o.tone}`}>{o.label}</span>
              </div>
            ))}
          </div>

          {/* article bar */}
          <div className="rounded-xl bg-neutral-900 p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11.5px] font-bold text-white">SEO Article</p>
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold text-white">
                500–800 words
              </span>
            </div>
            <div className="mt-2 space-y-1.5">
              <div className="h-1.5 w-full rounded-full bg-white/20" />
              <div className="h-1.5 w-11/12 rounded-full bg-white/15" />
              <div className="h-1.5 w-2/3 rounded-full bg-white/10" />
            </div>
          </div>

          {/* live stats */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-neutral-150 bg-neutral-50/70 px-3 py-2">
              <p className="text-[9.5px] font-bold uppercase tracking-wide text-neutral-400">
                Sample traffic
              </p>
              <p className="text-[14px] font-extrabold text-neutral-900">
                12.4k <span className="text-[10.5px] font-bold text-emerald-600">↑ 8%</span>
              </p>
            </div>
            <div className="rounded-xl border border-brand-100 bg-brand-50/60 px-3 py-2">
              <p className="text-[9.5px] font-bold uppercase tracking-wide text-brand-400">
                Sample income
              </p>
              <p className="text-[14px] font-extrabold text-brand-600">$8.92</p>
            </div>
          </div>

          {/* status row */}
          <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[11.5px] font-bold text-emerald-700">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-[9px] text-white">
                ✓
              </span>
              Publishing workflow preview
            </p>
            <p className="text-[11px] font-bold text-emerald-600">10/day plan</p>
          </div>
        </div>
      </div>

    </div>
  );
}

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* background wash */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-brand-50 blur-3xl" />
        <div className="absolute -right-32 top-24 h-[380px] w-[380px] rounded-full bg-amber-50 blur-3xl" />
      </div>

      <div className="container-x grid items-center gap-12 py-12 lg:grid-cols-2 lg:gap-10 lg:py-20">
        {/* copy */}
        <div className="animate-fade-up">
          <span className="eyebrow">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-600" />
            Pinterest Automation · Made for Beginners
          </span>

          <h1 className="h1 mt-5 text-neutral-900">
            PinCraft — Your{" "}
            <span className="relative inline-block text-brand-600">
              Pinterest
              <svg
                className="absolute -bottom-1.5 left-0 h-2.5 w-full text-brand-200"
                viewBox="0 0 200 10"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M2 7 C 50 2, 150 2, 198 6"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </span>{" "}
            Automation Machine
          </h1>

          <p className="lead mt-5 max-w-xl">
            Give a topic. Create pin ideas and SEO article drafts in seconds,
            then organize your publishing plan in one simple workspace.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/pin-generator" prefetch={false} className="btn-primary w-full sm:w-auto">
              Generate Viral Pin <ArrowRight size={18} />
            </Link>
            <a href="#how-it-works" className="btn-outline w-full sm:w-auto">
              <Play size={16} /> How It Works
            </a>
          </div>

          {/* trust row */}
          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] font-semibold text-neutral-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-100 text-[9px] text-emerald-600">
                ✓
              </span>
              Free to start
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-100 text-[9px] text-emerald-600">
                ✓
              </span>
              No writing skill needed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-100 text-[9px] text-emerald-600">
                ✓
              </span>
              No signup to create
            </span>
          </div>
          <p className="mt-4 max-w-md text-[11px] leading-relaxed text-neutral-500"><strong className="font-bold text-brand-700">UI preview:</strong> Google Login and live posting need setup. Analytics show sample data; income is not guaranteed.</p>
        </div>

        {/* visual */}
        <div className="animate-fade-up lg:pl-4" style={{ animationDelay: "120ms" }}>
          <DemoCard />
        </div>
      </div>
    </section>
  );
}
