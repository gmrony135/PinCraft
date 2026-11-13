# Full Auto Mode — implementation and setup reference

## Status and scope

**Backend implemented; production setup and genuine end-to-end provider verification pending.**

The selected workflow is an external blog, a 120-minute new-pipeline interval, a maximum of 10 completed Pin + Article pipelines/day, and backend-first delivery. The actual blog provider/URL has not yet been selected; Blogger is supported but is **not** assumed connected. No paid provisioning was authorized or performed.

This release replaces the browser-local automation prototype. It does not silently turn the separate manual drafting/demo-publication tools or the sample Adsterra report into live integrations.

## Implemented modules

- `db/migrations/001_automation.sql`: settings, encrypted credentials, connection versions, jobs/checkpoints/leases, local-day completion timestamps, logs, worker heartbeat and indexes. Transactional, re-runnable schema v1; no test users or sample successes.
- `lib/automation/db.mjs`: bounded connection pool, certificate-verifying TLS, transaction handling and health check.
- `vault.mjs`: random-IV AES-256-GCM, versioned envelope, per-user authenticated additional data; 32-byte standard-base64 key.
- `http.mjs`: fixed provider hosts, strict public HTTPS custom destinations, all-address validation and pinned DNS lookup, no redirect/token forwarding, body/timeout limits and sanitized safe-versus-uncertain errors.
- `providers.mjs`: OpenAI Responses, Gemini generateContent, Pinterest board validation/token refresh/Pin create/read, Blogger offline token refresh/admin verification/posts, custom publisher contract; optional WordPress application-password adapter.
- `content.mjs`: structured JSON validation, 500–850-word article, headings, 5+ hashtags, escaped HTML, per-job publication marker, bounded Pin description. Religious prompts prohibit fabricated scripture/hadith/attributed quotations. No measured SEO/traffic score is invented.
- `trends.mjs`: live Google Trends RSS reader with bounded non-executing title/date parsing, region selection, 48-hour freshness checks and duplicate-topic avoidance. Rotation and real RSS trends are distinct settings.
- `images.mjs` and `/api/automation/image/[id]`: purpose-bound HMAC image URLs and actual 1000×1500 PNG artwork from persisted content. Images contain public post text, not credentials. The worker preflights a real public PNG **before** publishing.
- `repository.mjs`: per-account claims, partial unique open-job index, quota/cadence, checkpoints, persistent rate limit, review resolution, owned cloud pagination and sanitized status/log retrieval.
- `worker.mjs`: bounded three-account parallel invocation, token refresh persistence, saved checkpoints, no browser dependence, real provider results only.
- `infrastructure.mjs`: explicit readiness checks and constant-time worker authorization. Preview/local posting is denied by default.
- Dashboard: real ON/OFF, encrypted connection form, fixed cadence/cap, 20 editable defaults, editable timezone, live-source choice, setup checklist, actual history/logs, last successful timestamp and ambiguous-result review.
- Cloud Library: real authenticated PostgreSQL reads, 20-record cursor pages, Pin copy/article reader/live-result links, separate from device saves and examples.

## Production configuration gates

Configure only through the trusted deployment environment and authenticated Dashboard; never commit actual values.

| Setting | Purpose / gate |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Real Google OAuth Web Client ID; authorize the actual public JavaScript origin |
| `AUTH_SESSION_SECRET` | Separate random session-signing secret, >=32 characters; Google-verified HttpOnly sessions only |
| `DATABASE_URL` | Permanent, TLS-capable PostgreSQL with migration permissions; pooled URL recommended |
| `AUTOMATION_ENCRYPTION_KEY` | Exactly 32 random bytes encoded as standard base64; securely back up and retain |
| `CRON_SECRET` | Separate random 32–256-character Bearer secret suitable for an HTTP header |
| `APP_URL` | Canonical public HTTPS origin, no path/query; Pin image route must be publicly reachable without deployment protection |
| `BLOGGER_CLIENT_ID`, `BLOGGER_CLIENT_SECRET` | Blogger only: same OAuth app that issued the user's offline refresh token |
| `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET` | Optional server-side access-token renewal with the user's refresh token |

The actual user connections are entered after verified sign-in: AI provider/key/model, Pinterest OAuth access token and numeric Board ID, optional refresh token, and the chosen blog's publication authorization. Credentials are encrypted in PostgreSQL and are not returned by status, settings, cloud Library or logs.

Blogger requires owner/admin access and an offline refresh token with `https://www.googleapis.com/auth/blogger`. A one-hour access token is not sufficient for indefinite offline execution. Pinterest's token must belong to an authorized account/app and carry the appropriate board-read/Pin-write permissions. Board-read verification is not falsely described as guaranteed publication permission; providers validate writes when each post is made. Expired/revoked permissions pause honestly.

The connection action makes a small real AI verification request and can incur the provider's normal usage. An explicit publishing/API-usage consent checkbox is required. No provider usage happens merely by typing a key into the form.

