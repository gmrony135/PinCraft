"use client";

import { useState } from "react";
import { BackHeader, Spinner, AppIcon } from "../ui";
import { Check, Unlink, ShieldCheck, ExternalLink } from "lucide-react";

export default function Pinterest({ go, state, actions, toast }) {
  const [step, setStep] = useState(state.pinterestConnected ? "done" : "idle");
  const [profile, setProfile] = useState(state.settings.pinterestUrl || "");

  async function connect() {
    if (!/^https?:\/\/.+\..+/.test(profile.trim())) {
      toast("Add your Pinterest profile link first", "error");
      return;
    }
    setStep("loading");
    await new Promise((r) => setTimeout(r, 1400));
    actions.connectPinterest(profile.trim());
    setStep("done");
    toast("Pinterest connected 🎉");
  }

  return (
    <div className="app-shell pb-10">
      <BackHeader
        title="Pinterest"
        subtitle="Auto-posting destination"
        onBack={() => go("dashboard")}
      />

      <div className="card mb-5 flex flex-col items-center p-6 text-center">
        <AppIcon size={64} radius={20} />
        <h2 className="mt-3.5 text-[18px] font-extrabold text-neutral-900">
          {state.pinterestConnected
            ? "Pinterest is connected"
            : "Connect your Pinterest"}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">
          {state.pinterestConnected
            ? "PinCraft can now publish pins to your boards on schedule."
            : "Paste your profile link so we know where to publish your pins."}
        </p>

        {state.pinterestConnected && (
          <div className="mt-4 w-full rounded-2xl bg-emerald-50 p-3 text-left">
            <p className="flex items-center gap-1.5 text-[12px] font-bold text-emerald-800">
              <Check size={14} /> Connected profile
            </p>
            <p className="mt-1 truncate text-[12px] text-emerald-700">
              {state.settings.pinterestUrl}
            </p>
          </div>
        )}
      </div>

      {!state.pinterestConnected ? (
        <>
          <label className="label">Pinterest profile link</label>
          <input
            className="field"
            placeholder="https://pinterest.com/yourname"
            autoCapitalize="none"
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
          />

          <button
            onClick={connect}
            disabled={step === "loading"}
            className="btn-primary mt-4 w-full"
          >
            {step === "loading" ? (
              <>
                <Spinner /> Connecting…
              </>
            ) : (
              "Connect Pinterest Account"
            )}
          </button>

          <div className="mt-5 space-y-2.5">
            {[
              "We never post without your schedule",
              "You can disconnect anytime",
              "Your keys stay on your device",
            ].map((t) => (
              <div
                key={t}
                className="flex items-center gap-2.5 rounded-2xl bg-neutral-50 px-3.5 py-2.5"
              >
                <ShieldCheck size={15} className="shrink-0 text-emerald-600" />
                <p className="text-[11.5px] font-medium text-neutral-600">{t}</p>
              </div>
            ))}
          </div>

          <a
            href="https://www.pinterest.com/business/create/"
            target="_blank"
            rel="noreferrer"
            className="btn-outline mt-4 w-full"
          >
            Create a Pinterest business account <ExternalLink size={15} />
          </a>
        </>
      ) : (
        <button
          onClick={() => {
            actions.disconnectPinterest();
            setStep("idle");
            toast("Pinterest disconnected", "info");
          }}
          className="btn-outline w-full border-pin-200 text-pin-600"
        >
          <Unlink size={17} /> Disconnect account
        </button>
      )}
    </div>
  );
}
