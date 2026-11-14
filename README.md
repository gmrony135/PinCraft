# PinCraft — reviewed Blogger publishing & manual Pinterest packs

PinCraft's existing AI text/artwork generation and private Library are retained. The selected publishing path is now **Blogger API v3 automatic publishing → Pinterest manual upload/native scheduler**. The existing Next.js website stays at **https://pincraftly.vercel.app**. Jobs live in Firestore Spark; a bounded Node runner runs directly in GitHub Actions.

**No Pinterest API, headless login/click automation, session-cookie collection, new VPS, Firebase Blaze, Cloud Scheduler/Functions or paid image-storage dependency.** Manual Pin tasks are never presented as API-confirmed publications.

## Start here

**[সম্পূর্ণ setup ও activation checklist — বাংলা](docs/blogger-manual-pinterest-setup.bn.md)**

The guide includes the exact Google callback, GitHub Secrets/Variables ↔ website environment mapping, reconnect/retry/inspection procedures, free-tier limitations and reproducible local tests. `.env.example` contains names/placeholders only.

**Final local validation:** 49/49 reviewed backend + 31/31 production-build API/browser checks; 211/211 existing regression checks; production build passed. [Evidence and live-activation boundary](docs/reviewed-publishing-validation.md). All provider receipts are synthetic.

This replacement has **not** installed production publishing credentials, enabled the new scheduler, performed genuine owner Blogger consent, pushed/deployed this worktree or published a real article. Local emulator/mocked-provider tests and a production build do not prove live provider access. Do not redispatch the historical legacy verification as a test of this new runner.

## Publishing contract

1. A currently verified PinCraft user separately connects Blogger with Google offline OAuth, browser/state binding and PKCE, then verifies their administrator blog.
2. Article Writer reviews one specific HTML article, Pin title/description/hashtags, image reference/download and UTC schedule. Review is unchecked initially and invalidated by edits. Generation/Library saves alone never queue a job.
3. The server creates an owner-scoped, idempotent Firestore job. It inserts a **draft**, saves the real post ID, then publishes/schedules **that same ID** with `posts.publish` and optional `publishDate`.
4. `SCHEDULED` is not `LIVE`. Only a due `LIVE` admin result plus a separate unauthenticated matching public page releases its URL into the dependent **manual Pin task**.
5. Jobs supplies copy controls and a local ZIP export. Optionally attach downloaded artwork for a browser-only PNG+copy ZIP; image bytes never enter Firestore/publishing APIs. Existing public image hosting is optional and unchanged.
6. The user uploads/chooses a board/schedules inside Pinterest. An entered Pin link is labeled **user-reported, not API-verified**, with no visibility/reach guarantee.

Leases/checkpoints serialize jobs and connection mutations. Definitely rejected temporary steps use bounded backoff, at most **three logical attempts** without resetting the saved draft ID/counter. Lost/ambiguous mutation receipts require inspection and marker-bound reconciliation, never blind reinsertion. Reconnection requires the original Google identity, re-verified blog and explicit per-job reconfirmation. Disconnect deletes local grants; already-sent requests may finish, but cannot resurrect credentials.

**Important:** disabling GitHub or disconnecting does not cancel a future schedule already registered in Blogger. Unschedule/revert it yourself in Blogger if needed; this implementation does not remotely delete/revert posts.

## Files

| Path | Purpose |
| --- | --- |
| `lib/publishing/{content,blogger,repository}.mjs` | Validation, provider adapter, durable owner-scoped job state |
| `lib/publishing/{time,review-content,pin-pack}.mjs` | IANA/DST review helpers, owner-bound handoff, browser-only export |
| `app/api/publish/[...path]/route.js` | Managed-session JSON API with same-origin mutation protection |
| `app/api/blogger/callback/route.js` | Canonical callback delegating to secure existing OAuth implementation |
| `components/publishing/` | Review composer, Jobs/manual pack, current dashboard/setup |
| `components/workspace/Connector.js` | Blogger-only consent/verification and manual Pinterest guidance |
| `scripts/run-reviewed-blogger.mjs` | Direct, guarded production Node runner; no AI/Pinterest/browser publisher |
| `.github/workflows/pincraft-reviewed-blogger.yml` | Public-main-only cron, deliberately operator-gated |
| `scripts/test-reviewed-blogger.mjs` | New guarded unit/Auth/Firestore integration suite |
| `scripts/check-reviewed-publishing-ui.mjs` | Production-build APIs and Chromium with explicit local remote doubles |

## Runtime & scheduling

