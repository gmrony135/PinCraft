"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { useAuth } from "@/components/providers/AppProvider";

export const TELEGRAM_URL = "https://t.me/pincraft_ai";
export const YOUTUBE_URL = "https://www.youtube.com/@PinCraftOfficial";

const PATHS = { yt: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z", tg: "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" };

const CHANNELS = [
  { key: "telegram", field: "telegramJoined", name: "Telegram", href: TELEGRAM_URL, cta: "Join channel", confirm: "I joined", done: "Joined", tone: "bg-[#229ED9]", icon: "tg", note: "t.me/pincraft_ai" },
  { key: "youtube", field: "youtubeSubscribed", name: "YouTube", href: YOUTUBE_URL, cta: "Subscribe", confirm: "I subscribed", done: "Subscribed", tone: "bg-[#FF0000]", icon: "yt", note: "@PinCraftOfficial" },
];

function Glyph({ kind }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="#FFFFFF" d={PATHS[kind]} /></svg>;
}

// Shown on every entry for signed-in users until BOTH confirmations are recorded.
// Close (X) and "Skip" hide it only for the current page visit; a new entry or login shows it again.
export default function ChannelShowcase() {
  const { user } = useAuth() || {};
  const uid = user?.id || null;
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!uid) { setStatus(null); setOpen(false); return; }
    let active = true;
    setOpen(true);
    setError("");
    fetch("/api/showcase", { credentials: "same-origin", cache: "no-store" })
      .then(response => { if (!response.ok) throw new Error("status"); return response.json(); })
      .then(data => { if (active) setStatus({ telegramJoined: data.telegramJoined === true, youtubeSubscribed: data.youtubeSubscribed === true }); })
      .catch(() => { if (active) { setStatus({ telegramJoined: false, youtubeSubscribed: false }); setError("We could not load your confirmation status. Your choices will still be saved when you confirm."); } });
    return () => { active = false; };
  }, [uid]);

  if (!uid || !open || !status) return null;
  if (status.telegramJoined && status.youtubeSubscribed) return null;

  async function confirm(channel) {
    setBusy(channel.key); setError("");
    try {
      const response = await fetch("/api/showcase", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel: channel.key }),
      });
      if (!response.ok) throw new Error("save");
      const data = await response.json();
      setStatus({ telegramJoined: data.telegramJoined === true, youtubeSubscribed: data.youtubeSubscribed === true });
    } catch {
      setError("Could not save that confirmation. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-neutral-900/50 p-4" data-testid="channel-showcase">
      <div role="dialog" aria-modal="true" aria-labelledby="channel-showcase-title" className="relative w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl">
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800">
          <X size={18} aria-hidden="true" />
        </button>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-brand-700">Stay connected</p>
        <h2 id="channel-showcase-title" className="mt-2 pr-10 text-[20px] font-extrabold leading-tight tracking-[-0.03em] text-neutral-900">Join the PinCraft channels</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-neutral-600">Follow the channels below and confirm each one. This message will keep returning until both are confirmed.</p>

        <ul className="mt-5 grid gap-3">
          {CHANNELS.map(channel => {
            const joined = status[channel.field];
            return (
              <li key={channel.key} className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${channel.tone}`}><Glyph kind={channel.icon} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-extrabold text-neutral-900">{channel.name}</p>
                  <p className="truncate text-[12px] text-neutral-500">{channel.note}</p>
                </div>
                <a href={channel.href} target="_blank" rel="noopener noreferrer" aria-label={`${channel.cta} on ${channel.name} (opens in a new tab)`} className="inline-flex min-h-11 items-center rounded-xl bg-neutral-900 px-4 text-[12px] font-bold text-white hover:bg-neutral-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-100">
                  {channel.cta}
                </a>
                {joined ? (
                  <span className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[12px] font-bold text-emerald-700"><CheckCircle2 size={16} aria-hidden="true" />{channel.done}</span>
                ) : (
                  <button type="button" onClick={() => confirm(channel)} disabled={busy === channel.key} className="inline-flex min-h-11 items-center rounded-xl border border-neutral-300 bg-white px-4 text-[12px] font-bold text-neutral-800 hover:bg-neutral-50 disabled:opacity-60">
                    {busy === channel.key ? "Saving..." : channel.confirm}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {error && <p role="alert" className="mt-4 text-[12px] font-semibold text-brand-700">{error}</p>}

        <div className="mt-6 flex justify-end border-t border-neutral-100 pt-4">
          <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-xl px-4 text-[12px] font-bold text-neutral-600 hover:bg-neutral-100">Skip for now</button>
        </div>
      </div>
    </div>
  );
}
