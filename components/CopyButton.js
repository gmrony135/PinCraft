"use client";

import { useEffect, useState } from "react";
import { Copy, Check, CircleAlert } from "lucide-react";
import { copyText } from "@/lib/clipboard";

/** Copy feedback follows the real clipboard result, including denied access. */
export default function CopyButton({ text, label = "Copy", copiedLabel = "Copied", className = "", variant = "soft" }) {
  const [state, setState] = useState("idle");
  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2200);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() { setState((await copyText(text)) ? "copied" : "error"); }
  const base = "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 active:scale-95 select-none";
  const styles = state === "error" ? "bg-brand-50 text-brand-800 ring-1 ring-brand-100" : state === "copied" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : variant === "solid" ? "bg-neutral-900 text-white hover:bg-neutral-800" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200";
  const textLabel = state === "copied" ? copiedLabel : state === "error" ? "Copy failed — retry" : label;
  return (
    <button type="button" onClick={copy} aria-label={state === "error" ? `${label} failed. Try again` : `${textLabel} to clipboard`} aria-live="polite" className={`${base} ${styles} ${className || "px-3 text-[12px]"}`}>
      {state === "copied" ? <Check aria-hidden="true" size={14} strokeWidth={3} /> : state === "error" ? <CircleAlert aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}{textLabel}
    </button>
  );
}
