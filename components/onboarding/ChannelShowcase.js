"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { useAuth } from "@/components/providers/AppProvider";

export const TELEGRAM_URL = "https://t.me/pincraft_ai";
export const YOUTUBE_URL = "https://www.youtube.com/@PinCraftOfficial";

const PATHS = { yt: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z", tg: "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" };

const MESSAGES = {
  telegram_joined: ["ok", "Telegram membership confirmed."],
  youtube_subscribed: ["ok", "YouTube subscription confirmed."],
  telegram_not_member: ["err", "We could not find your Telegram account in the channel. Join the channel, then connect again."],
  telegram_auth_failed: ["err", "Telegram sign-in could not be verified. Please try again."],
  telegram_auth_expired: ["err", "The Telegram sign-in expired. Please connect again."],
  telegram_unavailable: ["err", "Telegram could not be checked right now. Please try again shortly."],
  telegram_not_configured: ["err", "Telegram verification is not set up yet."],
  youtube_not_subscribed: ["err", "No subscription to @PinCraftOfficial was found on that Google account. Subscribe, then verify again."],
  youtube_denied: ["err", "YouTube permission was not granted, so the subscription could not be checked."],
  youtube_state_invalid: ["err", "That verification link expired. Please start the YouTube check again."],
  youtube_unavailable: ["err", "YouTube could not be checked right now. Please try again shortly."],
  youtube_not_configured: ["err", "YouTube verification is not set up yet."],
};

function Glyph({ kind }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="#FFFFFF" d={PATHS[kind]} /></svg>;
}

// Telegram Login Widget in redirect mode: Telegram signs the login and sends the browser to our verification endpoint.
function TelegramLogin({ botUsername }) {
  const holder = useRef(null);
  useEffect(() => {
    const node = holder.current;
    if (!node || !botUsername) return;
    node.innerHTML = "";
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "10");
    script.setAttribute("data-auth-url", `${window.location.origin}/api/showcase/telegram/callback`);
    node.appendChild(script);
    return () => { node.innerHTML = ""; };
  }, [botUsername]);
  return <div ref={holder} className="min-h-11" />;
}

// Shown on every entry for signed-in users until BOTH channels are verified on the server.
// Close (X) and "Skip for now" hide it only for the current page visit; a new entry or login shows it again.
export default function ChannelShowcase() {
  const { user } = useAuth() || {};
  const uid = user?.id || null;
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!uid) { setStatus(null); setOpen(false); return; }
    let active = true;
    setOpen(true);
    const params = new URLSearchParams(window.location.search);
    const code = params.get("showcase");
    if (code && MESSAGES[code]) setNotice({ code, ...Object.fromEntries([["tone", MESSAGES[code][0]], ["text", MESSAGES[code][1]]]) });
    if (code) {
      params.delete("showcase");
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
    }
    fetch("/api/showcase", { credentials: "same-origin", cache: "no-store" })
      .then(response => { if (!response.ok) throw new Error("status"); return response.json(); })
      .then(data => { if (active) setStatus(data); })
      .catch(() => { if (active) setStatus({ telegramJoined: false, youtubeSubscribed: false, telegram: { configured: false }, youtube: { configured: false } }); });
    return () => { active = false; };
  }, [uid]);

  if (!uid || !open || !status) return null;
  if (status.telegramJoined && status.youtubeSubscribed) return null;

  const telegramStep = (
    <>
      {status.telegramJoined ? (
        <span className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[12px] font-bold text-emerald-700"><CheckCircle2 size={16} aria-hidden="true" />Verified</span>
      ) : status.telegram?.configured ? (
        <TelegramLogin botUsername={status.telegram.botUsername} />
      ) : (
        <span className="text-[12px] text-neutral-500">Verification is being set up.</span>
      )}
    </>
  );

  const youtubeStep = (
    <>
      {status.youtubeSubscribed ? (
        <span className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[12px] font-bold text-emerald-700"><CheckCircle2 size={16} aria-hidden="true" />Verified</span>
      ) : status.youtube?.configured ? (
        <a href="/api/showcase/youtube/start" className="inline-flex min-h-11 items-center rounded-xl border border-neutral-300 bg-white px-4 text-[12px] font-bold text-neutral-800 hover:bg-neutral-50">Verify subscription</a>
      ) : (
        <span className="text-[12px] text-neutral-500">Verification is being set up.</span>
      )}
    </>
  );

  const cards = [
    { key: "telegram", name: "Telegram", href: TELEGRAM_URL, cta: "Join channel", note: "t.me/pincraft_ai", tone: "bg-[#229ED9]", icon: "tg", step: telegramStep, done: status.telegramJoined },
    { key: "youtube", name: "YouTube", href: YOUTUBE_URL, cta: "Subscribe", note: "@PinCraftOfficial", tone: "bg-[#FF0000]", icon: "yt", step: youtubeStep, done: status.youtubeSubscribed },
  ];

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-neutral-900/50 p-4" data-testid="channel-showcase">
      <div role="dialog" aria-modal="true" aria-labelledby="channel-showcase-title" className="relative w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl">
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800">
          <X size={18} aria-hidden="true" />
        </button>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-brand-700">Stay connected</p>
        <h2 id="channel-showcase-title" className="mt-2 pr-10 text-[20px] font-extrabold leading-tight tracking-[-0.03em] text-neutral-900">Join the PinCraft channels</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-neutral-600">Join or subscribe, then verify. We check the membership ourselves. This message stays until both are verified.</p>

        <ul className="mt-5 grid gap-3">
          {cards.map(card => (
            <li key={card.key} className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${card.tone}`}><Glyph kind={card.icon} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-extrabold text-neutral-900">{card.name}</p>
                <p className="truncate text-[12px] text-neutral-500">{card.note}</p>
              </div>
              {!card.done && <a href={card.href} target="_blank" rel="noopener noreferrer" aria-label={`${card.cta} on ${card.name} (opens in a new tab)`} className="inline-flex min-h-11 items-center rounded-xl bg-neutral-900 px-4 text-[12px] font-bold text-white hover:bg-neutral-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-100">{card.cta}</a>}
              {card.step}
            </li>
          ))}
        </ul>

        {notice && <p role="status" className={`mt-4 text-[12px] font-semibold ${notice.tone === "ok" ? "text-emerald-700" : "text-brand-700"}`}>{notice.text}</p>}

        <div className="mt-6 flex justify-end border-t border-neutral-100 pt-4">
          <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-xl px-4 text-[12px] font-bold text-neutral-600 hover:bg-neutral-100">Skip for now</button>
        </div>
      </div>
    </div>
  );
}
