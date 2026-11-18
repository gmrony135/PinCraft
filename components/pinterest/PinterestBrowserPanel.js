"use client";
import PinterestLogo from './PinterestLogo';
import { PINTEREST_ACCOUNT, PINTEREST_MAX_PINS_PER_DAY } from '@/lib/pinterest-browser/policy.mjs';

// Status panel for browser-based Pinterest posting. It reports state only; it cannot post.
export default function PinterestBrowserPanel() {
  return (
    <section aria-labelledby="pinterest-browser-heading" className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5" data-testid="pinterest-browser-panel">
      <div className="flex items-start gap-4">
        <PinterestLogo size={44} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 id="pinterest-browser-heading" className="text-[16px] font-extrabold">Pinterest automation</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-neutral-600">
            Connected account:{' '}
            <a href={PINTEREST_ACCOUNT.profileURL} target="_blank" rel="noopener noreferrer" className="font-bold text-brand-700 underline">
              @{PINTEREST_ACCOUNT.handle}
            </a>
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-neutral-600">
            Up to {PINTEREST_MAX_PINS_PER_DAY} pins per day. Posting is limited to this account only.
          </p>
          <p data-testid="pinterest-browser-status" className="mt-3 rounded-xl bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
            Not connected yet. The SlimGlow Life sign-in is not saved. Browser posting stays off until the sign-in is saved through the Secure Vault card.
          </p>
        </div>
      </div>
    </section>
  );
}
