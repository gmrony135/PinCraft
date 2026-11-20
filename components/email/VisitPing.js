'use client';
import { useEffect } from 'react';

// Records a visit for signed-in users, at most once every 10 minutes per browser tab.
// Signed-out visitors get a 401 that is ignored. Nothing is shown to the user.
export default function VisitPing() {
  useEffect(() => {
    try {
      const last = Number(sessionStorage.getItem('pc-visit-ping') || 0);
      if (Date.now() - last < 10 * 60000) return;
      sessionStorage.setItem('pc-visit-ping', String(Date.now()));
    } catch {}
    fetch('/api/email/visit', { method: 'POST', credentials: 'same-origin', cache: 'no-store', keepalive: true }).catch(() => {});
  }, []);
  return null;
}
