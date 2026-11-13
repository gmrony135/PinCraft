"use client";

import { Logo } from "../ui";
import { CATEGORIES } from "@/lib/store";
import {
  ArrowRight,
  Link2,
  MousePointerClick,
  Wand2,
  Check,
} from "lucide-react";

const STEPS = [
  {
    icon: Link2,
    title: "Connect Pinterest",
    text: "One tap to link your account securely.",
  },
  {
    icon: MousePointerClick,
    title: "Choose Category",
    text: "Pick from niches that convert to traffic.",
  },
  {
    icon: Wand2,
    title: "AI Crafts & Posts Daily",
    text: "Pins + blogs published on autopilot.",
  },
];

export default function Landing({ go, state }) {
  const isLoggedIn = !!state.user;

  return (
    <div className="app-shell pb-10">
      {/* Top bar */}
      <header className="flex items-center justify-between pt-5">
        <Logo size="md" onClick={() => go("landing")} />
        {isLoggedIn ? (
          <button onClick={() => go("dashboard")} className="btn btn-ghost btn-sm">
            Dashboard
          </button>
        ) : (
          <button onClick={() => go("login")} className="btn btn-ghost btn-sm">
            Login
          </button>
        )}
      </header>

      {/* Hero */}
      <section className="animate-fade-up pt-9">
        <span className="chip bg-pin-50 text-pin-600">
          <span className="text-[13px] leading-none">✨</span> Crafted Pins, Daily Traffic
        </span>

        <h1 className="mt-4 text-[33px] font-extrabold leading-[1.12] tracking-[-0.035em] text-neutral-900">
          Pinterest + Blog
          <br />
          Automation in 1 Click
        </h1>

        <p className="mt-3.5 text-[15.5px] leading-relaxed text-neutral-500">
          Choose category, AI will craft Pin + Blog daily. You just relax.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <button onClick={() => go("signup")} className="btn-primary w-full">
            Get Started Free <ArrowRight size={18} />
          </button>
          <button onClick={() => go("login")} className="btn-outline w-full">
            Login
          </button>
        </div>

        <div className="mt-3.5 flex items-center justify-center gap-4 text-[11.5px] font-medium text-neutral-400">
          <span className="inline-flex items-center gap-1">
            <Check size={13} className="text-emerald-500" /> No credit card
          </span>
          <span className="inline-flex items-center gap-1">
            <Check size={13} className="text-emerald-500" /> Free plan forever
          </span>
        </div>
      </section>

      {/* Hero visual card */}
      <section className="mt-8 overflow-hidden rounded-4xl border border-neutral-100 bg-gradient-to-b from-pin-50 to-white p-4 shadow-card">
        <div className="grid grid-cols-3 gap-2.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="aspect-[3/4] overflow-hidden rounded-2xl bg-white p-2.5 shadow-sm"
            >
              <div
                className={`h-1.5 w-8 rounded-full ${
                  ["bg-pin-600", "bg-amber-400", "bg-emerald-400"][i]
                }`}
              />
              <div className="mt-2 space-y-1.5">
                <div className="h-1.5 w-full rounded-full bg-neutral-100" />
                <div className="h-1.5 w-4/5 rounded-full bg-neutral-100" />
                <div className="h-1.5 w-2/3 rounded-full bg-neutral-100" />
              </div>
              <div className="mt-3 h-10 rounded-lg bg-neutral-50" />
              <div className="mt-2 flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-pin-600" />
                <div className="h-1.5 w-8 rounded-full bg-neutral-100" />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3.5 flex items-center justify-center gap-2 text-[12px] font-semibold text-neutral-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Auto-posting 3 pins / day
        </div>
      </section>

      {/* Categories */}
      <section className="mt-9">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-[17px] font-bold tracking-tight">Popular categories</h2>
          <span className="text-xs font-semibold text-neutral-400">6 niches</span>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {CATEGORIES.slice(0, 3).map((c, i) => (
            <button
              key={c.id}
              onClick={() => go("signup")}
              style={{ animationDelay: `${i * 60}ms` }}
              className={`tap animate-fade-up flex min-h-[92px] flex-col items-start justify-between rounded-2xl bg-gradient-to-b ${c.tint} p-3 text-left shadow-card`}
            >
              <span className="text-[22px] leading-none tracking-normal">{c.emoji}</span>
              <p className="mt-2 text-[12.5px] font-bold leading-tight text-neutral-800">
                {c.name}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mt-9">
        <h2 className="mb-3 text-[17px] font-bold tracking-tight">How it works</h2>
        <div className="space-y-2.5">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.title} className="card flex items-center gap-3.5 p-4">
                <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-pin-50 text-pin-600">
                  <Icon size={20} />
                  <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-pin-600 text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-[14.5px] font-bold text-neutral-900">{s.title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-neutral-500">
                    {s.text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="mt-9 rounded-4xl bg-neutral-900 p-6 text-center">
        <h3 className="text-[19px] font-extrabold text-white">
          Your next 30 pins are one tap away
        </h3>
        <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">
          Join creators growing traffic while they sleep.
        </p>
        <button
          onClick={() => go("signup")}
          className="btn-primary mt-5 w-full"
        >
          Get Started Free <ArrowRight size={18} />
        </button>
      </section>

      <footer className="mt-8 text-center text-[11px] text-neutral-400">
        © {new Date().getFullYear()} PinCraft — Crafted Pins, Daily Traffic
      </footer>
    </div>
  );
}
