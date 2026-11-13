import Link from "next/link";
import { ArrowRight, Pin, FileText, Send, MousePointerClick, Wallet } from "lucide-react";

const FORMULA = [
  { icon: Pin, label: "Pin Create", sub: "Viral pins" },
  { icon: FileText, label: "Article Write", sub: "SEO blog" },
  { icon: Send, label: "Auto Post", sub: "Integration required" },
];

const PIPELINE = [
  { icon: Pin, title: "Pinterest", text: "Free traffic", tone: "text-brand-600" },
  {
    icon: MousePointerClick,
    title: "Blog",
    text: "Content place",
    tone: "text-neutral-900",
  },
  { icon: Wallet, title: "Adsterra", text: "Income", tone: "text-emerald-600" },
];

export default function IncomeFormula() {
  return (
    <section className="container-x pb-14 sm:pb-20">
      <div className="relative overflow-hidden rounded-3xl bg-neutral-950 px-5 py-12 sm:px-10 sm:py-14">
        {/* glow */}
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-600/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-brand-600/15 blur-3xl" />

        <div className="relative mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-wide text-white/90">
            Income formula
          </span>
          <h2 className="mt-4 text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-white sm:text-[36px]">
            The maths behind PinCraft
          </h2>
          <p className="mt-3 text-[14.5px] leading-relaxed text-neutral-400 sm:text-[16px]">
            The idea: useful content, an audience, and an ad-supported blog.
            Live posting and earnings require your own connected accounts.
          </p>
        </div>

        {/* Formula */}
        <div className="relative mt-9 rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-6">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">
            PinCraft =
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            {FORMULA.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={f.label} className="flex items-center gap-2 sm:gap-3">
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 sm:px-4">
                    <Icon size={16} className="shrink-0 text-brand-600" />
                    <div className="text-left">
                      <p className="text-[12.5px] font-bold leading-tight text-white sm:text-[13.5px]">
                        {f.label}
                      </p>
                      <p className="text-[10.5px] text-neutral-500">{f.sub}</p>
                    </div>
                  </div>
                  {i < FORMULA.length - 1 && (
                    <span className="text-[15px] font-bold text-neutral-600">+</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Pipeline */}
        <div className="relative mt-4 grid gap-3 sm:grid-cols-3">
          {PIPELINE.map((p, i) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-neutral-900">
                  <Icon size={18} className={p.tone} />
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-bold text-white">{p.title}</p>
                  <p className="text-[11.5px] text-neutral-400">= {p.text}</p>
                </div>
                {i < PIPELINE.length - 1 && (
                  <ArrowRight size={15} className="ml-auto hidden shrink-0 text-neutral-600 sm:block" />
                )}
              </div>
            );
          })}
        </div>

        <div className="relative mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link href="/pin-generator" prefetch={false} className="btn-primary w-full sm:w-auto">
            Start creating free <ArrowRight size={18} />
          </Link>
          <Link
            href="/dashboard"
            prefetch={false}
            className="btn w-full border-2 border-white/20 bg-transparent text-white hover:bg-white/10 sm:w-auto"
          >
            View dashboard
          </Link>
        </div>
      </div>
    </section>
  );
}
