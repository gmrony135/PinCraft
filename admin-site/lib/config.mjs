// Mirrors PinCraft lib/billing/config.mjs PAYMENTS_ENABLED (bKash/Nagad collection on, 2026-11-19 22:36 BD).
export const PINCRAFT_PAYMENTS_ENABLED = true;

// Owner-only admin. Only this verified Google/email account may open the dashboard.
export const OWNER_EMAIL = 'gmrony135@gmail.com';

// Free-plan daily limits per user (PinCraft defaults; see lib/free-plan.mjs and lib/ai/config.mjs).
export const LIMITS = { pinPacks: 20, text: 150, image: 20 };

export const PROVIDERS = [
  { id: 'gemini', name: 'Google Gemini' },
  { id: 'groq', name: 'Groq' },
  { id: 'cloudflare', name: 'Cloudflare Workers AI' },
];
