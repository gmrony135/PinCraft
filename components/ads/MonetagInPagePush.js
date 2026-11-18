'use client';

import { useEffect } from 'react';

const ZONE_ID = '12287927';
const SCRIPT_URL = 'https://nap5k.com/tag.min.js';

export default function MonetagInPagePush() {
  useEffect(() => {
    // This component is mounted only on the public homepage.
    if (window.location.pathname !== '/') return undefined;

    const selector = `script[data-zone="${ZONE_ID}"]`;
    if (document.querySelector(selector)) return undefined;

    const script = document.createElement('script');
    script.dataset.zone = ZONE_ID;
    script.src = SCRIPT_URL;
    script.async = true;
    (document.body || document.documentElement).appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  return null;
}
