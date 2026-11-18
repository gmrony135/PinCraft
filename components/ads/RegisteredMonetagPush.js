'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/AppProvider';

export const PUSH_REMINDER_MS = 5 * 60 * 60 * 1000;
const SRC = 'https://5gvci.com/act/files/tag.min.js?z=12290352';
const ZONE = '12290352';
const supportedRoute = path => ['/', '/about'].includes(path);
function permission() {
  try { return 'Notification' in window ? Notification.permission : 'unsupported'; } catch { return 'unsupported'; }
}
function read(key) {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v && ['allow', 'later'].includes(v.choice) && Number.isFinite(v.nextAskAt) ? v : null; } catch { return null; }
}

export default function RegisteredMonetagPush() {
  const { user, authLoading, authUnavailable } = useAuth();
  const pathname = usePathname();
  const key = user?.id ? `pincraft.registered-monetag-push.v1:${user.id}` : null;
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!key) { setState(null); return; }
    const sync = () => setState({ key, choice: read(key), permission: permission(), now: Date.now() });
    sync();
    const timer = setInterval(sync, 30000);
    window.addEventListener('storage', sync);
    document.addEventListener('visibilitychange', sync);
    return () => { clearInterval(timer); window.removeEventListener('storage', sync); document.removeEventListener('visibilitychange', sync); };
  }, [key]);
  const eligible = Boolean(user && !authLoading && !authUnavailable && supportedRoute(pathname) && state?.key === key);
  const canLoad = eligible && state.permission === 'granted' && state.choice?.choice === 'allow';
  useEffect(() => {
    if (!canLoad || document.querySelector(`script[data-monetag-zone="${ZONE}"]`)) return;
    const script = document.createElement('script');
    script.dataset.monetagZone = ZONE;
    script.src = SRC;
    script.async = true;
    script.setAttribute('data-cfasync', 'false');
    script.onerror = () => setError('The advertising subscription script could not load. Check your connection or content blocker. Browser permission alone does not confirm a subscription.');
    document.body.appendChild(script);
  }, [canLoad]);
  function save(choice, nextAskAt) {
    try {
      const value = { choice, nextAskAt };
      localStorage.setItem(key, JSON.stringify(value));
      setState({ key, choice: value, permission: permission(), now: Date.now() });
      return true;
    } catch { setError('Your choice could not be saved. Push advertising stays off.'); return false; }
  }
  function later() { setError(''); save('later', Date.now() + PUSH_REMINDER_MS); }
  async function enable() {
    if (busy) return;
    setError(''); setBusy(true);
    try {
      const current = permission();
      if (current === 'denied' || current === 'unsupported') return;
      // Native browser UI is requested only inside this explicit user action.
      const result = current === 'granted' ? current : await Notification.requestPermission();
      if (result === 'granted') save('allow', 0);
      else save('later', Date.now() + PUSH_REMINDER_MS);
    } catch { save('later', Date.now() + PUSH_REMINDER_MS); setError('The permission request did not complete. No subscription was confirmed.'); }
    finally { setBusy(false); }
  }
  if (!eligible || state.permission === 'unsupported') return null;
  if (canLoad && !error) return null;
  // Granted browser permission is never requested again. A separate advertising
  // choice is still needed if this account never explicitly enabled Monetag.
  const due = !state.choice || state.choice.nextAskAt <= state.now;
  if (!due && !error) return null;
  const denied = state.permission === 'denied';
  return <section data-testid="registered-monetag-push" aria-label="Optional Monetag advertising notifications" className="border-b border-neutral-200 bg-white p-5">
    <div className="mx-auto max-w-4xl">
      <h2 className="text-sm font-extrabold">{denied ? 'Advertising notifications are blocked' : 'Enable optional advertising notifications?'}</h2>
      <p className="mt-2 text-xs leading-relaxed text-neutral-600">{denied
        ? 'Your browser blocks notifications. PinCraft cannot show the browser permission popup again. To enable them, change this site’s notification permission in browser settings. On iPhone or iPad, web Push may require opening an installed Home Screen web app.'
        : 'Monetag may send advertising notifications even when you are away from PinCraft. Enabling loads its third-party subscription script, which may process technical data and use device storage. This is optional and separate from on-page ad consent. On iPhone or iPad, web Push may require an installed Home Screen web app.'} Choosing Not now reminds you no sooner than five hours later, only while you are on a supported public page.</p>
      <a href="/privacy" className="mt-2 inline-block text-xs font-bold text-brand-700 underline">Privacy choices</a>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      <div className="mt-3 flex gap-2">{!denied && !canLoad && <button type="button" disabled={busy} onClick={enable} className="btn-primary !text-xs">{busy ? 'Checking permission…' : 'Enable ad notifications'}</button>}<button type="button" onClick={later} className="btn-outline !text-xs">Not now</button></div>
    </div>
  </section>;
}
