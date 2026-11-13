"use client";

import { useEffect, useState } from "react";
import { Check, CircleAlert, Copy } from "lucide-react";
import { copyLibraryText } from "@/lib/library-content";

export default function ContentCopyButton({ text, label = "Copy", ariaLabel, compact = false }) {
  const [state, setState] = useState("idle");
  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2200);
    return () => clearTimeout(timer);
  }, [state]);

  async function handleCopy() {
    const copied = await copyLibraryText(String(text || ""));
    setState(copied ? "copied" : "error");
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={state === "copied" ? "Copied to clipboard" : state === "error" ? "Copy failed. Try again" : ariaLabel || `${label} to clipboard`}
      aria-live="polite"
      className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[12px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${state === "copied" ? "bg-emerald-50 text-emerald-700" : state === "error" ? "bg-brand-50 text-brand-800" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"} ${compact ? "sm:px-3.5" : "px-4"}`}
    >
      {state === "copied" ? <Check aria-hidden="true" size={14} strokeWidth={2.5} /> : state === "error" ? <CircleAlert aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
      {state === "copied" ? "Copied" : state === "error" ? "Copy failed — retry" : label}
    </button>
  );
}