### Operator deployment order

1. Supply authorized infrastructure/auth configuration securely; do not invent a site or provision a paid service.
2. Apply `npm run db:migrate` using the permanent database environment. The agent/operator handles deployment work; the user is not asked to perform Git commands.
3. Redeploy so Vercel captures `CRON_SECRET` and the schedule configuration.
4. Confirm a real scheduled worker heartbeat. A missing/stale heartbeat yields **Awaiting server worker**, not Active.
5. The account owner authorizes the actual external accounts/blog and chooses the timezone/topic source. Verify/save and enable once.
6. Confirm one genuine live pipeline using the returned public article URL and Pinterest Pin ID, then inspect cloud results/logs.

**Steps requiring real production configuration/authorization have not been performed in this release.** A real external account owner, secret or permanent database cannot be fabricated by a code implementation.

## Scheduler and timing

`vercel.json` uses **Schedules Beta**, path target `/api/internal/automation/tick`, method POST, UTC expression `*/15 * * * *`, jitter 15 minutes. This is a dispatcher wake-up interval; it is **not** a 15-minute publication schedule.

The database enforces 120 minutes between actual claims of new pipelines, regardless of duplicate dispatcher delivery or OFF/ON toggling. There is no backlog burst after downtime. Only one pipeline can be open per account. Retries of that same pipeline do not create a new topic/article if its content/remote URL was already saved.

The daily cap counts successful completions using their actual completion timestamp in the configured timezone. Failed attempts are not fake completions. On reaching 10, work waits until the next local day, while preserving the minimum new-pipeline cadence. Asia/Dhaka is an editable implementation default, not an assumed user-confirmed selection. Hosting jitter and provider latency can make a due job late; exact wall-clock delivery and exactly 10 posts every day are not guaranteed.

One invocation handles at most three accounts concurrently, with a 300-second function budget and eight-minute leases. This bounds serverless work; more than three simultaneously due accounts may wait for subsequent dispatches. This is a small initial deployment, **not an unbounded high-volume queue service**.

Vercel path/function Schedules do not automatically retry failures. The application persists its own retries/leases. If the scheduler itself stops, persisted work remains and recovers at the next healthy dispatch; the Dashboard stops showing Running when its heartbeat is stale (>45 minutes).

Current Schedules Beta documentation describes a Hobby minimum 15-minute interval, mandatory 15-minute jitter and 5,000 runs/billing period shared by the team. A 15-minute single dispatcher is approximately 2,976 runs in a 31-day month before manual/other team runs. Limits can change in Beta; other usage or quota exhaustion can delay/skip dispatches. No paid upgrade or quota increase is enabled automatically.

### Non-production / alternative host

`VERCEL_ENV=production` permits the protected production route. For an explicitly authorized isolated local/alternative-host instance only, `AUTOMATION_ALLOW_NON_PRODUCTION=1` permits a worker. Never point automated tests at production credentials or a shared production database.

`npm run automation:worker` performs **one** database-backed invocation. A reliable external server scheduler would have to invoke it repeatedly on an alternative host; running a tab, local dev server or transient workspace process is not permanent production infrastructure. The repository does not claim otherwise.

## Duplicate avoidance and error handling

- Account-row `FOR UPDATE SKIP LOCKED`, a partial unique open-job index and unique user/scheduled-time slot prevent concurrent creation/claim of a pipeline.
- Claims persist an ownership token/lease. A worker checks enabled state, lease and connection version before each new step.
- AI content is validated and saved before any article/Pin publication. Article and Pin IDs/URLs are persisted from provider responses, not locally fabricated.
- Retryable reads/generation and explicitly rejected rate-limit requests retry up to three attempts, with at least 15-minute spacing. A confirmed article step is reused if Pinterest needs retrying.
- A network timeout, malformed/unconfirmed publish response, server-side ambiguous publication failure, expired mutation lease, or persistence failure after remote acceptance does **not** trigger a blind repost.
- Such a job is `attention`; the account pauses. Existing article/Pin IDs can be verified remotely against the expected job marker or exact board/article link. Or the owner can explicitly confirm inspecting the destination and abandon the job without recording Success.
- OFF pauses subsequent requests. It cannot retract a request already sent; its actual result may still be saved. Removing connections is blocked while a worker is in flight or an uncertain result remains unresolved.
- A transaction failure after Pinterest acceptance keeps the local mutation checkpoint uncertain until it is durably resolved. It is never downgraded into a safe automatic repost.
- There is no atomic transaction spanning PostgreSQL and two external providers. **Exactly-once publication cannot be guaranteed through arbitrary external failures.** Conservative review is the deliberate safety choice, not a fake always-successful workflow.

## Other-blog publisher contract

The endpoint is an authorized public HTTPS integration owned/approved by the user; an ordinary blog homepage is not sufficient. The UI does not pretend to support every CMS without an adapter.

