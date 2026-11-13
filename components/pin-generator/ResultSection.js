"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function ResultSection({
  step,
  title,
  meta,
  icon: Icon,
  defaultOpen = false,
  children,
  accent = "brand",
}) {
  const [open, setOpen] = useState(defaultOpen);

  const iconWrap =
    accent === "dark"
      ? "bg-neutral-900 text-white"
      : accent === "neutral"
      ? "bg-neutral-100 text-neutral-900"
      : "bg-brand-600 text-white";

  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-neutral-50/70"
      >
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${iconWrap}`}>
          <Icon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-neutral-400">
              Step {step}
            </span>
          </span>
          <span className="block text-[15px] font-extrabold tracking-tight text-neutral-900">
            {title}
          </span>
          {meta && (
            <span className="mt-0.5 block text-[11.5px] font-semibold text-neutral-400">
              {meta}
            </span>
          )}
        </span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-neutral-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="animate-fade-in border-t border-neutral-100 p-3.5 sm:p-4">
          {children}
        </div>
      )}
    </section>
  );
}