- Node 24; current workflow pins **24.22.3**. Production-only `npm ci --omit=dev --ignore-scripts`; no Playwright, esbuild or Firebase CLI needed by the runner.
- Cron: **`7,17,27,37,47,57 * * * *`**, best effort. Blogger future schedules are registered in advance, not sent for the first time only at the due minute.
- Workflow runs only for public `gmrony135/PinCraft`, `main`, and `REVIEWED_BLOGGER_SCHEDULER_ENABLED=true`. Read-only repository permission, SHA-pinned official actions, one concurrent run, no cancellation, secrets scoped to publishing step, no provider-content artifacts/logs.
- At most four due candidates/twelve checkpoint calls per run, 180-second soft deadline and five-minute workflow timeout. Congestion, provider/Firestore quota and GitHub delay can postpone work.
- Shared app/Firebase/encryption credentials are in GitHub Secrets as appropriate; the same Google client and **existing encryption key** must be configured on the website. Per-owner refresh grants remain encrypted in Firestore. No shared raw user refresh token.
- No exact-minute/unlimited-free promise: standard public-repository runners differ from private-repository minute allowances and larger-runner billing. The workflow skips private repos. Firestore Spark quotas apply to the whole project.

Official scheduling/free-tier references and limits are linked in the Bengali setup guide.

## Product routes

| Route | Purpose |
| --- | --- |
| `/pin-generator`, `/article-writer`, `/content-studio` | Existing generation/edit/download tools; Article Writer adds reviewed publishing |
| `/connector` | Blogger consent, owned website verification, reconnect/disconnect; Pinterest manual instructions |
| `/jobs` | Actual reviewed Blogger checkpoints/results and separate manual Pin packs |
| `/dashboard`, `/automation` | Current publishing overview/setup in default manual-Pinterest mode |
| `/library` | Private owner cloud drafts; guests' device-only saves remain device-only |
| `/subscription`, `/admin/billing` | Existing capacity/reviewer-gated billing; no new payment activation |
| `/login`, `/register`, `/forgot-password` | Existing verified Email/Password and Google authentication |

Old API automation and Worker sources are retained for reference, not silently migrated or enabled. Only the explicit server mode `legacy_api` permits older API functionality; **do not use it for this rollout**. Older docs such as `docs/full-auto-mode.md`, `docs/oauth-activation.bn.md` and earlier verification JSON describe a superseded architecture. The direct reviewed Blogger workflow and its heartbeat are separate from `.github/workflows/pincraft-automation.yml` and its historical OIDC delivery. The old workflow source now additionally requires `LEGACY_PINTEREST_API_SCHEDULER_ENABLED=true`; leave that unset/false. A local source edit does not disable any previously enabled remote workflow.

## Existing security/generation/billing boundaries

Browser Firestore rules remain deny-all; owner APIs use current managed-user checks, HttpOnly signed sessions and server-only Admin. Existing Rules, IAM, indexes, TTL and production settings are not changed by this code delivery. Never stage `uploads/`, `.pki/`, `.env.vercel-import`, real keys, generated logs or dependency/cache directories.

Generation still has server-managed bounded recovery and private usage/idempotency accounting. Safety refusals do not fall back; defaults remain 30 text / 5 image requests per verified owner per UTC day, 150 text / 20 image site-wide. Live image generation downloads real WebP; the manual publishing PNG conversion makes no generation call. No provider identity/secrets/raw upstream objects are exposed through browser operational receipts.

Existing free capacity is one website; additional sites require approved, unexpired subscription capacity. Owner-confirmed historical plan remains ৳99/30 days/total 2+2 including free 1+1. Collection stays closed pending a configured verified reviewer; no payment claim becomes an approval. The historical six-Pin API ledger is not claimed to monitor external manual Pinterest activity.

## Local validation

Run commands only with generated synthetic `demo-pincraft-local` emulator values—not production credentials. Java 21+ is needed for current local emulators. Build/install/tests should be serialized on small-memory machines; build concurrency is bounded in `next.config.js`.

```bash
npm ci
npm run test:firebase:setup
npm run firebase:emulators  # separate terminal
# In a second terminal:
set -a; . .cache/firebase-test.env; set +a
PINCRAFT_PUBLISHING_MODE=blogger_manual_pin npm run test:publishing

# Stop server/emulators before building on small-memory machines.
NODE_OPTIONS='--max-old-space-size=768' npm run build
```

The guide provides the explicit synthetic HTTP preload/Chromium commands for `npm run test:publishing:ui`. These files cannot be activated by an app API flag. The publishing Actions workflow never installs/runs a browser.

Historical unit suites intentionally exercise retained API mode and must be isolated with `PINCRAFT_PUBLISHING_MODE=legacy_api`; their provider replies are synthetic and do not justify activating that mode in production. Do not reuse old API/UI expectations as evidence of the new manual-Pinterest path.
