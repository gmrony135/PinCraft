"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { CheckCircle2, CircleAlert, Sparkles, X } from "lucide-react";

const LoginDialog = dynamic(() => import("../auth/LoginDialog"), { ssr: false });
const DemoSuccessDialog = dynamic(() => import("../DemoSuccessDialog"), { ssr: false });
const AuthContext = createContext(null);
const FeedbackContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
export const useFeedback = () => useContext(FeedbackContext);

function Notice({ notice, close }) {
  if (!notice) return null;
  const Icon = notice.tone === "error" ? CircleAlert : notice.badge === "Demo preview" ? Sparkles : CheckCircle2;
  return (
    <div className="pointer-events-none fixed inset-x-3 top-20 z-[90] sm:left-auto sm:right-6 sm:w-[400px]" data-testid="notification">
      <div role="status" aria-live="polite" aria-atomic="true" className="relative rounded-2xl border border-neutral-200 border-l-4 border-l-brand-600 bg-white p-4 pr-12 shadow-xl shadow-neutral-900/10">
        <div className="flex items-start gap-2.5">
          <Icon aria-hidden="true" size={19} className={`mt-0.5 shrink-0 ${notice.tone === "error" ? "text-brand-700" : "text-brand-600"}`} />
          <div>
            {notice.badge && <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-brand-700">{notice.badge}</p>}
            <p className="text-[13px] font-extrabold leading-relaxed text-neutral-900 [overflow-wrap:anywhere]">{notice.title}</p>
            {notice.description && <p className="mt-1.5 text-[11.5px] leading-relaxed text-neutral-600">{notice.description}</p>}
          </div>
        </div>
        <button type="button" onClick={close} aria-label="Dismiss notification" className="pointer-events-auto absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-xl text-neutral-500 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"><X aria-hidden="true" size={16} /></button>
      </div>
    </div>
  );
}

export default function AppProvider({ children }) {
  const pathname = usePathname();
  const [notice, setNotice] = useState(null);
  const [success, setSuccess] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const timer = useRef(null);
  const channel = useRef(null);
  const closeNotice = useCallback(() => { clearTimeout(timer.current); setNotice(null); }, []);
  const showNotice = useCallback((next) => {
    clearTimeout(timer.current);
    setNotice(next);
    timer.current = setTimeout(() => setNotice(null), next.duration || 8000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
      if (response.ok) { const data = await response.json(); setUser(data.user || null); }
    } catch { /* Keep the guest tools usable if the session endpoint is offline. */ }
    finally { setAuthLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("pincraft-auth");
      channel.current.onmessage = () => refresh();
    }
    return () => { clearTimeout(timer.current); channel.current?.close(); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  useEffect(() => { if (notice?.scope && notice.scope !== pathname) closeNotice(); }, [pathname, notice, closeNotice]);

  const closeSuccess = useCallback(() => setSuccess(null), []);
  const showSuccess = useCallback((message) => { closeNotice(); setSuccess(message); }, [closeNotice]);
  const openLogin = useCallback(() => { closeNotice(); setSuccess(null); setLoginOpen(true); }, [closeNotice]);
  const closeLogin = useCallback(() => setLoginOpen(false), []);
  const signIn = useCallback(async (credential) => {
    const response = await fetch("/api/auth/google", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential }) });
    const result = await response.json();
    if (!response.ok || !result.user?.id) throw new Error(result.error || "Google sign-in could not be completed.");
    setUser(result.user);
    setLoginOpen(false);
    channel.current?.postMessage("refresh");
    showNotice({ title: `Welcome, ${result.user.name}!`, description: "You are signed in. Full Auto results use your private Cloud Library when server setup is ready. Manual tool saves stay on this device." });
  }, [showNotice]);
  const signOut = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error("Sign out failed.");
      setUser(null);
      channel.current?.postMessage("refresh");
      showNotice({ title: "You are signed out", description: "Your device-saved pins and articles have not been deleted." });
      return true;
    } catch { showNotice({ tone: "error", title: "Could not sign out", description: "Please check your connection and try again." }); return false; }
  }, [showNotice]);

  const auth = useMemo(() => ({ user, authLoading, openLogin, closeLogin, signIn, signOut, refresh }), [user, authLoading, openLogin, closeLogin, signIn, signOut, refresh]);
  const feedback = useMemo(() => ({ showNotice, closeNotice, showSuccess }), [showNotice, closeNotice, showSuccess]);
  return (
    <FeedbackContext.Provider value={feedback}>
      <AuthContext.Provider value={auth}>
        {children}
        <Notice notice={notice} close={closeNotice} />
        {loginOpen && <LoginDialog onClose={closeLogin} />}
        {success && <DemoSuccessDialog {...success} onClose={closeSuccess} />}
      </AuthContext.Provider>
    </FeedbackContext.Provider>
  );
}
