"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  DollarSign,
  Eye,
  FlaskConical,
  Info,
  LayoutDashboard,
  Monitor,
  Moon,
  MousePointer2,
  Save,
  SlidersHorizontal,
  Sun,
  Sunrise,
  Sunset,
} from "lucide-react";
import {
  AUTOMATION_STORAGE_KEY,
  DASHBOARD_STATS,
  DEFAULT_AUTOMATION,
  PIN_COUNTS,
  POST_TIMES,
  isValidAutomation,
  normalizeAutomation,
  sameAutomation,
} from "@/lib/dashboard";
import RecentActivity from "./RecentActivity";
import ViewsChart from "./ViewsChart";
import { useFeedback } from "../providers/AppProvider";

const STAT_ICONS = { pins: Bookmark, views: Eye, clicks: MousePointer2, earning: DollarSign };
const TIME_ICONS = { Morning: Sunrise, Afternoon: Sun, Evening: Sunset, Night: Moon };

export default function AutomationDashboard() {
  const { showSuccess } = useFeedback();
  const [settings, setSettings] = useState({ ...DEFAULT_AUTOMATION });
  const [savedSettings, setSavedSettings] = useState(null);
  const [ready, setReady] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(AUTOMATION_STORAGE_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (isValidAutomation(parsed)) {
          const restored = normalizeAutomation(parsed);
          setSettings(restored);
          setSavedSettings(restored);
        } else {
          setFeedback({ type: "error", text: "Saved settings were invalid. Defaults are shown; save to replace them." });
        }
      }
    } catch {
      setFeedback({ type: "error", text: "We could not load your saved settings. Defaults are shown." });
    } finally {
      setReady(true);
    }
  }, []);

  const hasChanges = !sameAutomation(settings, savedSettings);
  const settingStatus = !ready
    ? "Loading settings…"
    : !savedSettings
      ? "Not saved yet"
      : hasChanges
        ? "Unsaved changes"
        : "Saved locally";

  function updateSettings(update) {
    setSettings((previous) => ({ ...previous, ...update }));
    setFeedback(null);
  }

  function handleSave(event) {
    event.preventDefault();
    if (!ready) return;
    const next = { ...normalizeAutomation(settings), savedAt: new Date().toISOString() };
    try {
      window.localStorage.setItem(AUTOMATION_STORAGE_KEY, JSON.stringify(next));
      setSettings(next);
      setSavedSettings(next);
      setFeedback({ type: "success", text: "Automation settings saved on this device." });
      showSuccess({
        title: next.enabled ? "Automation ON - Your PinCraft will post automatically" : "Automation OFF - Your settings are saved",
        description: next.enabled ? "Demo only: your ON preference is saved on this device. Pinterest and a remote scheduler are not connected, so no pins will be posted automatically." : "Your OFF preference is saved on this device. This preview does not run a remote posting scheduler.",
      });
    } catch {
      setFeedback({ type: "error", text: "Settings could not be saved in this browser. Your changes are still here; please try again." });
    }
  }

  return (
    <div className="container-x pb-10 pt-7 sm:pb-14 sm:pt-9">
      <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-2 text-[12px] font-medium text-neutral-500">
        <Link href="/" prefetch={false} className="rounded-sm transition-colors hover:text-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">Home</Link>
        <span aria-hidden="true" className="text-neutral-300">/</span>
        <span aria-current="page" className="text-neutral-700">Dashboard</span>
      </nav>

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.15em] text-brand-600">
            <LayoutDashboard aria-hidden="true" size={13} /> Your workspace
          </p>
          <h1 className="text-[32px] font-extrabold leading-[1.12] tracking-[-0.04em] text-neutral-900 sm:text-[40px] lg:text-[43px]">Automation Dashboard</h1>
          <p className="mt-2.5 text-[14px] leading-relaxed text-neutral-500 sm:text-[15.5px]">Plan your content routine, all in one place</p>
        </div>
        <div className="shrink-0 sm:text-right">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[11.5px] font-bold text-neutral-600">
            <FlaskConical aria-hidden="true" size={13} /> Demo workspace
          </span>
          <p className="mt-1.5 text-[11px] text-neutral-500">Sample performance data</p>
        </div>
      </div>

      {/* Performance overview — supplied demo values, not live analytics. */}
      <section aria-label="Performance overview, sample data" className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {DASHBOARD_STATS.map((stat) => {
          const Icon = STAT_ICONS[stat.key];
          const accent = stat.key === "earning";
          return (
            <div key={stat.key} data-testid={`stat-${stat.key}`} className={`min-w-0 rounded-2xl border p-4 shadow-sm sm:p-5 ${accent ? "border-brand-100 bg-brand-50/60" : "border-neutral-200 bg-white"}`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className={`text-[12px] font-semibold sm:text-[13px] ${accent ? "text-brand-800" : "text-neutral-600"}`}>{stat.label}</h2>
                <span aria-hidden="true" className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${accent ? "bg-brand-600 text-white" : "bg-neutral-50 text-neutral-500"}`}>
                  <Icon size={16} strokeWidth={1.8} />
                </span>
              </div>
              <p className={`mt-4 text-[28px] font-extrabold leading-none tracking-[-0.04em] tabular-nums sm:text-[32px] ${accent ? "text-brand-700" : "text-neutral-900"}`}>{stat.value}</p>
              <p className={`mt-2.5 text-[10.5px] leading-relaxed sm:text-[11px] ${accent ? "text-brand-800/75" : "text-neutral-500"}`}>{stat.caption}</p>
            </div>
          );
        })}
      </section>

      {/* Local preferences. Saving does not claim to start a remote scheduler. */}
      <section aria-labelledby="automation-heading" className="mt-6 rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-5 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><SlidersHorizontal size={18} /></span>
            <div>
              <h2 id="automation-heading" className="text-[18px] font-extrabold tracking-tight text-neutral-900">Auto Post Settings</h2>
              <p className="mt-0.5 text-[12px] text-neutral-500">Your content. Your pace.</p>
            </div>
          </div>
          <span data-testid="settings-status" className={`rounded-full px-2.5 py-1.5 text-[11px] font-semibold ${savedSettings && !hasChanges ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
            {settingStatus}
          </span>
        </div>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
          <form aria-label="Automation preferences" onSubmit={handleSave} className="min-w-0">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-neutral-50/60 px-4 py-4">
              <div>
                <p id="auto-post-label" className="text-[14px] font-bold text-neutral-800">Auto Post</p>
                <p id="auto-post-description" className="mt-1 text-[11.5px] leading-relaxed text-neutral-500">Enable your daily posting preference.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span aria-hidden="true" data-testid="auto-post-state" className={`text-[11px] font-extrabold ${settings.enabled ? "text-brand-600" : "text-neutral-500"}`}>{settings.enabled ? "ON" : "OFF"}</span>
                <button
                  type="button"
                  role="switch"
                  aria-labelledby="auto-post-label"
                  aria-describedby="auto-post-description"
                  aria-checked={settings.enabled}
                  disabled={!ready}
                  onClick={() => updateSettings({ enabled: !settings.enabled })}
                  className="flex h-11 w-14 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:opacity-50"
                >
                  <span aria-hidden="true" className={`relative block h-7 w-12 rounded-full transition-colors duration-200 ${settings.enabled ? "bg-brand-600" : "bg-neutral-300"}`}>
                    <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 motion-reduce:transition-none ${settings.enabled ? "translate-x-5" : "translate-x-0"}`} />
                  </span>
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="pins-per-day" className="mb-2 block text-[12px] font-bold text-neutral-700">How many Pins per day?</label>
                <div className="relative">
                  <select id="pins-per-day" disabled={!ready} value={settings.pinsPerDay} onChange={(event) => updateSettings({ pinsPerDay: Number(event.target.value) })} className="h-[50px] w-full appearance-none rounded-xl border border-neutral-200 bg-white pl-4 pr-10 text-[16px] font-semibold text-neutral-800 outline-none transition-shadow focus:border-brand-600 focus:ring-4 focus:ring-brand-50 disabled:opacity-50">
                    {PIN_COUNTS.map((count) => <option key={count} value={count}>{count}</option>)}
                  </select>
                  <ChevronDown aria-hidden="true" size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                </div>
                <p className="mt-1.5 text-[11px] text-neutral-500">Choose your daily pin target.</p>
              </div>
              <div>
                <label htmlFor="post-time" className="mb-2 block text-[12px] font-bold text-neutral-700">Post Time</label>
                <div className="relative">
                  <select id="post-time" disabled={!ready} value={settings.postTime} onChange={(event) => updateSettings({ postTime: event.target.value })} className="h-[50px] w-full appearance-none rounded-xl border border-neutral-200 bg-white pl-4 pr-10 text-[16px] font-semibold text-neutral-800 outline-none transition-shadow focus:border-brand-600 focus:ring-4 focus:ring-brand-50 disabled:opacity-50">
                    {POST_TIMES.map((time) => <option key={time} value={time}>{time}</option>)}
                  </select>
                  <ChevronDown aria-hidden="true" size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                </div>
                <p className="mt-1.5 text-[11px] text-neutral-500">Your preferred posting window.</p>
              </div>
            </div>

            <div className="mt-5 flex flex-col items-start gap-3 xl:flex-row xl:items-center">
              <button type="submit" disabled={!ready} className="btn-primary w-full gap-2 px-5 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600 sm:w-auto">
                <Save aria-hidden="true" size={16} /> Save Automation Settings
              </button>
              <p className="flex items-center gap-1.5 text-[10.5px] leading-relaxed text-neutral-500"><Monitor aria-hidden="true" size={13} className="shrink-0" /> Saves to this device</p>
            </div>

            {feedback && (
              <p role={feedback.type === "error" ? "alert" : "status"} aria-atomic="true" className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12px] font-medium leading-relaxed ${feedback.type === "error" ? "bg-brand-50 text-brand-800" : "bg-emerald-50 text-emerald-800"}`}>
                {feedback.type === "error" ? <CircleAlert aria-hidden="true" size={15} className="mt-0.5 shrink-0" /> : <CheckCircle2 aria-hidden="true" size={15} className="mt-0.5 shrink-0" />}
                {feedback.text}
              </p>
            )}
            {savedSettings?.savedAt && (
              <p className="mt-2.5 text-[10.5px] text-neutral-500">Last saved: {new Date(savedSettings.savedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
            )}
          </form>

          <div data-testid="schedule-preview" className="flex min-w-0 flex-col rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/70 to-white p-5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-800"><Clock3 aria-hidden="true" size={13} /> Schedule preview</div>
            <div className="mt-4 flex items-baseline gap-2.5">
              <span data-testid="preview-pin-count" className="text-[48px] font-extrabold leading-none tracking-[-0.05em] tabular-nums text-neutral-900">{settings.pinsPerDay}</span>
              <span className="text-[13px] font-semibold text-neutral-500">pins / day</span>
              <ArrowUpRight aria-hidden="true" className="ml-auto text-brand-200" size={26} strokeWidth={1.5} />
            </div>
            <div className="mt-5 grid grid-cols-4 gap-1.5" aria-label={`Preferred time: ${settings.postTime}`}>
              {POST_TIMES.map((time) => {
                const TimeIcon = TIME_ICONS[time];
                const active = settings.postTime === time;
                return (
                  <div key={time} className={`flex flex-col items-center gap-2 rounded-xl border px-1 py-3 ${active ? "border-brand-100 bg-white text-brand-600 shadow-sm" : "border-transparent text-neutral-500"}`}>
                    <TimeIcon aria-hidden="true" size={17} strokeWidth={1.7} />
                    <span className="text-[9px] font-bold">{time}</span>
                  </div>
                );
              })}
            </div>
            <p data-testid="preview-description" className="mt-4 text-[12px] leading-relaxed text-neutral-600">{settings.pinsPerDay} pins each day in the <strong className="font-semibold text-neutral-800">{settings.postTime.toLowerCase()}</strong>. Auto post preference is <strong className={settings.enabled ? "font-bold text-brand-700" : "font-bold text-neutral-800"}>{settings.enabled ? "ON" : "OFF"}</strong>.</p>
            <p className="mt-3 border-t border-brand-100/80 pt-3 text-[10.5px] leading-relaxed text-neutral-500">{hasChanges ? "Save settings to keep this plan on your device." : "Your plan is saved on this device."}</p>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-b-2xl border-t border-neutral-100 bg-neutral-50/60 px-5 py-3.5 sm:px-6">
          <Info aria-hidden="true" size={14} className="mt-0.5 shrink-0 text-neutral-400" />
          <p className="text-[11px] leading-relaxed text-neutral-500"><strong className="font-semibold text-neutral-600">Demo mode:</strong> settings are saved in this browser only. Pinterest and a posting scheduler are not connected, so no pins are posted automatically yet.</p>
        </div>
      </section>

      <div className="mt-6"><RecentActivity /></div>
      <div className="mt-6"><ViewsChart /></div>
    </div>
  );
}
