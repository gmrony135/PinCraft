"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { useAuth } from "@/components/providers/AppProvider";

export const TELEGRAM_URL = "https://t.me/pincraft_ai";
export const YOUTUBE_URL = "https://www.youtube.com/@PinCraftOfficial";
const YOUTUBE_START = "/api/showcase/youtube/start";

const PATHS = { yt: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z", tg: "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" };

const MESSAGES = {
  telegram_joined: ["ok", "Telegram membership verified. Thank you."],
  youtube_subscribed: ["ok", "YouTube subscription verified. Thank you."],
  telegram_not_member: ["err", "We could not find your Telegram account in the channel yet. You can join and try again any time."],
  telegram_auth_failed: ["err", "Telegram sign-in could not be verified. Please try again."],
  telegram_auth_expired: ["err", "The Telegram sign-in expired. Please try again."],
  telegram_unavailable: ["err", "Telegram could not be checked right now. Please try again later."],
  telegram_bot_not_admin: ["err", "Telegram check is temporarily unavailable. Joining is still optional."],
  telegram_not_configured: ["err", "Telegram check is not available right now."],
  youtube_not_subscribed: ["err", "No subscription to @PinCraftOfficial was found on that Google account. You can subscribe and try again any time."],
  youtube_denied: ["err", "YouTube permission was not granted, so the subscription was not checked."],
  youtube_state_invalid: ["err", "That check expired. Please try again."],
  youtube_unavailable: ["err", "YouTube could not be checked right now. Please try again later."],
  youtube_token_failed: ["err", "Google did not complete the YouTube check. Please try again."],
  youtube_api_disabled: ["err", "YouTube check is temporarily unavailable. Joining is still optional."],
  youtube_scope_missing: ["err", "YouTube permission is incomplete. Please try the check again and allow read-only YouTube access."],
  youtube_not_configured: ["err", "YouTube check is not available right now."],
};

function Glyph({ kind }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="#FFFFFF" d={PATHS[kind]} /></svg>;
}

// Telegram Login Widget in callback mode: it stays on this page and calls window.pincraftTelegramAuth(user).
function TelegramLogin({ botUsername, onAuth }) {
  const holder = useRef(null);
  const handler = useRef(onAuth);
  handler.current = onAuth;
  useEffect(() => {
    const node = holder.current;
    if (!node || !botUsername) return undefined;
    window.pincraftTelegramAuth = user => handler.current(user);
    node.innerHTML = "";
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "10");
    script.setAttribute("data-onauth", "pincraftTelegramAuth(user)");
    node.appendChild(script);
    return () => { node.innerHTML = ""; delete window.pincraftTelegramAuth; };
  }, [botUsername]);
  return <div ref={holder} className="flex min-h-11 w-full justify-center" />;
}

