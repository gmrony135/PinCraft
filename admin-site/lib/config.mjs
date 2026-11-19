// Owner-only admin. Only this verified Google/email account may open the dashboard.
export const OWNER_EMAIL = 'gmrony135@gmail.com';

// Free-plan daily limits per user (PinCraft defaults; see lib/free-plan.mjs and lib/ai/config.mjs).
export const LIMITS = { pinPacks: 20, text: 150, image: 20 };

// Monetag tag scripts the PinCraft site loads (components/ads/MonetagAdManager.js).
export const MONETAG_TAG_URLS = ['https://n6wxm.com/vignette.min.js', 'https://nap5k.com/tag.min.js'];

export const PROVIDERS = [
  { id: 'gemini', name: 'Google Gemini' },
  { id: 'groq', name: 'Groq' },
  { id: 'cloudflare', name: 'Cloudflare Workers AI' },
];
