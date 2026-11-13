"use client";

import { Logo, SectionTitle } from "../ui";
import { CATEGORIES, resolveCategory } from "@/lib/store";
import {
  Sparkles,
  BookOpen,
  Link2,
  CalendarCheck2,
  Check,
  ChevronRight,
  Bell,
} from "lucide-react";

export default function Dashboard({ go, state, actions, toast }) {
  const user = state.user;
  const firstName = (user?.name || "Creator").split(" ")[0];
  const todayISO = new Date().toISOString().slice(0, 10);
  const pinsToday = state.pins.filter((p) => p.createdAt.slice(0, 10) === todayISO)
    .length;
  const schedule = state.schedules[0];
  const daily = schedule?.pinsPerDay || 0;
  const taskLeft = Math.max(daily - pinsToday, 0);

  const stats = [
    {
      label: "Total Pins Created",
      value: state.pins.length,
      icon: Sparkles,
      tint: "bg-pin-50 text-pin-600",
      onClick: () => go("content"),
    },
    {
      label: "Total Blogs",
      value: state.pins.length,
      icon: BookOpen,
      tint: "bg-blue-50 text-blue-600",
      onClick: () => go("content"),
    },
    {
      label: "Pinterest Connected",
      value: state.pinterestConnected ? "Yes" : "No",
      icon: Link2,
      tint: state.pinterestConnected
        ? "bg-emerald-50 text-emerald-600"
        : "bg-neutral-100 text-neutral-500",
      onClick: () => go("settings"),
    },
    {
      label: "Today's Task",
      value: daily ? `${taskLeft} left` : "Not set",
      icon: CalendarCheck2,
      tint: "bg-amber-50 text-amber-600",
      onClick: () => go("schedule"),
    },
  ];

  return (
    <div className="app-shell pb-10">
      {/* Header */}
      <header className="flex items-center justify-between pt-5">
        <Logo size="md" onClick={() => go("landing")} />
        <div className="flex items-center gap-2">
          <button
            onClick={() => toast("You're all caught up ✨", "info")}
            aria-label="Notifications"
            className="tap grid h-10 w-10 place-items-center rounded-full bg-neutral-100 text-neutral-600"
          >
            <Bell size={18} />
          </button>
          <button
            onClick={() => go("settings")}
            aria-label="Settings"
            className="grid h-10 w-10 place-items-center rounded-full bg-neutral-900 text-[13px] font-bold text-white"
          >
            {(user?.name || "U").slice(0, 1).toUpperCase()}
          </button>
        </div>
      </header>

      {/* Welcome */}
      <section className="animate-fade-up pt-6">
        <p className="text-[13px] font-medium text-neutral-400">Welcome back,</p>
        <div className="mt-0.5 flex items-center gap-2">
          <h1 className="text-[26px] font-extrabold tracking-tight text-neutral-900">
            {firstName}
          </h1>
          <span className="chip bg-neutral-900 text-white">
            Plan: {state.plan}
          </span>
        </div>
      </section>

      {/* Stats */}
      <section className="mt-5 grid grid-cols-2 gap-3">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <button
              key={s.label}
              onClick={s.onClick}
              style={{ animationDelay: `${i * 50}ms` }}
              className="card tap animate-fade-up p-3.5 text-left"
            >
              <span
                className={`grid h-9 w-9 place-items-center rounded-xl ${s.tint}`}
              >
                <Icon size={17} />
              </span>
              <p className="mt-2.5 text-[20px] font-extrabold leading-none text-neutral-900">
                {s.value}
              </p>
              <p className="mt-1 text-[11.5px] font-medium leading-tight text-neutral-500">
                {s.label}
              </p>
            </button>
          );
        })}
      </section>

      {/* Connect Pinterest */}
      <section className="mt-4">
        <button
          onClick={() =>
            state.pinterestConnected ? go("settings") : go("pinterest")
          }
          className={`tap flex w-full items-center justify-between rounded-3xl p-4 text-left ${
            state.pinterestConnected
              ? "bg-emerald-50 ring-1 ring-emerald-100"
              : "bg-pin-600 shadow-pop"
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`grid h-11 w-11 place-items-center rounded-2xl ${
                state.pinterestConnected ? "bg-emerald-500" : "bg-white/15"
              } text-white`}
            >
              {state.pinterestConnected ? <Check size={20} /> : <Link2 size={20} />}
            </span>
            <div>
              <p
                className={`text-[15px] font-bold ${
                  state.pinterestConnected ? "text-emerald-900" : "text-white"
                }`}
              >
                {state.pinterestConnected
                  ? "Pinterest Connected"
                  : "Connect Pinterest Account"}
              </p>
              <p
                className={`mt-0.5 text-[11.5px] ${
                  state.pinterestConnected ? "text-emerald-700" : "text-white/70"
                }`}
              >
                {state.pinterestConnected
                  ? state.settings.pinterestUrl || "Manage in settings"
                  : "Required for auto-posting"}
              </p>
            </div>
          </div>
          <ChevronRight
            size={20}
            className={state.pinterestConnected ? "text-emerald-600" : "text-white/70"}
          />
        </button>
      </section>

      {/* Category selection */}
      <section className="mt-7">
        <SectionTitle
          action={
            <span className="text-[11.5px] font-semibold text-neutral-400">
              1 per plan
            </span>
          }
        >
          Category selection
        </SectionTitle>
        <div className="grid grid-cols-3 gap-2.5">
          {CATEGORIES.map((c) => {
            const active = state.selectedCategory === c.id;
            return (
              <button
                key={c.id}
                onClick={() => actions.selectCategory(c.id)}
                className={`tap relative overflow-hidden rounded-2xl border-2 p-3 text-left transition ${
                  active
                    ? "border-pin-600 bg-pin-50"
                    : "border-neutral-200 bg-white"
                }`}
              >
                {active && (
                  <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-pin-600 text-white">
                    <Check size={10} strokeWidth={4} />
                  </span>
                )}
                <span className="text-[19px] leading-none tracking-normal">{c.emoji}</span>
                <p
                  className={`mt-1.5 text-[12px] font-bold leading-tight ${
                    active ? "text-pin-700" : "text-neutral-700"
                  }`}
                >
                  {c.name}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Quick actions */}
      <section className="mt-7">
        <SectionTitle>Quick actions</SectionTitle>
        <div className="space-y-2.5">
          <button
            onClick={() => go("content")}
            className="card tap flex w-full items-center gap-3.5 p-4 text-left"
          >
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-pin-50 text-pin-600">
              <Sparkles size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-bold text-neutral-900">
                Create new content
              </p>
              <p className="text-[12px] text-neutral-500">
                5 titles · 5 descriptions · 1 blog
              </p>
            </div>
            <ChevronRight size={18} className="text-neutral-300" />
          </button>

          <button
            onClick={() => go("schedule")}
            className="card tap flex w-full items-center gap-3.5 p-4 text-left"
          >
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-amber-600">
              <CalendarCheck2 size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-bold text-neutral-900">
                {schedule ? "Automation running" : "Set up daily schedule"}
              </p>
              <p className="text-[12px] text-neutral-500">
                {schedule
                  ? `${schedule.pinsPerDay} pins/day · ${schedule.time}`
                  : "3 / 5 / 10 pins per day"}
              </p>
            </div>
            <ChevronRight size={18} className="text-neutral-300" />
          </button>
        </div>
      </section>

      {/* Recent */}
      {state.pins.length > 0 && (
        <section className="mt-7">
          <SectionTitle
            action={
              <button
                onClick={() => go("content")}
                className="text-[12px] font-bold text-pin-600"
              >
                View all
              </button>
            }
          >
            Recent content
          </SectionTitle>
          <div className="space-y-2">
            {state.pins.slice(0, 3).map((p) => (
              <button
                key={p.id}
                onClick={() => go("content")}
                className="card tap flex w-full items-center gap-3 p-3.5 text-left"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-[13px]">
                  {CATEGORIES.find((c) => c.id === resolveCategory(p.category))?.emoji || "📌"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-neutral-900">
                    {p.topic}
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    {new Date(p.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    · {p.blog.wordCount} words
                  </p>
                </div>
                <ChevronRight size={16} className="text-neutral-300" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
