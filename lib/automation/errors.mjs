export class AutomationError extends Error {
  constructor(code, message, options = {}) { super(message); this.name = "AutomationError"; this.code = code; this.retryable = Boolean(options.retryable); this.uncertain = Boolean(options.uncertain); this.status = options.status || 400; this.upstreamStatus = Number.isInteger(options.upstreamStatus) ? options.upstreamStatus : null; this.retryAfterSeconds = Number.isFinite(options.retryAfterSeconds) ? Math.min(300, Math.max(0, options.retryAfterSeconds)) : null; }
}
export const setupError = () => new AutomationError("setup_required", "Automation is not available yet. Your saved drafts are unchanged.", { status: 503 });

// Operational messages can outlive the code that wrote them. Older stored logs
// and errors must not disclose AI vendors, model IDs, endpoints or credentials.
// Do not run this filter over user-authored topics, articles or prompts.
const privateDetail = /\b(?:gemini|groq|cloudflare|openai|flux|workers ai|black-forest-labs|gpt[- /]|llama[- /])\b|generativelanguage\.|api\.(?:groq|openai|cloudflare)\.|@cf\/|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bAIza[A-Za-z0-9_-]{20,}|\bsk-[A-Za-z0-9_-]{16,}/i;
export function publicMessage(message, fallback = 'This service is temporarily unavailable. Please try again later.') {
  if (message === null || message === undefined || message === '') return null;
  return typeof message === 'string' && !privateDetail.test(message) ? message : fallback;
}
const aiMessages = {
  ai_setup_required: 'AI writing is temporarily unavailable. Try again later, or choose the separate Offline template mode in the Pin or Article tool.',
  ai_image_setup_required: 'AI artwork is temporarily unavailable. Your text and saved drafts are unchanged. Please try again later.',
  ai_unavailable: 'AI writing could not be completed after automatic recovery. Please try again later. No offline template was substituted.',
  ai_images_unavailable: 'Artwork could not be generated after automatic recovery. Please try again later. No placeholder image was substituted.',
  invalid_ai_image: 'The generated image could not be verified. No placeholder was substituted. Please try again later.',
  ai_usage_unavailable: 'Your private AI usage could not be checked or saved. No further generation request will start until this is available. Please try again later.',
  ai_daily_limit: 'The daily AI request limit has been reached for this account or website. It resets at 00:00 UTC. Temporary service limits may apply earlier.',
  content_blocked: 'This request was declined for safety. Please use a different, safe description. Safety refusals are not retried automatically.',
};
export function publicError(error) {
  if (!(error instanceof AutomationError)) return { code: 'server_error', error: 'The request could not be completed. Please try again later. No success has been assumed.' };
  const fallback = error.uncertain
    ? 'The remote result could not be confirmed. Check the destination before trying again; automatic reposting is blocked to prevent duplicates.'
    : 'The service could not complete this request. Please try again later or check your account connection.';
  return { code: error.code, error: aiMessages[error.code] || publicMessage(error.message, fallback) || fallback };
}
