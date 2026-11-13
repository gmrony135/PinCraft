"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleAlert, Info, Loader2, LockKeyhole, MailCheck, X } from "lucide-react";
import Modal from "../Modal";
import { BrandMark } from "../Brand";
import { useAuth } from "../providers/AppProvider";
import GoogleMark from "./GoogleMark";

const fieldClass = "mt-1.5 min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-[16px] text-neutral-900 outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-50 disabled:bg-neutral-50 sm:text-[14px]";
export default function LoginDialog({ onClose }) {
  const { signIn } = useAuth();
  const [config, setConfig] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [verification, setVerification] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [retry, setRetry] = useState(0);
  const setupRef = useRef(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setConfig(null); setError("");
    fetch("/api/auth/config", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("Sign-in settings could not be loaded."); return response.json(); })
      .then(setConfig).catch(issue => { if (issue.name !== "AbortError") setError(issue.message); });
    return () => controller.abort();
  }, [retry]);
  function switchMode(next) { setMode(next); setError(""); setMessage(""); setPassword(""); setConfirm(""); setVerification(false); }
  async function accountAction(action) {
    if (busy) return;
    if (!config?.configured) { setAttempted(true); setupRef.current?.focus(); return; }
    if (action === "signup" && (password.length < 8 || password !== confirm)) { setError(password.length < 8 ? "Use at least 8 characters for your password." : "The passwords do not match."); return; }
    if (action === "resend" && Date.now() < resendAt) { setError("Wait one minute before requesting another verification email."); return; }
    setBusy(action); setError(""); setMessage("");
    try {
      const sdk = await import("@/lib/firebase/client");
      if (action === "google") {
        const idToken = await sdk.firebaseGoogleSignIn(config.firebase);
        if (active.current) await signIn(idToken, config.nonce);
      } else {
        const result = await sdk.firebaseEmailAction(config.firebase, { action, email: email.trim(), password, name });
        if (!active.current) return;
        if (result.resetRequested) { setMessage("If an eligible account exists, Firebase will send password reset instructions. Check your inbox and spam folder."); setPassword(""); }
        else if (result.verificationRequired) {
          setVerification(true); setMode("login"); setConfirm("");
          if (result.verificationSent) setResendAt(Date.now() + 60000);
          setMessage(result.verificationSent ? "Verification email requested. Open the link in your inbox, then sign in below. No PinCraft session has been created yet." : "Please verify your email before signing in. Open the original verification message, or request another below.");
          if (action === "signup") setPassword("");
        } else {
          await signIn(result.idToken, config.nonce);
          setPassword(""); setConfirm("");
        }
      }
    } catch (issue) {
      if (!active.current) return;
      // Password-reset responses do not disclose whether an address exists.
      if (action === "reset" && ["auth/user-not-found", "auth/invalid-credential"].includes(issue.code)) setMessage("If an eligible account exists, Firebase will send password reset instructions. Check your inbox and spam folder.");
      else { const { firebaseAuthMessage } = await import("@/lib/firebase/client"); setError(issue.appAuthError ? issue.message : firebaseAuthMessage(issue)); }
    } finally { if (active.current) setBusy(""); }
  }
  const ready = Boolean(config?.configured);
  return <Modal titleId="account-login-title" onClose={onClose}>
    <div className="relative p-6 sm:p-8">
      <button type="button" onClick={onClose} aria-label="Close login popup" autoFocus className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-xl text-neutral-500 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"><X aria-hidden="true" size={19} /></button>
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50"><BrandMark size={30} /></div>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-brand-700">Your creative workspace</p>
      <h2 id="account-login-title" className="mt-2 text-[26px] font-extrabold leading-tight tracking-[-0.035em]">{mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Welcome to PinCraft"}</h2>
      <p className="mt-2 text-[12px] leading-relaxed text-neutral-500">Email and password, or your Google account. Verified by Firebase.</p>
      {mode !== "reset" && <div role="group" aria-label="Account action" className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1">{[["login", "Sign in"], ["signup", "Create account"]].map(([id, label]) => <button key={id} type="button" aria-pressed={mode === id} disabled={Boolean(busy)} onClick={() => switchMode(id)} className={`min-h-11 rounded-lg text-[12px] font-bold ${mode === id ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}>{label}</button>)}</div>}
      <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); accountAction(mode); }}>
        {mode === "signup" && <div><label htmlFor="account-name" className="text-[12px] font-bold text-neutral-700">Display name</label><input id="account-name" name="name" autoComplete="nickname" maxLength={80} value={name} onChange={e => setName(e.target.value)} disabled={Boolean(busy)} className={fieldClass} placeholder="Your name" /></div>}
        <div><label htmlFor="account-email" className="text-[12px] font-bold text-neutral-700">Email address</label><input id="account-email" name="email" type="email" required autoComplete="email" maxLength={254} value={email} onChange={e => { setEmail(e.target.value); setVerification(false); }} disabled={Boolean(busy)} className={fieldClass} placeholder="you@example.com" /></div>
        {mode !== "reset" && <div><label htmlFor="account-password" className="text-[12px] font-bold text-neutral-700">Password</label><input id="account-password" name="password" type="password" required minLength={mode === "signup" ? 8 : 1} maxLength={128} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} disabled={Boolean(busy)} className={fieldClass} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} /></div>}
        {mode === "signup" && <div><label htmlFor="account-confirm" className="text-[12px] font-bold text-neutral-700">Confirm password</label><input id="account-confirm" type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} disabled={Boolean(busy)} className={fieldClass} /></div>}
        {mode === "login" && <button type="button" disabled={Boolean(busy)} onClick={() => switchMode("reset")} className="inline-flex min-h-11 items-center text-[12px] font-bold text-brand-700 underline underline-offset-2">Forgot password?</button>}
        <button type="submit" disabled={Boolean(busy) || !ready} className="btn-primary !mt-4 w-full !text-[13px]">{busy && busy !== "google" ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" />Please wait…</> : mode === "signup" ? "Create account with email" : mode === "reset" ? "Send reset email" : "Sign in with email"}</button>
        {verification && <button type="button" onClick={() => accountAction("resend")} disabled={Boolean(busy) || !ready || !password} className="inline-flex min-h-11 w-full items-center justify-center text-[11px] font-bold text-brand-700 underline underline-offset-2">Resend verification (enter your password above)</button>}
      </form>
      {mode === "reset" ? <button type="button" disabled={Boolean(busy)} onClick={() => switchMode("login")} className="mt-2 inline-flex min-h-11 items-center text-[12px] font-bold text-neutral-600">Back to sign in</button> : <>
        <div className="my-3 flex items-center gap-3 text-[11px] text-neutral-400"><span className="h-px flex-1 bg-neutral-200" />or<span className="h-px flex-1 bg-neutral-200" /></div>
        <button type="button" onClick={() => accountAction("google")} disabled={Boolean(busy) || !config} className="inline-flex min-h-[48px] w-full items-center justify-center gap-3 rounded-xl border border-neutral-300 bg-white px-4 text-[13px] font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"><GoogleMark />{busy === "google" ? "Connecting securely…" : config ? "Continue with Google" : "Checking sign-in settings…"}</button>
      </>}
      {config && !ready && <div ref={setupRef} tabIndex={-1} data-testid="google-setup-notice" className="mt-4 rounded-xl border border-brand-100 bg-brand-50/50 p-3.5 outline-none focus:ring-2 focus:ring-brand-600"><p className="flex items-center gap-1.5 text-[12px] font-bold text-brand-800"><Info aria-hidden="true" size={14} /> Firebase sign-in needs setup</p><p role={attempted ? 'status' : undefined} className="mt-1.5 text-[11.5px] leading-relaxed text-neutral-600">The site owner must finish Firebase web and Admin settings, enable Email/Password and Google, and authorize this domain. No account or session is simulated. Guest tools still work.</p><Link href="/login#setup" prefetch={false} onClick={onClose} className="mt-2 inline-flex min-h-11 items-center text-[11.5px] font-bold text-brand-700 underline underline-offset-2">View setup requirements</Link></div>}
      {message && <p role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-[12px] leading-relaxed text-emerald-900"><MailCheck size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{message}</p>}
      {error && <div role="alert" className="mt-4 rounded-xl bg-brand-50 p-3 text-[12px] text-brand-800"><p className="flex items-start gap-2 leading-relaxed"><CircleAlert aria-hidden="true" size={15} className="mt-0.5 shrink-0" />{error}</p><button type="button" disabled={Boolean(busy)} onClick={() => setRetry(value => value + 1)} className="mt-2 inline-flex min-h-11 items-center font-bold underline">Reload sign-in settings</button></div>}
      <p className="mt-4 flex items-start gap-2 text-[10.5px] leading-relaxed text-neutral-500"><LockKeyhole aria-hidden="true" size={13} className="mt-0.5 shrink-0" />Passwords are sent only to Firebase Authentication, not PinCraft’s server or browser storage. Verify your email before signing in. PinCraft sessions store only your user ID and display name.</p>
      <div className="mt-4 border-t border-neutral-100 pt-3 text-center"><Link href="/library" prefetch={false} onClick={onClose} className="inline-flex min-h-11 items-center text-[12px] font-bold text-neutral-600 hover:text-brand-700">Continue to the guest library</Link></div>
    </div>
  </Modal>;
}
