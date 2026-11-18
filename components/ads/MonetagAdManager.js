'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/AppProvider';

const ZONES = {
  ipp: { id: '12287927', src: 'https://nap5k.com/tag.min.js' },
  push: { id: '12290352', src: 'https://5gvci.com/act/files/tag.min.js?z=12290352' },
  vignette: { id: '12290345', src: 'https://n6wxm.com/vignette.min.js' },
};
const AD_CONSENT_KEY = 'pincraft.monetag-consent.v1';
const CONSENT_VERSION = 2;
const CONSENT_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const PREFS_EVENT = 'pincraft:manage-monetag-preferences';
const ROUTE_PROFILES = new Map([['/', 'home'], ['/about', 'about']]);

function normalizePathname(pathname = '/') {
  const normalized = String(pathname).split(/[?#]/, 1)[0].replace(/\/+$/, '');
  return normalized || '/';
}

function routeProfile(pathname) {
  return ROUTE_PROFILES.get(normalizePathname(pathname)) || 'excluded';
}

function isMarketingRoute(pathname) {
  return routeProfile(pathname) !== 'excluded';
}

function readStoredChoice(key, choices) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || 'null');
    if (
      !saved || saved.version !== CONSENT_VERSION || !choices.includes(saved.choice) ||
      !Number.isFinite(saved.savedAt) || Date.now() - saved.savedAt < 0 ||
      Date.now() - saved.savedAt > CONSENT_TTL_MS
    ) return null;
    return saved.choice;
  } catch {
    return null;
  }
}

function saveStoredChoice(key, choice) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ version: CONSENT_VERSION, choice, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

function hasLoadedAnyMonetagScript() {
  return Object.values(ZONES).some(({ id }) => Boolean(
    document.querySelector(`script[data-monetag-zone="${id}"], script[data-zone="${id}"]`)
  ));
}

function appendMonetagScript(format) {
  const zone = ZONES[format];
  if (!zone || document.querySelector(`script[data-monetag-zone="${zone.id}"], script[data-zone="${zone.id}"]`)) return;

  const script = document.createElement('script');
  script.dataset.monetagZone = zone.id;
  script.async = true;
  if (format === 'push') {
    script.src = zone.src;
    script.setAttribute('data-cfasync', 'false');
  } else {
    // The supplied inline snippets append an empty script before setting its
    // attributes. Set everything first so React/SPAs cannot race execution.
    script.dataset.zone = zone.id;
    script.src = zone.src;
  }
  (document.body || document.documentElement).appendChild(script);
}

