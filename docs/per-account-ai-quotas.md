# Per-account AI budgets

20 successful Pin idea packs, at least 150 text requests, and 20 image requests per account per Bangladesh calendar day. Failed text/image requests retain their request count; failed Pin packs do not consume the success count. Existing cooldowns and two in-flight requests per owner remain. No site-wide quota document is read or updated. Article editorial/publishing rules remain unchanged; articles use text/image request counters.

Cloudflare text supports the existing image account/token, provided the token has Workers AI permission, or dedicated CLOUDFLARE_TEXT_ACCOUNT_ID / CLOUDFLARE_TEXT_API_TOKEN. See .env.example for the exact optional key/account slots. Credentials stay server-side. Fallback is bounded to six transport attempts and 145 seconds total; it does not guarantee every configured key is attempted in one request. Safety refusals never fall through to another provider.

## Image budget rationale and limits

Cloudflare free Workers AI allocation is 10,000 neurons/account/day, not per PinCraft user. Pricing documentation lists Flux Schnell at 4.8 neurons per 512x512 tile plus 9.6 per step; at four steps the step component alone is 38.4 neurons. Klein fallback output costs 26.05 neurons per tile (plus any input tiles): a 768x1152 pin can require six padded tiles, about 156.3 output neurons; twenty such outputs use about 3,126 neurons before retries, Schnell attempts and text. We therefore keep a conservative product ceiling of 20 image requests **per user**, not a promise that the free account can serve twenty images for arbitrarily many users. Text, other users, fallback and retries share provider allocation. No per-user image limit derived from an account-wide free quota can guarantee service at arbitrary user counts. Billing or independently funded provider capacity is required for that guarantee. App counters reset at Dhaka midnight; upstream quota reset clocks can differ.

References:
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/
- https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/

Verification: production build; 59 AI checks; 49 Blogger automation checks; daily-plan and per-user-ai emulator contracts. Synthetic transports only, no live inference. Production verification must use page/code reads only.
