"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleAlert, Info, Loader2, LockKeyhole, X } from "lucide-react";
import Modal from "../Modal";
import { BrandMark } from "../Brand";
import { useAuth } from "../providers/AppProvider";
import GoogleMark from "./GoogleMark";

function GoogleSignIn({ config, onError, setBusy }) {
  const { signIn } = useAuth();
  const [working, setWorking] = useState(false);
  async function connect() {
    if (working) return;
    setWorking(true); setBusy(true); onError("");
    try {
      const { firebaseGoogleSignIn } = await import("@/lib/firebase/client");
      const idToken = await firebaseGoogleSignIn(config.firebase);
      await signIn(idToken, config.nonce);
    } catch (issue) {
      onError(issue.code === "auth/popup-closed-by-user" ? "Google sign-in was cancelled. You can try again." : issue.code === "auth/popup-blocked" ? "Allow popups for this website, then try Google sign-in again." : issue.code === "auth/unauthorized-domain" ? "This website domain must be authorized in Firebase Authentication." : "Firebase Google sign-in could not be completed. Reload the sign-in settings and try again.");
    } finally { setWorking(false); setBusy(false); }
  }
  return <button type="button" onClick={connect} disabled={working} className="inline-flex min-h-[52px] w-full items-center justify-center gap-3 rounded-xl border border-neutral-300 bg-white px-4 text-[14px] font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"><GoogleMark />{working ? "Connecting securely…" : "Continue with Google"}</button>;
}

export default function LoginDialog({ onClose }) {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [retry, setRetry] = useState(0);
  const setupRef = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    setConfig(null); setError("");
    fetch("/api/auth/config", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("Google sign-in settings could not be loaded."); return response.json(); })
      .then(setConfig).catch((issue) => { if (issue.name !== "AbortError") setError(issue.message); });
    return () => controller.abort();
  }, [retry]);

  return (
    <Modal titleId="google-login-title" onClose={onClose}>
      <div className="relative p-6 sm:p-8">
        <button type="button" onClick={onClose} aria-label="Close login popup" autoFocus className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-xl text-neutral-500 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"><X aria-hidden="true" size={19} /></button>
        <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50"><BrandMark size={35} /></div>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-brand-700">Your creative workspace</p>
        <h2 id="google-login-title" className="mt-2 text-[28px] font-extrabold leading-tight tracking-[-0.035em]">Welcome to PinCraft</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">A little inspiration. A lot less busywork.<br />Sign in with your Google account.</p>
        <div className="mt-6">
          {config?.configured ? <GoogleSignIn config={config} onError={setError} setBusy={setBusy} /> : <button type="button" disabled={!config} onClick={() => { setAttempted(true); setupRef.current?.focus(); }} className="inline-flex min-h-[52px] w-full items-center justify-center gap-3 rounded-xl border border-neutral-300 bg-white px-4 text-[14px] font-bold text-neutral-700 transition-colors hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 disabled:opacity-60"><GoogleMark />{config ? "Continue with Google" : "Checking Google Login…"}</button>}
        </div>
        {config && !config.configured && <div ref={setupRef} tabIndex={-1} data-testid="google-setup-notice" className="mt-4 rounded-xl border border-brand-100 bg-brand-50/50 p-3.5 outline-none focus:ring-2 focus:ring-brand-600"><p className="flex items-center gap-1.5 text-[12px] font-bold text-brand-800"><Info aria-hidden="true" size={14} /> Google Login needs setup</p><p role={attempted ? "status" : undefined} className="mt-1.5 text-[11.5px] leading-relaxed text-neutral-600">Firebase Authentication is not configured for this site yet. No Google account is simulated. Your device-only guest library is still available.</p><Link href="/login#setup" prefetch={false} onClick={onClose} className="mt-2 inline-flex min-h-11 items-center text-[11.5px] font-bold text-brand-700 underline underline-offset-2">View setup requirements</Link></div>}
        {busy && <p role="status" className="mt-4 flex items-center justify-center gap-2 text-[12px] font-semibold text-neutral-600"><Loader2 aria-hidden="true" className="animate-spin" size={15} /> Verifying your Google account…</p>}
        {error && <div role="alert" className="mt-4 rounded-xl bg-brand-50 p-3 text-[12px] text-brand-800"><p className="flex items-start gap-2"><CircleAlert aria-hidden="true" size={15} className="mt-0.5 shrink-0" />{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-2 inline-flex min-h-11 items-center font-bold underline">Try again</button></div>}
        <p className="mt-5 flex items-start gap-2 text-[10.5px] leading-relaxed text-neutral-500"><LockKeyhole aria-hidden="true" size={13} className="mt-0.5 shrink-0" />Firebase Authentication verifies your Google account. PinCraft stores only your Firebase user ID and display name in its session. Passwords are never entered here.</p>
        <div className="mt-5 border-t border-neutral-100 pt-4 text-center"><Link href="/library" prefetch={false} onClick={onClose} className="inline-flex min-h-11 items-center text-[12px] font-bold text-neutral-600 hover:text-brand-700">Continue to the guest library</Link></div>
      </div>
    </Modal>
  );
}
