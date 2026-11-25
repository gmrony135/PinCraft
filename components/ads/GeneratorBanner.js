'use client';

import { useEffect } from 'react';

// In-content Adsterra banner for the generator pages (Pin Generator and
// Article Writer). Renders one slot per banner unit near the top of the
// page content: 728x90 on md and up, 300x250 below md — the same responsive
// pattern as the footer ads. The footer renders no banner slots on tool
// routes, so each generator page has exactly one slot per banner unit.
// The Native Banner stays footer-only on marketing pages.
const BANNERS = [
  { key: 'cc224f0b3f71a17fd951fa892e44e17a', width: 728, height: 90, slot: '728x90' },
  { key: '7d2124eecaa88b6d1e82f6cb703e012a', width: 300, height: 250, slot: '300x250' },
];

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

export default function GeneratorBanner() {
  // Load the two banner units on mount, sequentially, so each unit's
  // invoke script runs before atOptions is set for the next unit. A fresh
  // mount (for example, returning to a generator from another tool page)
  // loads the units into that page's freshly rendered slots.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const banner of BANNERS) {
        if (cancelled) return;
        await injectBanner(banner);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div aria-label="Advertisement" className="w-full py-2">
      <div className="hidden justify-center md:flex">
        <div data-adsterra-slot="728x90" className="h-[90px] w-[728px] max-w-full overflow-hidden" />
      </div>
      <div className="flex justify-center md:hidden">
        <div data-adsterra-slot="300x250" className="h-[250px] w-[300px] overflow-hidden" />
      </div>
    </div>
  );
}