// Optional and never blocking: no backdrop, the rest of the site stays usable.
// X and "Skip for now" hide it for this visit only. It stops once both checks are verified.
export default function ChannelShowcase() {
  const { user } = useAuth() || {};
  const uid = user?.id || null;
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/showcase", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("status");
      setStatus(await response.json());
    } catch {
      setStatus(prev => prev || { telegramJoined: false, youtubeSubscribed: false, telegram: { configured: false }, youtube: { configured: false } });
    }
  }, []);

  const showCode = useCallback((code) => {
    if (MESSAGES[code]) setNotice({ tone: MESSAGES[code][0], text: MESSAGES[code][1] });
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!uid) { setStatus(null); setOpen(false); return; }
    setOpen(true);
    const params = new URLSearchParams(window.location.search);
    const code = params.get("showcase");
    if (code) {
      params.delete("showcase");
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
      showCode(code);
    } else {
      loadStatus();
    }
  }, [uid, loadStatus, showCode]);

  // Results from the YouTube popup window, and a refresh when the user returns to this tab.
  useEffect(() => {
    if (!uid) return undefined;
    const onMessage = event => {
      if (event.origin !== window.location.origin || event.data?.source !== "pincraft-showcase") return;
      showCode(String(event.data.code || ""));
    };
    const onFocus = () => loadStatus();
    window.addEventListener("message", onMessage);
    window.addEventListener("focus", onFocus);
    return () => { window.removeEventListener("message", onMessage); window.removeEventListener("focus", onFocus); };
  }, [uid, loadStatus, showCode]);

  async function onTelegramAuth(tgUser) {
    setBusy(true);
    try {
      const response = await fetch("/api/showcase/telegram/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(tgUser),
      });
      const data = await response.json().catch(() => ({}));
      showCode(data.code || "telegram_unavailable");
    } catch {
      showCode("telegram_unavailable");
    } finally {
      setBusy(false);
    }
  }

  function openYoutube() {
    const win = window.open(YOUTUBE_START, "pincraft-youtube", "popup,width=520,height=680");
    if (!win) window.location.href = YOUTUBE_START;
  }

  if (!uid || !open || !status) return null;
  if (status.telegramJoined && status.youtubeSubscribed) return null;

  const telegramAction = status.telegramJoined ? (
    <span className="inline-flex min-h-11 items-center gap-1.5 text-[12px] font-bold text-emerald-700"><CheckCircle2 size={16} aria-hidden="true" />Verified</span>
  ) : status.telegram?.configured ? (
    <TelegramLogin botUsername={status.telegram.botUsername} onAuth={onTelegramAuth} />
  ) : (
    <span className="text-[12px] text-neutral-500">Telegram check is not available right now.</span>
  );

  const youtubeAction = status.youtubeSubscribed ? (
    <span className="inline-flex min-h-11 items-center gap-1.5 text-[12px] font-bold text-emerald-700"><CheckCircle2 size={16} aria-hidden="true" />Verified</span>
  ) : status.youtube?.configured ? (
    <button type="button" onClick={openYoutube} disabled={busy} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-[12px] font-bold text-neutral-800 hover:bg-neutral-50 disabled:opacity-60">Verify subscription</button>
  ) : (
    <span className="text-[12px] text-neutral-500">YouTube check is not available right now.</span>
  );

  const cards = [
    { key: "telegram", name: "Telegram", note: "t.me/pincraft_ai", href: TELEGRAM_URL, cta: "Join channel", tone: "bg-[#229ED9]", icon: "tg", done: status.telegramJoined, action: telegramAction },
    { key: "youtube", name: "YouTube", note: "@PinCraftOfficial", href: YOUTUBE_URL, cta: "Subscribe", tone: "bg-[#FF0000]", icon: "yt", done: status.youtubeSubscribed, action: youtubeAction },
  ];

  return (
    <div className="pointer-events-none fixed inset-x-2 bottom-2 z-[80] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[420px]" data-testid="channel-showcase">
      <div role="dialog" aria-labelledby="channel-showcase-title" className="pointer-events-auto relative max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xl sm:p-5">
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800">
          <X size={18} aria-hidden="true" />
        </button>
        <p className="pr-10 text-[10px] font-extrabold uppercase tracking-[0.13em] text-brand-700">Stay connected (optional)</p>
        <h2 id="channel-showcase-title" className="mt-1 pr-10 text-[18px] font-extrabold leading-tight tracking-[-0.02em] text-neutral-900">Join the PinCraft channels</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-neutral-600">Joining is optional. You can skip this and use PinCraft normally. Verified joins stop this message.</p>

        <ul className="mt-4 grid gap-3">
          {cards.map(card => (
            <li key={card.key} className="grid gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${card.tone}`}><Glyph kind={card.icon} /></span>
                <div className="min-w-0 flex-1">
                  <p className="whitespace-normal break-words text-[14px] font-extrabold text-neutral-900">{card.name}</p>
                  <p className="break-all text-[12px] text-neutral-500">{card.note}</p>
                </div>
              </div>
              {!card.done && <a href={card.href} target="_blank" rel="noopener noreferrer" aria-label={`${card.cta} on ${card.name} (opens in a new tab)`} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-neutral-900 px-4 text-center text-[12px] font-bold text-white hover:bg-neutral-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-100">{card.cta}</a>}
              <div className="w-full">{card.action}</div>
            </li>
          ))}
        </ul>

        {notice && <p role="status" className={`mt-4 break-words text-[12px] font-semibold ${notice.tone === "ok" ? "text-emerald-700" : "text-neutral-700"}`}>{notice.text}</p>}

        <div className="mt-4 flex justify-end border-t border-neutral-100 pt-3">
          <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-xl px-4 text-[12px] font-bold text-neutral-600 hover:bg-neutral-100">Skip for now</button>
        </div>
      </div>
    </div>
  );
}
