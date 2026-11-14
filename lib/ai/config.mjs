import 'server-only';
// Model names are operator settings, never accepted from browser requests.
const model = (value, fallback) => typeof value === 'string' && /^[A-Za-z0-9._:/-]{1,100}$/.test(value) ? value : fallback;
const key = value => typeof value === 'string' && value.length >= 16 && value.length <= 6000 && !/[\s\u0000-\u001f\u007f]/.test(value) ? value : null;
const limit = (name, fallback, max) => /^\d+$/.test(process.env[name] || '') ? Math.min(max, Math.max(1, Number(process.env[name]))) : fallback;
export function textCandidates() {
  const gemini = key(process.env.GEMINI_API_KEY), groq = key(process.env.GROQ_API_KEY);
  return [
    ...(gemini ? [{ provider: 'gemini', model: model(process.env.GEMINI_MODEL, 'gemini-3.1-flash-lite'), key: gemini, timeout: 18000 }] : []),
    ...(groq ? [{ provider: 'groq', model: model(process.env.GROQ_MODEL, 'openai/gpt-oss-120b'), key: groq, timeout: 18000 }, { provider: 'groq', model: model(process.env.GROQ_FALLBACK_MODEL, 'openai/gpt-oss-20b'), key: groq, timeout: 14000 }] : []),
  ].filter((candidate, index, all) => all.findIndex(item => item.provider === candidate.provider && item.model === candidate.model) === index);
}
export const IMAGE_MODELS = ['@cf/black-forest-labs/flux-1-schnell', '@cf/black-forest-labs/flux-2-klein-4b'];
export function imageSettings() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '', token = key(process.env.CLOUDFLARE_API_TOKEN);
  return /^[a-f0-9]{32}$/i.test(accountId) && token ? { accountId, token, models: [...IMAGE_MODELS] } : null;
}
export function aiLimits() {
  return {
    user: { text: limit('AI_USER_DAILY_TEXT_LIMIT', 30, 100), image: limit('AI_USER_DAILY_IMAGE_LIMIT', 5, 20) },
    global: { text: limit('AI_GLOBAL_DAILY_TEXT_LIMIT', 150, 1000), image: limit('AI_GLOBAL_DAILY_IMAGE_LIMIT', 20, 100) },
    maxTextAttempts: 3, maxImageAttempts: 2, resetTimezone: 'UTC',
  };
}
export function publicAIStatus() {
  const candidates = textCandidates();
  return {
    textConfigured: Boolean(candidates.length), imageConfigured: Boolean(imageSettings()),
    automaticFallback: candidates.length > 1,
    limits: { user: aiLimits().user, resetTimezone: 'UTC' },
    tasks: ['pin', 'article', 'keywords', 'plan', 'quality', 'image'],
    authenticationRequired: true,
    statusMeaning: 'Configuration only, not a live connectivity or quota guarantee. Each generation is verified when requested.',
  };
}
