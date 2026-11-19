"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import PinterestLogo from "@/components/pinterest/PinterestLogo";

// Optional, skippable showcase shown on the dashboard after a new account signs up.
// The sign-up form sets the flag; dismissing it clears the flag.
export const POST_SIGNUP_KEY = "pincraft.postSignupShowcase";
export function markPostSignupShowcase() {
  try { window.localStorage.setItem(POST_SIGNUP_KEY, "1"); } catch {}
}

const VIDEO_ID = "9GsuZqVCpI0";
const LINKS = [
  { label: "Telegram", title: "Join the PinCraft Telegram channel", href: "https://t.me/pincraft_ai", cta: "Join", tone: "bg-[#229ED9]", note: "Updates and announcements", icon: "tg" },
  { label: "YouTube", title: "Subscribe to PinCraft on YouTube", href: "https://www.youtube.com/@PinCraftOfficial", cta: "Subscribe", tone: "bg-[#FF0000]", note: "@PinCraftOfficial", icon: "yt" },
  { label: "Pinterest", title: "Follow SlimGlow Life on Pinterest", href: "https://www.pinterest.com/SlimGlowLifex/", cta: "Follow", tone: "bg-[#E60023]", note: "@SlimGlowLifex", icon: "pin" },
];

const PATHS = { yt: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z", tg: "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" };

function Glyph({ kind }) {
  if (kind === "pin") return <PinterestLogo size={44} />;
  return <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="#FFFFFF" d={PATHS[kind]} /></svg>;
}

export default function PostSignupShowcase() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(POST_SIGNUP_KEY) === "1") {
        // Consume the flag on first display so the panel is shown only once.
        window.localStorage.setItem(POST_SIGNUP_KEY, "0");
        setShow(true);
      }
    } catch {}
  }, []);
  if (!show) return null;
  function dismiss() {
    try { window.localStorage.setItem(POST_SIGNUP_KEY, "0"); } catch {}
    setShow(false);
  }
  return (
    <section aria-labelledby="post-signup-title" className="container-x pt-8" data-testid="post-signup-showcase">
      <div className="relative rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
        <button type="button" onClick={dismiss} aria-label="Close welcome panel" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800">
          <X size={18} aria-hidden="true" />
        </button>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-brand-700">Welcome to PinCraft</p>
        <h2 id="post-signup-title" className="mt-2 pr-10 text-[22px] font-extrabold leading-tight tracking-[-0.03em] text-neutral-900">Your account is ready. Stay close to the community.</h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-neutral-600">Optional. Follow along, watch the setup guide, or skip this and go straight to your dashboard.</p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <ul className="grid gap-3">
            {LINKS.map(item => (
              <li key={item.label} className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${item.icon === "pin" ? "" : item.tone}`}>
                  <Glyph kind={item.icon} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-extrabold text-neutral-900">{item.label}</p>
                  <p className="truncate text-[12px] text-neutral-500">{item.note}</p>
                </div>
                <a href={item.href} target="_blank" rel="noopener noreferrer" aria-label={item.title} className="inline-flex min-h-10 shrink-0 items-center rounded-xl bg-neutral-900 px-4 text-[12px] font-bold text-white hover:bg-neutral-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-100">
                  {item.cta}
                </a>
              </li>
            ))}
          </ul>

          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-black">
            <div className="aspect-video w-full">
              <iframe
                className="h-full w-full"
                src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}`}
                title="PinCraft tutorial video"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-5">
          <p className="text-[12px] text-neutral-500">Skipping is optional. Nothing here is required to use PinCraft.</p>
          <button type="button" onClick={dismiss} className="inline-flex min-h-10 items-center rounded-xl border border-neutral-300 bg-white px-4 text-[12px] font-bold text-neutral-800 hover:bg-neutral-50">Skip, go to dashboard</button>
        </div>
      </div>
    </section>
  );
}