export default function MonetagAdManager() {
  const pathname = normalizePathname(usePathname() || '/');
  const { user, authLoading, authUnavailable } = useAuth();
  const [documentProfile, setDocumentProfile] = useState(routeProfile(pathname));
  const previousPath = useRef(pathname);
  const hasAuthenticatedContext = useRef(false);
  const [adConsent, setAdConsent] = useState(null);
  const [choicesReady, setChoicesReady] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    setAdConsent(readStoredChoice(AD_CONSENT_KEY, ['allow', 'deny']));
    setChoicesReady(true);
  }, []);

  useEffect(() => {
    if (user || authUnavailable) hasAuthenticatedContext.current = true;
  }, [user, authUnavailable]);

  useEffect(() => {
    const onManagePreferences = () => {
      setStorageError('');
      setPreferencesOpen(true);
    };
    window.addEventListener(PREFS_EVENT, onManagePreferences);
    return () => window.removeEventListener(PREFS_EVENT, onManagePreferences);
  }, []);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key && event.key !== AD_CONSENT_KEY) return;
      const nextAdConsent = readStoredChoice(AD_CONSENT_KEY, ['allow', 'deny']);
      setAdConsent(nextAdConsent);
        if ((nextAdConsent !== 'allow') && hasLoadedAnyMonetagScript()) {
        // A document reload ends the executing third-party context; removing
        // script nodes alone cannot undo listeners, requests, or injected UI.
        window.location.reload();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const onBoundaryLink = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
      let destination;
      try { destination = new URL(anchor.href, window.location.href); } catch { return; }
      if (destination.origin !== window.location.origin) return;
      if (!hasLoadedAnyMonetagScript() || routeProfile(window.location.pathname) === routeProfile(destination.pathname)) return;
      // Full navigation prevents loaded ad code from following client-side
      // navigation into an excluded editor, generator, auth, or account route.
      event.preventDefault();
      event.stopPropagation();
      window.location.assign(destination.href);
    };
    document.addEventListener('click', onBoundaryLink, true);
    return () => document.removeEventListener('click', onBoundaryLink, true);
  }, []);

  useEffect(() => {
    const oldPath = previousPath.current;
    if (oldPath !== pathname && routeProfile(oldPath) !== routeProfile(pathname) && hasLoadedAnyMonetagScript()) {
      // Fallback for router.push()/history navigation that bypasses links.
      window.location.replace(window.location.href);
      return;
    }
    previousPath.current = pathname;
    setDocumentProfile(routeProfile(pathname));
  }, [pathname]);


  const isGuest = choicesReady && !authLoading && !authUnavailable;
  const profileMatchesDocument = documentProfile === routeProfile(pathname);
  const mayLoadSiteAds = isMarketingRoute(pathname) && profileMatchesDocument && isGuest && choicesReady && adConsent === 'allow';
  const mayLoadVignette = mayLoadSiteAds && routeProfile(pathname) === 'home';

  useEffect(() => {
    if (!mayLoadSiteAds) return;
    appendMonetagScript('ipp');
    if (mayLoadVignette) appendMonetagScript('vignette');
  }, [mayLoadSiteAds, mayLoadVignette]);

  const chooseAdCookies = useCallback((choice) => {
    if (!saveStoredChoice(AD_CONSENT_KEY, choice)) {
      setStorageError('Your browser could not save this choice, so Monetag ads will remain off. Check your storage settings and try again.');
      return;
    }
    setAdConsent(choice);
    setStorageError('');
    setPreferencesOpen(false);
    if (choice === 'deny' && hasLoadedAnyMonetagScript()) window.location.reload();
  }, []);

  const isMarketingGuest = choicesReady && isGuest && isMarketingRoute(pathname) && profileMatchesDocument;
  const shouldAskAdCookies = isMarketingGuest && adConsent === null;
  const showPanel = shouldAskAdCookies || preferencesOpen;
  if (!showPanel) return null;

  const showCookieChoices = shouldAskAdCookies || preferencesOpen;

  return (
    <section
      role="region"
      aria-label="Monetag advertising and notification preferences"
      className="border-b border-neutral-200 bg-white/95  backdrop-blur-xl"
      data-testid="monetag-preferences"
    >
      <div className="container-x mx-auto flex max-w-6xl flex-col gap-3 py-4 sm:py-5">
        {showCookieChoices && <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="max-w-3xl">
            <h2 className="text-sm font-extrabold text-neutral-900">{preferencesOpen ? 'Advertising cookie choices' : 'Choose your advertising cookie settings'}</h2>
            <p className="mt-1 text-xs leading-relaxed text-neutral-600">
              Allowing enables Monetag In-Page Push and Vignette ads on selected public pages. The third-party tags may use non-essential cookies or similar device storage and process technical, page-visit, and ad-interaction data. Push notifications are separate: PinCraft explains them first and asks the browser only after you click Enable. Rejecting ad cookies keeps on-page Monetag ads off; essential site functions remain available either way.
              {' '}<a className="font-bold text-brand-700 underline underline-offset-2" href="/privacy">PinCraft privacy choices</a>
              {' '}·{' '}<a className="font-bold text-brand-700 underline underline-offset-2" href="https://monetag.com/privacy/" target="_blank" rel="noreferrer">Monetag privacy policy</a>
              {' '}·{' '}<a className="font-bold text-brand-700 underline underline-offset-2" href="https://monetag.com/terms/" target="_blank" rel="noreferrer">Publisher Agreement</a>
            </p>
            {storageError && <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{storageError}</p>}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
            <button type="button" onClick={() => chooseAdCookies('allow')} className="btn-primary min-h-10 px-4 text-xs">Allow ad cookies</button>
            <button type="button" onClick={() => chooseAdCookies('deny')} className="btn-outline min-h-10 px-4 text-xs">Reject ad cookies</button>
          </div>
        </div>}

        {preferencesOpen && <div className="flex justify-end border-t border-neutral-100 pt-3">
          <button type="button" onClick={() => setPreferencesOpen(false)} className="min-h-10 rounded-xl px-3 text-xs font-bold text-neutral-600 hover:bg-neutral-100">Close</button>
        </div>}
      </div>
    </section>
  );
}