All requests include `Authorization: Bearer <user publisher token>`. Redirects/private-network destinations are rejected. Do not use query parameters for secrets.

### Capability verification — GET endpoint

```json
{
  "ready": true,
  "siteUrl": "https://your-authorized-blog.example",
  "capabilities": { "idempotency": true, "publicationLookup": true }
}
```

### Public article creation — POST endpoint

Header: `Idempotency-Key: <job UUID>`

```json
{
  "idempotencyKey": "the-same-job-UUID",
  "title": "Generated title",
  "html": "Escaped article HTML with a pincraft-job marker",
  "excerpt": "Pin description",
  "slug": "pincraft-the-job-UUID"
}
```

The endpoint must publish **at most once per key**. A repeated key must return the same existing result rather than creating another article. Successful response:

```json
{
  "id": "actual-remote-post-id",
  "url": "https://your-authorized-blog.example/actual-published-post",
  "status": "published"
}
```

Returned URL hostname must match the verified `siteUrl`. Draft/unknown/wrong-host results are not accepted as public success.

### Review lookup — GET endpoint?id=actual-remote-post-id

Return the same real publication with `status`, `url`, `id` and the original `idempotencyKey`. It is used to resolve an uncertain result without reposting. Capability declarations from a custom endpoint are trusted as that authorized publisher's contract, not proof that an arbitrary third-party blog grants write access.

Blogger uses its actual API instead of this contract; the optional WordPress backend adapter uses application-password authentication and public post status/slug. Neither provider is selected or authorized on the user's behalf.

## API surface

| Endpoint | Access / result |
| --- | --- |
| `GET /api/automation` | Guest-safe infrastructure/empty state; own authenticated account status only; no secrets |
| `POST /api/automation/settings` | Same-origin signed-in actions: connect, mode, preferences, disconnect; bounded JSON; persistent 90s verification throttle |
| `POST /api/automation/review` | Same-origin owner-only remote verification or explicitly confirmed abandonment |
| `GET /api/library?cursor=` | Signed-in account's persisted content packs; 20 items and an owned cursor; no examples or credentials |
| `GET /api/automation/image/:id?sig=` | Public image only with a purpose-bound valid signature and real saved content |
| `POST /api/internal/automation/tick` | Constant-time CRON_SECRET Bearer authorization plus environment/infrastructure guards; ignores body injection |

Status/settings/Library responses are private/no-store. Image output is public-cacheable because it is specifically intended for Pinterest; backing up/retaining the encryption key is important for both saved credentials and existing image URLs. Rotating the key invalidates old connections/images and needs an intentional migration/reconnect plan.

No application API grants unauthenticated credential access, publishes based on localStorage, accepts a client-invented logged-in profile, or exposes a browser “fake success” switch.

## Verification and remaining live gates

**44 backend + 38 configured API/browser + 34 public Dashboard + 35 offline auth + 148 retained-tool + 74 updated final checks = 373 local checks passed.** Production build passes; audit reports 0 known vulnerabilities. Browser suites report zero console/runtime errors.

Verified with a real local PostgreSQL 17 database, including idempotent migrations; concurrent claims; 120-minute/cap/reset logic; cross-user isolation/cursors; bounded retries; in-flight pause; expired mutation recovery; a simulated DB failure after Pinterest acceptance; authentic PNG generation; real persisted mode/preferences; cloud pagination/copy/reader; and 320–1440px layouts. One real public Google Trends RSS read succeeded.

**Test boundaries:** provider publish/AI/token responses were explicit in-process test doubles; signed sessions and published-content examples in the API/browser suite were isolated local fixtures. They are not live Google OAuth, actual Pinterest/Blogger authorization, real model generation or remote publication evidence. Test scripts reject a non-loopback/non-`_test` database and remove seeded accounts at completion. No test credential or sample success is deployed into production.

Pending: permanent production database/migration; real Google OAuth/session configuration; encryption/worker secrets and public image-origin configuration; actual blog choice/URL/publishing permission; real AI and Pinterest account authorization; and one observed complete live pipeline plus scheduled offline follow-up. Until then, production correctly says **Setup required**, not fully operational.

## Primary references used

- [Vercel Schedules configuration](https://vercel.com/docs/schedules/configuration)
- [Schedules limits](https://vercel.com/docs/schedules/limits)
- [Handling scheduled runs and path authorization](https://vercel.com/docs/schedules/handle-runs)
- [Blogger BlogUserInfos](https://developers.google.com/blogger/docs/3.0/reference/blogUserInfos)
- [Blogger posts.insert](https://developers.google.com/blogger/docs/3.0/reference/posts/insert)
- [Google offline access](https://developers.google.com/identity/protocols/oauth2/web-server#offline)
- [Pinterest API](https://developers.pinterest.com/docs/api/v5/)

These describe integration contracts/limits; they do not confer user account permission or prove an unconfigured production account is connected.
