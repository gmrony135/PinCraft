"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useAuth } from "@/components/providers/AppProvider";

export const TELEGRAM_URL = "https://t.me/pincraft_ai";

const TG_PATH = "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z";

// Plain messages for each failure. These are service errors, never "not joined yet".
const ERRORS = {
  network: "PinCraft could not reach the Telegram check. Check your connection and try again.",
  sign_in_required: "Your sign-in has ended. Sign in again to continue.",
  telegram_unavailable: "Telegram could not be checked right now. Try again in a moment.",
  telegram_bot_not_admin: "The Telegram check is temporarily unavailable. Try again in a moment.",
  telegram_not_configured: "The Telegram check is not available right now. Try again later.",
  telegram_auth_failed: "Telegram sign-in could not be verified. Try again.",
  telegram_auth_expired: "The Telegram sign-in expired. Try again.",
  unknown: "Telegram could not be checked right now. Try again.",
};

function errorText(code) {
  return ERRORS[code] || ERRORS.unknown;
}

// Hard gate for signed-in users: until Telegram membership is verified by the server, the whole site
// is covered. There is no close button and no way past it. Service errors show a message and a retry.
export default function ChannelShowcase() {
  const { user } = useAuth() || {};
  const uid = user?.id || null;
  const [status, setStatus] = useState(null); // null = not loaded yet
  const [error, setError] = useState(null); // service error code, or null
  const [linked, setLinked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const gatedRef = useRef(false);
  const joined = status?.telegramJoined === true;

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/showcase", { credentials: "same-origin", cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.code || "network");
        return;
      }
      setStatus(data);
      if (!data.telegramJoined && !data.telegram?.configured) setError("telegram_not_configured");
    } catch {
      setError("network");
    }
  }, []);

  // Asks the server to check membership for a linked account. The server sets the verified flag only
  // after a successful getChatMember call.
  const recheck = useCallback(async () => {
    try {
      const response = await fetch("/api/showcase/telegram/recheck", { method: "POST", credentials: "same-origin", cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!data) {
        setError("network");
        return;
      }
      setLinked(Boolean(data.linked));
      if (data.telegramJoined) {
        setStatus(prev => (prev ? { ...prev, telegramJoined: true } : { telegramJoined: true }));
        setError(null);
        return;
      }
      setError(data.ok ? null : data.code || (response.ok ? "unknown" : "network"));
    } catch {
      setError("network");
    }
  }, []);

  const refresh = useCallback(async () => {
    await recheck();
    await loadStatus();
  }, [recheck, loadStatus]);

  // Load on sign-in, and check again whenever the user returns to this tab.
  useEffect(() => {
    if (!uid) {
      setStatus(null);
      setError(null);
      setLinked(false);
      setCelebrate(false);
      gatedRef.current = false;
      return undefined;
    }
    refresh();
    const onFocus = () => { refresh(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [uid, refresh]);

  // While not verified: check every 4 seconds for three minutes, then every 30 seconds. START and the
  // channel join both show up here without a button press.
  useEffect(() => {
    if (!uid || status === null || joined) return undefined;
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      if (ticks > 45 && ticks % 8 !== 0) return;
      refresh();
    }, 4000);
    return () => clearInterval(timer);
  }, [uid, status, joined, refresh]);

  // Show the "Verified" confirmation only for someone who was gated in this session.
  useEffect(() => {
    if (status === null) return;
    if (!joined) gatedRef.current = true;
    else if (gatedRef.current) setCelebrate(true);
  }, [status, joined]);

  // Stop the page behind the gate from scrolling.
  const gated = Boolean(uid) && (status === null || !joined || celebrate);
  useEffect(() => {
    if (!gated) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [gated]);

  // Opens the bot deep link. The server creates a single-use, 10-minute token tied to this account.
  async function joinAndVerify() {
    setBusy(true);
    try {
      const response = await fetch("/api/showcase/telegram/link", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.url) {
        setError(data?.code || (response.ok ? "unknown" : "network"));
        return;
      }
      setLinked(true);
      setError(null);
      setWaiting(true);
      window.location.assign(data.url);
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  if (!gated) return null;

  const checking = status === null && !error;
  const botReady = status?.telegram?.configured === true;

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-neutral-900/70" data-testid="channel-showcase">
      <div className="flex min-h-full items-center justify-center p-3">
        <div role="dialog" aria-modal="true" aria-labelledby="channel-showcase-title" aria-describedby="channel-showcase-body" className="relative w-full max-w-[420px] rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xl sm:p-5">
          {celebrate ? (
            <>
              <span className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-extrabold text-emerald-700"><CheckCircle2 size={18} aria-hidden="true" />Verified</span>
              <h2 id="channel-showcase-title" className="mt-1 text-[18px] font-extrabold leading-tight text-neutral-900">Telegram membership verified</h2>
              <p id="channel-showcase-body" className="mt-2 text-[13px] leading-relaxed text-neutral-600">Thank you for joining @pincraft_ai. You can use PinCraft now.</p>
              <button type="button" onClick={() => setCelebrate(false)} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-neutral-900 px-4 text-[13px] font-bold text-white hover:bg-neutral-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-100">Continue</button>
            </>
          ) : (
            <>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-brand-700">Required to continue</p>
              <h2 id="channel-showcase-title" className="mt-1 text-[18px] font-extrabold leading-tight tracking-[-0.02em] text-neutral-900">Join PinCraft on Telegram</h2>
              <p id="channel-showcase-body" className="mt-2 text-[13px] leading-relaxed text-neutral-600">
                Tap Join &amp; Verify. Telegram opens the PinCraft bot: tap START, then tap Join @pincraft_ai in the bot chat. This screen updates by itself once you have joined.
              </p>

              <div className="mt-4 flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#229ED9]">
                  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="#FFFFFF" d={TG_PATH} /></svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-extrabold text-neutral-900">Telegram channel</p>
                  <p className="break-all text-[12px] text-neutral-500">@pincraft_ai</p>
                </div>
              </div>

              <div role="status" aria-live="polite" className="mt-3 min-h-[20px] break-words text-[12px] font-semibold leading-relaxed">
                {error ? (
                  <p className="text-red-700">{errorText(error)}</p>
                ) : checking ? (
                  <p className="text-neutral-600">Checking your Telegram membership...</p>
                ) : waiting || linked ? (
                  <p className="text-neutral-700">Waiting for you to join @pincraft_ai in Telegram. This updates automatically.</p>
                ) : (
                  <p className="text-neutral-700">Not verified yet.</p>
                )}
              </div>

              {!checking && botReady ? (
                <button type="button" onClick={joinAndVerify} disabled={busy} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-neutral-900 px-4 text-[13px] font-bold text-white hover:bg-neutral-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:opacity-60">
                  {busy ? "Opening Telegram..." : "Join & Verify"}
                </button>
              ) : !checking ? (
                <button type="button" onClick={refresh} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-neutral-900 px-4 text-[13px] font-bold text-white hover:bg-neutral-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-100">
                  Try again
                </button>
              ) : null}
              <p className="mt-3 text-center text-[11px] text-neutral-500">Verification is checked by PinCraft&apos;s server. It cannot be set from this screen.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
