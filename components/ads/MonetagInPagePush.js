'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/AppProvider';

const ZONE_ID = '12287927';
const SCRIPT_URL = 'https://nap5k.com/tag.min.js';
const SCRIPT_SELECTOR = `script[data-zone="${ZONE_ID}"]`;
const CONSENT_KEY = 'pincraft.monetag-consent.v1';
const CONSENT_VERSION = 1;
const CONSENT_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const PREFERENCES_EVENT = 'pincraft:manage-monetag-preferences';
const AD_ENABLED_PATHS = new Set(['/', '/about']);

function normalizePathname(pathname = '/') {
  const normalized = String(pathname).split(/[?#]/, 1)[0].replace(/\/+$/, '');
  return normalized || '/';
}

function isAdEnabledPath(pathname) {
  return AD_ENABLED_PATHS.has(normalizePathname(pathname));
}

function readConsent() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(CONSENT_KEY) || 'null');
    if (
      !saved || saved.version !== CONSENT_VERSION || !['allow', 'deny'].includes(saved.choice) ||
      !Number.isFinite(saved.savedAt) || Date.now() - saved.savedAt < 0 ||
      Date.now() - saved.savedAt > CONSENT_TTL_MS
    ) return null;
    return saved.choice;
  } catch {
    return null;
  }
}

function saveConsent(choice) {
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify({
      version: CONSENT_VERSION,
      choice,
      savedAt: Date.now(),
    }));
    return true;
  } catch {
    return false;
  }
}

export default function MonetagInPagePush() {
  const pathname = normalizePathname(usePathname() || '/');
  const { user, authLoading, authUnavailable } = useAuth();
  const documentPath = useRef(pathname);
  const previousPath = useRef(pathname);
  const hasAuthenticatedContext = useRef(false);
  const [consent, setConsent] = useState(null);
  const [consentReady, setConsentReady] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    setConsent(readConsent());
    setConsentReady(true);
  }, []);

  useEffect(() => {
    if (user || authUnavailable) hasAuthenticatedContext.current = true;
  }, [user, authUnavailable]);

  useEffect(() => {
    const onManagePreferences = () => {
      setStorageError('');
      setPreferencesOpen(true);
    };
    window.addEventListener(PREFERENCES_EVENT, onManagePreferences);
    return () => window.removeEventListener(PREFERENCES_EVENT, onManagePreferences);
  }, []);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key && event.key !== CONSENT_KEY) return;
      const nextConsent = readConsent();
      setConsent(nextConsent);
      if (nextConsent !== 'allow' && document.querySelector(SCRIPT_SELECTOR)) {
        // A preference changed in another tab. Reload to terminate the old
        // page context instead of pretending a loaded third-party script can
        // be reliably undone by removing its element.
        window.location.reload();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const onBoundaryLink = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!target || target.hasAttribute('download') || (target.target && target.target !== '_self')) return;

      let destination;
      try { destination = new URL(target.href, window.location.href); } catch { return; }
      if (destination.origin !== window.location.origin) return;
      if (isAdEnabledPath(window.location.pathname) === isAdEnabledPath(destination.pathname)) return;

      // A full document navigation makes sure third-party code loaded on a
      // public marketing page is not carried into a workspace/auth/payment
      // route via the App Router's client-side navigation.
      event.preventDefault();
      event.stopPropagation();
      window.location.assign(destination.href);
    };
    document.addEventListener('click', onBoundaryLink, true);
    return () => document.removeEventListener('click', onBoundaryLink, true);
  }, []);

  useEffect(() => {
    const oldPath = previousPath.current;
    if (oldPath !== pathname && isAdEnabledPath(oldPath) !== isAdEnabledPath(pathname)) {
      // Fallback for programmatic router transitions or browser history moves
      // that did not originate from a normal link click.
      window.location.replace(window.location.href);
      return;
    }
    previousPath.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (user && document.querySelector(SCRIPT_SELECTOR)) {
      // Do not leave an ad script running in a document after it becomes signed in.
      window.location.reload();
    }
  }, [user]);

  const isMarketingPage = isAdEnabledPath(pathname);
  const documentRouteScopeMatches = isAdEnabledPath(documentPath.current) === isMarketingPage;
  const isGuest = consentReady && !authLoading && !authUnavailable && !user && !hasAuthenticatedContext.current;
  const mayLoadAds = isMarketingPage && documentRouteScopeMatches && isGuest && consent === 'allow';

  useEffect(() => {
    if (!mayLoadAds || document.querySelector(SCRIPT_SELECTOR)) return;

    const script = document.createElement('script');
    script.dataset.zone = ZONE_ID;
    script.src = SCRIPT_URL;
    script.async = true;
    (document.body || document.documentElement).appendChild(script);
  }, [mayLoadAds]);

  const shouldAsk = consentReady && isMarketingPage && documentRouteScopeMatches && isGuest && consent === null;
  if (!shouldAsk && !preferencesOpen) return null;

  const choose = (choice) => {
    if (!saveConsent(choice)) {
      setStorageError('Your browser could not save this choice, so Monetag ads will stay off. Check your storage settings and try again.');
      return;
    }
    setConsent(choice);
    setStorageError('');
    setPreferencesOpen(false);
  };

  return (
    <section
      role="region"
      aria-label="Monetag advertising preferences"
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-neutral-200 bg-white/95 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl"
    >
      <div className="container-x mx-auto flex max-w-6xl flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="max-w-3xl">
          <h2 className="text-sm font-extrabold text-neutral-900">{preferencesOpen ? 'Advertising preferences' : 'Choose whether to allow ads'}</h2>
          <p className="mt-1 text-xs leading-relaxed text-neutral-600">
            PinCraft can show Monetag In-Page Push ads on public marketing pages. The third-party tag may use cookies or similar device storage and process technical, page-visit, and ad-interaction data. It will not load unless you allow it. You can still use PinCraft if you decline.
            {' '}<a className="font-bold text-brand-700 underline underline-offset-2" href="/privacy">PinCraft privacy choices</a>
            {' '}·{' '}<a className="font-bold text-brand-700 underline underline-offset-2" href="https://monetag.com/privacy/" target="_blank" rel="noreferrer">Monetag privacy policy</a>
            {' '}·{' '}<a className="font-bold text-brand-700 underline underline-offset-2" href="https://monetag.com/terms/" target="_blank" rel="noreferrer">Publisher Agreement</a>
          </p>
          {storageError && <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{storageError}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <button type="button" onClick={() => choose('allow')} className="btn-primary min-h-10 px-4 text-xs">
            {preferencesOpen ? 'Allow ads' : 'Allow advertising'}
          </button>
          <button type="button" onClick={() => choose('deny')} className="btn-outline min-h-10 px-4 text-xs">
            {preferencesOpen ? 'Turn ads off' : 'No thanks'}
          </button>
          {preferencesOpen && <button type="button" onClick={() => setPreferencesOpen(false)} className="min-h-10 rounded-xl px-3 text-xs font-bold text-neutral-600 hover:bg-neutral-100">Close</button>}
        </div>
      </div>
    </section>
  );
}
