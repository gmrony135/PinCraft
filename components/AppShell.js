"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useStore, resetAll } from "@/lib/store";
import { Toast } from "./ui";
import Landing from "./screens/Landing";
import Login from "./screens/Login";
import Signup from "./screens/Signup";
import Dashboard from "./screens/Dashboard";
import Content from "./screens/Content";
import Schedule from "./screens/Schedule";
import Settings from "./screens/Settings";
import Pinterest from "./screens/Pinterest";
import { Home, Sparkles, CalendarCheck2, Settings as Cog } from "lucide-react";

const NAV = [
  { key: "dashboard", label: "Home", icon: Home },
  { key: "content", label: "Create", icon: Sparkles },
  { key: "schedule", label: "Schedule", icon: CalendarCheck2 },
  { key: "settings", label: "Settings", icon: Cog },
];

const APP_SCREENS = ["dashboard", "content", "schedule", "settings", "pinterest"];

export default function AppShell() {
  const { state, update, hydrated } = useStore();
  const [route, setRoute] = useState("landing");
  const [toastState, setToastState] = useState({ show: false, message: "", tone: "success" });
  const timer = useRef(null);

  const toast = useCallback((message, tone = "success") => {
    setToastState({ show: true, message, tone });
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => setToastState((t) => ({ ...t, show: false })),
      2400
    );
  }, []);

  const go = useCallback((next) => {
    setRoute(next);
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }, []);

  // Restore session: signed-in users land on the dashboard
  useEffect(() => {
    if (!hydrated) return;
    if (state.user && (route === "landing" || route === "login")) {
      setRoute("dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Browser back button support
  useEffect(() => {
    const onPop = () => {
      setRoute((r) => (r === "landing" ? r : "dashboard"));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const actions = {
    signup: ({ name, email, hasPinterest, category }) => {
      update({
        user: { name, email, hasPinterest },
        selectedCategory: category,
        onboarded: true,
      });
      go("dashboard");
      toast(`Welcome to PinCraft, ${name.split(" ")[0]} 🎉`);
    },
    login: ({ email }) => {
      const name =
        state.user?.name ||
        email
          .split("@")[0]
          .replace(/[._-]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
      update({ user: { name, email, hasPinterest: state.user?.hasPinterest ?? false } });
      go("dashboard");
      toast(`Welcome back, ${name.split(" ")[0]} 👋`);
    },
    logout: () => {
      resetAll();
      setRoute("landing");
      toast("Logged out", "info");
    },
    selectCategory: (id) => {
      update({ selectedCategory: id });
      toast("Category updated");
    },
    addPin: (pin) => {
      update((s) => ({ ...s, pins: [pin, ...s.pins].slice(0, 50) }));
    },
    postPinterest: (id) => {
      update((s) => ({ ...s, postedPins: [...new Set([...s.postedPins, id])] }));
    },
    postBlog: (id) => {
      update((s) => ({ ...s, postedBlogs: [...new Set([...s.postedBlogs, id])] }));
    },
    saveSchedule: (schedule) => {
      update((s) => ({
        ...s,
        schedules: [{ ...schedule, id: `sch_${Date.now()}`, createdAt: new Date().toISOString() }],
      }));
    },
    clearSchedule: () => update((s) => ({ ...s, schedules: [] })),
    saveSettings: (settings) => update((s) => ({ ...s, settings })),
    connectPinterest: (url) => {
      update((s) => ({
        ...s,
        pinterestConnected: true,
        settings: { ...s.settings, pinterestUrl: s.settings.pinterestUrl || url },
      }));
    },
    disconnectPinterest: () => update({ pinterestConnected: false }),
  };

  const isApp = APP_SCREENS.includes(route);

  const screens = {
    landing: <Landing go={go} state={state} />,
    login: <Login go={go} onLogin={actions.login} knownEmail={state.user?.email} />,
    signup: <Signup go={go} onSubmit={actions.signup} />,
    dashboard: (
      <Dashboard go={go} state={state} actions={actions} toast={toast} />
    ),
    content: <Content go={go} state={state} actions={actions} toast={toast} />,
    schedule: <Schedule go={go} state={state} actions={actions} toast={toast} />,
    settings: <Settings go={go} state={state} actions={actions} toast={toast} />,
    pinterest: <Pinterest go={go} state={state} actions={actions} toast={toast} />,
  };

  return (
    <main className="relative min-h-[100dvh] bg-white">
      <Toast {...toastState} />

      {isApp && !state.user ? (
        // Guard: app screens need an account
        <div className="app-shell flex min-h-[100dvh] flex-col items-center justify-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-3xl bg-pin-50 text-2xl">
            🔒
          </span>
          <h2 className="mt-4 text-[19px] font-extrabold">Sign in to continue</h2>
          <p className="mt-1.5 text-[13px] text-neutral-500">
            Create a free account to see your dashboard.
          </p>
          <button onClick={() => go("signup")} className="btn-primary mt-5 w-full">
            Create Free Account
          </button>
          <button onClick={() => go("login")} className="btn-outline mt-2.5 w-full">
            Login
          </button>
        </div>
      ) : (
        <>
          {screens[route] || screens.landing}
          {isApp && state.user && (
            <BottomNavWrapper route={route} go={go} />
          )}
        </>
      )}

      {/* subtle app frame edges (desktop) */}
      <div className="pointer-events-none fixed inset-0 hidden lg:block">
        <div className="mx-auto h-full max-w-[430px] border-x border-neutral-100" />
      </div>
    </main>
  );
}

function BottomNavWrapper({ route, go }) {
  const active = route === "pinterest" ? "dashboard" : route;
  return (
    <div className="app-shell">
      <nav className="sticky bottom-0 z-30 -mx-5 mt-8 border-t border-neutral-100 bg-white/95 px-2 pb-safe pt-1.5 backdrop-blur-xl">
        <div className="flex items-end justify-around">
          {NAV.map((it) => {
            const Icon = it.icon;
            const isActive = active === it.key;
            return (
              <button
                key={it.key}
                onClick={() => go(it.key)}
                aria-current={isActive ? "page" : undefined}
                className={`tap flex min-w-[64px] flex-col items-center gap-1 rounded-2xl px-2 py-1.5 ${
                  isActive ? "text-pin-600" : "text-neutral-400"
                }`}
              >
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10.5px] font-semibold tracking-tight">
                  {it.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
