"use client";

import { useState } from "react";
import { Logo, BackHeader } from "../ui";
import { Eye, EyeOff, AlertCircle, ArrowRight } from "lucide-react";

export default function Login({ go, onLogin, knownEmail }) {
  const [email, setEmail] = useState(knownEmail || "");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  function submit(e) {
    e.preventDefault();
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError("Enter the email you signed up with");
      return;
    }
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setError("");
    onLogin({ email: email.trim() });
  }

  return (
    <div className="app-shell pb-10">
      <BackHeader title="Welcome back" onBack={() => go("landing")} />

      <div className="mb-7 mt-2 flex flex-col items-center text-center">
        <Logo size="lg" onClick={() => go("landing")} />
        <p className="mt-3 text-[13.5px] text-neutral-500">
          Log in to keep your pins flowing daily
        </p>
      </div>

      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label className="label">Email</label>
          <input
            className="field"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
          />
        </div>

        <div>
          <label className="label">Password</label>
          <div className="relative">
            <input
              className="field pr-14"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
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
        </div>

        {error && (
          <p className="flex items-center gap-1.5 rounded-xl bg-pin-50 px-3 py-2.5 text-[12.5px] font-semibold text-pin-700">
            <AlertCircle size={15} /> {error}
          </p>
        )}

        <button type="submit" className="btn-primary w-full">
          Log In <ArrowRight size={18} />
        </button>

        <p className="text-center text-[13px] text-neutral-500">
          New to PinCraft?{" "}
          <button
            type="button"
            onClick={() => go("signup")}
            className="font-bold text-pin-600"
          >
            Create free account
          </button>
        </p>
      </form>
    </div>
  );
}
