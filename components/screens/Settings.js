"use client";

import { useState } from "react";
import { BackHeader, SectionTitle } from "../ui";
import {
  Globe,
  Link2,
  KeyRound,
  Save,
  LogOut,
  Eye,
  EyeOff,
  ShieldCheck,
  Check,
  ExternalLink,
} from "lucide-react";

export default function Settings({ go, state, actions, toast }) {
  const s = state.settings;
  const [form, setForm] = useState({ ...s });
  const [showKeys, setShowKeys] = useState(false);
  const [errors, setErrors] = useState({});

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  function validate() {
    const e = {};
    const urlOk = (u) => !u || /^https?:\/\/.+\..+/.test(u.trim());
    if (form.blogUrl && !urlOk(form.blogUrl))
      e.blogUrl = "Include https:// — e.g. https://myblog.com";
    if (form.pinterestUrl && !urlOk(form.pinterestUrl))
      e.pinterestUrl = "e.g. https://pinterest.com/yourname";
    if (form.wordpressKey && form.wordpressKey.trim().length < 8)
      e.wordpressKey = "That key looks too short";
    if (form.pinterestKey && form.pinterestKey.trim().length < 8)
      e.pinterestKey = "That key looks too short";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function save() {
    if (!validate()) {
      toast("Please fix the highlighted fields", "error");
      return;
    }
    actions.saveSettings({
      blogUrl: form.blogUrl.trim(),
      pinterestUrl: form.pinterestUrl.trim(),
      wordpressKey: form.wordpressKey.trim(),
      pinterestKey: form.pinterestKey.trim(),
    });
    toast("Settings saved ✅");
  }

  const filled = Object.values(state.settings).filter(Boolean).length;

  return (
    <div className="app-shell pb-10">
      <BackHeader
        title="Settings"
        subtitle={state.user?.email || "Account & API keys"}
        onBack={() => go("dashboard")}
      />

      {/* Account card */}
      <div className="card mb-5 flex items-center gap-3.5 p-4">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-neutral-900 text-[17px] font-extrabold text-white">
          {(state.user?.name || "U").slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-neutral-900">
            {state.user?.name || "Guest"}
          </p>
          <p className="truncate text-[12px] text-neutral-500">
            {state.user?.email || "Not signed in"}
          </p>
        </div>
        <span className="chip bg-pin-50 text-pin-600">{state.plan}</span>
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-2xl bg-neutral-50 px-3.5 py-2.5">
        <ShieldCheck size={16} className="text-emerald-600" />
        <p className="text-[11.5px] font-medium leading-snug text-neutral-500">
          {filled}/4 connections configured · stored on this device only
        </p>
      </div>

      {/* Connections */}
      <section className="space-y-4">
        <div>
          <label className="label">Your Blog Website Link</label>
          <IconInput
            icon={Globe}
            placeholder="https://myblog.com"
            value={form.blogUrl}
            onChange={(v) => set("blogUrl", v)}
            error={errors.blogUrl}
          />
        </div>

        <div>
          <label className="label">Your Pinterest Profile Link</label>
          <IconInput
            icon={Link2}
            placeholder="https://pinterest.com/yourname"
            value={form.pinterestUrl}
            onChange={(v) => set("pinterestUrl", v)}
            error={errors.pinterestUrl}
          />
        </div>
      </section>

      <SectionTitle
        action={
          <button
            onClick={() => setShowKeys((v) => !v)}
            className="chip bg-neutral-100 text-neutral-600"
          >
            {showKeys ? <EyeOff size={12} /> : <Eye size={12} />}{" "}
            {showKeys ? "Hide" : "Show"}
          </button>
        }
      >
        <span className="mt-6 block">API keys</span>
      </SectionTitle>

      <section className="space-y-4">
        <div>
          <label className="label">WordPress API Key</label>
          <IconInput
            icon={KeyRound}
            placeholder="wp_xxxxxxxxxxxxxxxx"
            value={form.wordpressKey}
            onChange={(v) => set("wordpressKey", v)}
            error={errors.wordpressKey}
            secret={!showKeys}
          />
        </div>

        <div>
          <label className="label">Pinterest API Key</label>
          <IconInput
            icon={KeyRound}
            placeholder="pinterest_app_secret"
            value={form.pinterestKey}
            onChange={(v) => set("pinterestKey", v)}
            error={errors.pinterestKey}
            secret={!showKeys}
          />
        </div>
      </section>

      <button onClick={save} className="btn-primary mt-5 w-full">
        <Save size={18} /> Save Settings
      </button>

      {/* Quick links */}
      <section className="mt-6 space-y-2">
        <button
          onClick={() => go("schedule")}
          className="card tap flex w-full items-center justify-between p-3.5 text-left"
        >
          <span className="text-[13.5px] font-semibold text-neutral-800">
            Automation schedule
          </span>
          <span className="text-[12px] font-bold text-pin-600">
            {state.schedules[0]
              ? `${state.schedules[0].pinsPerDay}/day`
              : "Set up"}
          </span>
        </button>

        <button
          onClick={() => go("pinterest")}
          className="card tap flex w-full items-center justify-between p-3.5 text-left"
        >
          <span className="text-[13.5px] font-semibold text-neutral-800">
            Pinterest connection
          </span>
          <span
            className={`text-[12px] font-bold ${
              state.pinterestConnected ? "text-emerald-600" : "text-pin-600"
            }`}
          >
            {state.pinterestConnected ? (
              <span className="inline-flex items-center gap-1">
                <Check size={13} /> Connected
              </span>
            ) : (
              "Connect"
            )}
          </span>
        </button>

        <a
          href="https://help.pinterest.com/en/business/article/pinterest-api"
          target="_blank"
          rel="noreferrer"
          className="card tap flex w-full items-center justify-between p-3.5"
        >
          <span className="text-[13.5px] font-semibold text-neutral-800">
            How to get a Pinterest API key
          </span>
          <ExternalLink size={15} className="text-neutral-400" />
        </a>
      </section>

      <button
        onClick={() => actions.logout()}
        className="btn-outline mt-5 w-full border-pin-200 text-pin-600 hover:border-pin-300"
      >
        <LogOut size={17} /> Log out
      </button>

      <p className="mt-4 text-center text-[11px] text-neutral-400">
        PinCraft v1.0 · Crafted Pins, Daily Traffic
      </p>
    </div>
  );
}

function IconInput({ icon: Icon, error, secret, ...props }) {
  return (
    <div data-error={!!error}>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300">
          <Icon size={17} />
        </span>
        <input
          className={`field pl-11 ${error ? "border-pin-400" : ""}`}
          type={secret ? "password" : "text"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          {...props}
          onChange={(e) => props.onChange(e.target.value)}
        />
      </div>
      {error && (
        <p className="mt-1.5 pl-1 text-[11.5px] font-semibold text-pin-600">
          {error}
        </p>
      )}
    </div>
  );
}
