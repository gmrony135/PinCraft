'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Adsterra ads (2026-11-25, replaces the previous ad provider). Social Bar + Native Banner +
// two display Banners, shown only on public marketing pages. Generator,
// workspace, auth, checkout, publishing and policy pages never load ad code.
const MARKETING_ROUTES = new Set(['/', '/about', '/how-to-work', '/subscription']);
const SOCIAL_BAR_SRC = 'https://bauval.org/14/a54607ccdd372fccae96e4f16760f4a2';
const NATIVE_SRC = 'https://bauval.org/21/e250928250d9b84951ea0e5ccdfb7142';
const NATIVE_CONTAINER_ID = 'container-e250928250d9b84951ea0e5ccdfb7142';
const BANNERS = [
  { key: 'cc224f0b3f71a17fd951fa892e44e17a', width: 728, height: 90, slot: '728x90' },
  { key: '7d2124eecaa88b6d1e82f6cb703e012a', width: 300, height: 250, slot: '300x250' },
];

// Module state survives Footer remounts inside one document, so a
// client-side move between marketing pages is detected and reloaded fresh:
// the ad scripts must run against the freshly rendered slots.
let injectedPathname = null;

function normalizePathname(pathname = '/') {
  const normalized = String(pathname).split(/[?#]/, 1)[0].replace(/\/+$/, '');
  return normalized || '/';
}

function routeProfile(pathname) {
  return MARKETING_ROUTES.has(normalizePathname(pathname)) ? 'marketing' : 'excluded';
}

function appendScript(parent, { src, text, async, fetchPriority, dataset = {} }) {
  const script = document.createElement('script');
  if (src) script.src = src;
  if (text) script.text = text;
  if (async !== undefined) script.async = async;
  if (fetchPriority) script.fetchPriority = fetchPriority;
  Object.entries(dataset).forEach(([key, value]) => script.setAttribute(`data-${key}`, value));
  parent.appendChild(script);
  return script;
}

function loadScript(parent, attrs) {
  return new Promise((resolve) => {
    const script = appendScript(parent, attrs);
    const done = () => resolve();
    script.onload = done;
    script.onerror = done;
    setTimeout(done, 10000);
  });
}

async function injectBanner(banner) {
  const slot = document.querySelector(`[data-adsterra-slot="${banner.slot}"]`);
  if (!slot) return;
  appendScript(slot, {
    text: `atOptions = ${JSON.stringify({ key: banner.key, format: 'iframe', height: banner.height, width: banner.width, params: {} })};`,
  });
  // Wait for this unit's invoke script to run before setting atOptions for
  // the next unit: both units share the single global atOptions.
  await loadScript(slot, { src: `https://bauval.org/22/${banner.key}`, async: false, dataset: { cfasync: 'false' } });
}

export default function AdsterraAds() {
  const pathname = normalizePathname(usePathname() || '/');

  // Full navigation when crossing between marketing pages and the rest of the
  // site, so ad code never follows a client-side navigation into a workspace,
  // generator, auth or account page (same guard the previous provider used).
  useEffect(() => {
    const onBoundaryLink = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
      let destination;
      try { destination = new URL(anchor.href, window.location.href); } catch { return; }
      if (destination.origin !== window.location.origin) return;
      if (routeProfile(window.location.pathname) === routeProfile(destination.pathname)) return;
      event.preventDefault();
      event.stopPropagation();
      window.location.assign(destination.href);
    };
    document.addEventListener('click', onBoundaryLink, true);
    return () => document.removeEventListener('click', onBoundaryLink, true);
  }, []);

  useEffect(() => {
    if (routeProfile(pathname) !== 'marketing') return;
    if (injectedPathname && injectedPathname !== pathname) {
      window.location.replace(window.location.href);
      return;
    }
    if (injectedPathname === pathname) return;
    injectedPathname = pathname;
    if (!document.querySelector(`script[src="${SOCIAL_BAR_SRC}"]`)) {
      appendScript(document.body, { src: SOCIAL_BAR_SRC, dataset: { cfasync: 'false' } });
    }
    if (!document.querySelector(`script[src="${NATIVE_SRC}"]`)) {
      appendScript(document.body, { src: NATIVE_SRC, async: true, fetchPriority: 'high', dataset: { cfasync: 'false' } });
    }
    (async () => {
      for (const banner of BANNERS) await injectBanner(banner);
    })();
  }, [pathname]);

  if (routeProfile(pathname) !== 'marketing') return null;

  return (
    <section aria-label="Advertisements" className="mt-10">
      <p className="text-center text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400">Advertisements</p>
      <div id={NATIVE_CONTAINER_ID} className="mt-3" />
      <div className="mt-4 hidden justify-center md:flex">
        <div data-adsterra-slot="728x90" className="h-[90px] w-[728px] max-w-full overflow-hidden" />
      </div>
      <div className="mt-4 flex justify-center md:hidden">
        <div data-adsterra-slot="300x250" className="h-[250px] w-[300px] overflow-hidden" />
      </div>
    </section>
  );
}
