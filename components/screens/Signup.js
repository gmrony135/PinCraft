"use client";

import { useState } from "react";
import { Logo, BackHeader } from "../ui";
import { CATEGORIES, resolveCategory } from "@/lib/store";
import { Eye, EyeOff, Check, AlertCircle, ArrowRight } from "lucide-react";

export default function Signup({ go, onSubmit }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    hasPinterest: "",
    category: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState({});
  const [agree, setAgree] = useState(true);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = "Please enter your full name";
    else if (form.name.trim().length < 2) e.name = "Name is too short";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()))
      e.email = "Enter a valid email address";
    if (!form.password) e.password = "Password is required";
    else if (form.password.length < 6) e.password = "Use at least 6 characters";
    if (!form.hasPinterest) e.hasPinterest = "Please choose Yes or No";
    if (!form.category) e.category = "Pick a category to start";
    if (!agree) e.agree = "Please accept the terms to continue";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit(ev) {
    ev.preventDefault();
    if (!validate()) {
      const first = document.querySelector("[data-error='true']");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    onSubmit({
      name: form.name.trim(),
      email: form.email.trim(),
      hasPinterest: form.hasPinterest === "yes",
      category: resolveCategory(form.category) || form.category,
    });
  }

  return (
    <div className="app-shell pb-10">
      <BackHeader
        title="Create account"
        subtitle="Free plan · no credit card"
        onBack={() => go("landing")}
      />

      <div className="mb-6 flex justify-center">
        <Logo size="lg" onClick={() => go("landing")} />
      </div>

      <form onSubmit={submit} noValidate className="space-y-4">
        <Field
          label="Full Name"
          error={errors.name}
          hint="As you'd like it shown on your dashboard"
        >
          <input
            className="field"
            placeholder="e.g. Rony Ahmed"
            autoComplete="name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>

        <Field label="Email" error={errors.email}>
          <input
            className="field"
            type="email"
            inputMode="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </Field>

        <Field label="Password" error={errors.password} hint="Minimum 6 characters">
          <div className="relative">
            <input
              className="field pr-14"
              type={showPw ? "text" : "password"}
              placeholder="Create a password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-neutral-400 active:bg-neutral-100"
            >
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </Field>

        {/* Pinterest yes/no */}
        <div>
          <label className="label">Do you have a Pinterest account?</label>
          <div className="grid grid-cols-2 gap-2.5" data-error={!!errors.hasPinterest}>
            {[
              { v: "yes", t: "Yes", s: "I have one" },
              { v: "no", t: "No", s: "Not yet" },
            ].map((o) => {
              const active = form.hasPinterest === o.v;
              return (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => set("hasPinterest", o.v)}
                  className={`tap rounded-2xl border-2 p-3.5 text-left transition ${
                    active
                      ? "border-pin-600 bg-pin-50"
                      : "border-neutral-200 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[15px] font-bold ${
                        active ? "text-pin-700" : "text-neutral-800"
                      }`}
                    >
                      {o.t}
                    </span>
                    <span
                      className={`grid h-5 w-5 place-items-center rounded-full border-2 ${
                        active
                          ? "border-pin-600 bg-pin-600 text-white"
                          : "border-neutral-300"
                      }`}
                    >
                      {active && <Check size={12} strokeWidth={3} />}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-neutral-500">{o.s}</p>
                </button>
              );
            })}
          </div>
          {errors.hasPinterest && <ErrorText>{errors.hasPinterest}</ErrorText>}
          {form.hasPinterest === "no" && (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11.5px] leading-snug text-amber-700">
              No problem — we&apos;ll help you create a Pinterest business account
              after signup.
            </p>
          )}
        </div>

        {/* Category dropdown */}
        <Field label="Which category do you want?" error={errors.category}>
          <div className="relative">
            <select
              className="field appearance-none pr-12"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
            >
              <option value="">Select a category…</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji}  {c.name}
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </Field>

        {/* Terms */}
        <div data-error={!!errors.agree}>
          <button
            type="button"
            onClick={() => {
              setAgree((a) => !a);
              setErrors((e) => ({ ...e, agree: undefined }));
            }}
            className="flex w-full items-start gap-2.5 text-left"
          >
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 ${
                agree
                  ? "border-pin-600 bg-pin-600 text-white"
                  : "border-neutral-300 bg-white"
              }`}
            >
              {agree && <Check size={13} strokeWidth={3} />}
            </span>
            <span className="text-[12.5px] leading-snug text-neutral-500">
              I agree to the Terms and Privacy Policy. PinCraft may post on my
              behalf using the schedule I set.
            </span>
          </button>
          {errors.agree && <ErrorText>{errors.agree}</ErrorText>}
        </div>

        <button type="submit" className="btn-primary w-full">
          Create Free Account <ArrowRight size={18} />
        </button>

        <p className="pt-1 text-center text-[13px] text-neutral-500">
          Already have an account?{" "}
          <button
            type="button"
            onClick={() => go("login")}
            className="font-bold text-pin-600"
          >
            Login
          </button>
        </p>
      </form>
    </div>
  );
}

function Field({ label, error, hint, children }) {
  return (
    <div data-error={!!error}>
      <label className="label">{label}</label>
      {children}
      {error ? (
        <ErrorText>{error}</ErrorText>
      ) : hint ? (
        <p className="mt-1.5 pl-1 text-[11.5px] text-neutral-400">{hint}</p>
      ) : null}
    </div>
  );
}

function ErrorText({ children }) {
  return (
    <p className="mt-1.5 flex items-center gap-1.5 pl-1 text-[11.5px] font-semibold text-pin-600">
      <AlertCircle size={13} /> {children}
    </p>
  );
}
