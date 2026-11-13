"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";

/**
 * Copy-to-clipboard button with fallbacks (clipboard API → execCommand).
 * Shows a green "Copied" state for 1.6s.
 */
export default function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  className = "",
  variant = "soft",
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = useCallback(async () => {
    const value = String(text ?? "");
    let ok = false;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        ok = true;
      }
    } catch {
      ok = false;
    }

    if (!ok) {
      // fallback for non-secure contexts / older browsers
      try {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-1000px";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, value.length);
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }

    setCopied(true);
  }, [text]);

  const base =
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-bold transition-all duration-150 active:scale-95 select-none";
  const styles =
    variant === "solid"
      ? "bg-neutral-900 text-white hover:bg-neutral-800"
      : copied
      ? "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200"
      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200";

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `${copiedLabel} to clipboard` : `${label} to clipboard`}
      aria-live="polite"
      className={`${base} ${styles} ${className || "h-9 px-3 text-[12px]"}`}
    >
      {copied ? (
        <>
          <Check size={14} strokeWidth={3} /> {copiedLabel}
        </>
      ) : (
        <>
          <Copy size={14} /> {label}
        </>
      )}
    </button>
  );
}
