# PinCraft — Firebase accounts, AI Studio & offline publishing

Next.js frontend + **Firebase Authentication, Cloud Firestore and a native scheduled Cloud Function**. Email/Password or Google login establishes a verified Firebase UID; Pinterest/Blogger require their own password-free publishing consent. No browser timer is responsible for posting.

## Operating status: production Firebase setup required

The Firebase implementation is tested locally, **not connected to a real production Firebase project yet**. The owner supplied public project configuration and AI credentials; secure production Admin authorization, environment import, rules/indexes and native Functions/Scheduler deployment are still pending. Small live Gemini/Groq/Cloudflare inference probes are recorded separately from local provider-double tests. Genuine provider consent and live external publication are not claimed. No paid plan or billing upgrade was activated.

**Owner setup guide (বাংলা): [Firebase + AI secure setup](docs/firebase-ai-setup.bn.md).** The private `.env.vercel-import` is excluded from Git and is not deployed automatically; import it only into the approved Vercel project’s secure Production environment, then add Admin credentials there—not in chat.

Without real setup, the UI stays **Setup required / Not Connected**. An environment declaration alone cannot make it Running: the account also needs its actual saved connections/destinations, an enabled schedule, due work and a fresh healthy server heartbeat.

## What changed

- **Firebase Authentication:** Email/Password signup/login, verification mail, password reset, and Google popup; all identities are verified server-side with Firebase Admin. Passwords go directly to Firebase via its browser SDK, never to PinCraft APIs/storage. The UID—not a caller-supplied owner or localStorage profile—determines ownership. A seven-day signed HttpOnly app cookie contains UID/display name, not email or provider tokens. Disabled, deleted and revoked Firebase identities fail the managed-user session check.
- **Private Firestore:** owner-specific Pins, complete Articles, schedules, due times, posting states, OAuth envelopes, checkpoints, counters and logs. Browser Firestore reads/writes are denied, including credential reads by their own owner. Only owner-checked server APIs and authorized Admin/IAM access the database.
- **Manual saves:** when signed in, Save in Pin Generator / Article Writer writes a private Firestore draft. Failed cloud saves never silently fall back to localStorage. Guest saves remain separately labeled device-only tools. Saving a draft never queues or publishes it.
- **Offline scheduler:** `pincraftAutoPost` uses Firebase Functions v2 `onSchedule`, UTC `*/30 * * * *`, region `asia-south1`, Node 22. It reads due Firestore work and uses that owner's saved provider authorization while their browser/phone is off. Old Vercel schedules and active PostgreSQL dependencies are removed.
- **AI Studio:** Gemini → Groq text/model failover for Pins, articles, keyword clusters/hashtags, seven-day draft plans and editorial quality reviews. Structured validation, per-user/global Firestore budgets, idempotency and safety-refusal stop rules. Never a silent offline-template fallback.
- **AI artwork:** Cloudflare FLUX.1 → FLUX.2 klein, actual decoded/resized WebP downloads for Pins and blog featured images. No automatic public upload or publication.
- **Publishing images:** public HTTPS image links; **Firebase Storage is not required**. Generated mode can serve a signed 1000×1500 PNG from saved Firestore content.

The Cloud Library separates Pins from Articles and private cloud records from device examples. Dashboard shows waiting work, confirmed published links, Next Post Time, Total Published, Failed Posts, connection status and Disconnect.

## Password-free publishing workflow

1. Sign in with verified Email/Password or Google through Firebase Authentication.
2. Dashboard → **Connect Pinterest**; Allow is on `https://www.pinterest.com/oauth/`. Connect Blogger separately on Google's consent page for generated articles.
3. Choose your own authorized public Pinterest board and, for generated mode, a live Blogger blog with administrator permission. Destination save rechecks ownership and leaves posting paused.
4. Choose a schedule, for example **5 Pins/day, 120 minutes apart**. Queue a Pin with title, description, public HTTPS image and destination URL; or select generated Pin + Blogger Article mode and verify managed Gemini/Groq fallback or an optional personal OpenAI/Gemini/Groq key with explicit usage consent.
5. Confirm publishing consent and enable Full Auto once. Firebase checks due work every **30 minutes**, independently of the browser. Polling/provider delays can make a due post later; this is not an exact-minute guarantee.
6. A confirmed retryable failure waits **1 hour**, at most three automatic attempts. An ambiguous remote result or database failure after acceptance requires owner review—no blind duplicate repost.
7. Inspect the actual Pin URL, logs and metrics. Pause or Disconnect stops later steps; a request already sent may still finish.

Bounds: 1–10 Pins/day, 30–1440-minute spacing in 30-minute steps, editable IANA daily-reset timezone. Default: 10/day, 120 minutes, Asia/Dhaka. No catch-up bursts or traffic/income guarantee.

## Credential and queue safety

Pinterest persists per-UID encrypted **access token + refresh token**, expiry metadata and atomic rotation. Blogger persists **refresh token only**; its access token stays transient in server memory. Optional AI keys are encrypted separately. Publishing consent never collects provider passwords or manually pasted Pinterest/Blogger tokens. PinCraft account passwords are handled only by Firebase Auth.

OAuth uses ten-minute single-use state bound to owner/provider/HttpOnly browser nonce, PKCE for Blogger, fixed HTTPS callbacks, purpose-bound AES-256-GCM, 90-second refresh leases and revision/token-version guards. Firestore transactions protect per-owner eight-minute job leases, quota and queue idempotency. External calls are outside transactions. No exactly-once guarantee is invented across Firestore and external providers.

Public images are validated before queueing/posting: HTTPS, public pinned DNS, no redirects/private-network access, bounded PNG/JPEG/WebP bytes. Twenty editable topics remain, including Sad Quotes, Love Quotes, Motivation, Good Morning and Islamic Quotes. Google Trends RSS is explicitly distinguished from rotation and Pinterest measurements.

**Disconnect is honest:** Blogger revocation is marked confirmed only after Google's successful response. Pinterest personal OAuth currently needs the user to remove the app in Pinterest settings; local token deletion is never mislabeled as successful provider-side revocation.

## Live connection is the next authorized step

See **[Firebase setup, deployment, IAM, billing and verification](docs/full-auto-mode.md)**. `.env.example` contains variable names only. The agent handles Git and deployment once the owner supplies project details, secure server authorization and any required explicit billing approval. Never put an Admin private key, provider secret or password into chat/Git.

Register the exact provider callbacks:

```text
https://pincraftly.vercel.app/api/integrations/pinterest/callback
https://pincraftly.vercel.app/api/integrations/blogger/callback
```

Scheduled Functions/Cloud Scheduler require a billing-enabled Firebase project and can incur charges. No upgrade/provisioning/deployment is authorized merely by adding the code. Firestore rules/indexes and production IAM must be deployed and checked; the emulator cannot prove production IAM, composite-index readiness or a genuine scheduled invocation.

## Development & verification

Website/tooling: **Node 24.x ≥24.12**, Next 15.5.29, React 18.3.1, Firebase JS/Admin SDK. Scheduled Functions deliberately use **Node 22** with their own lockfile. Local Firestore emulator requires Java 21. English UI: white, Pinterest red **#E60023**, black text, rounded mobile-friendly controls.

```bash
npm ci
npm run dev -- --hostname 0.0.0.0
# Stop dev before build: they share .next.
npm run build
npm run start -- --hostname 0.0.0.0

# Install the Functions package and build its shared worker bundle:
npm ci --prefix functions
npm run build:functions

# Local-only guarded demo emulators and test environment, described in docs:
npm run firebase:emulators
npm run test:firebase
npm run test:auth
npm run test:ai
# AI browser SDK/UI suite needs the separate guarded AI HTTP preload:
npm run test:ai:ui
npm run test:automation:ui
```

Historical Firebase-migration results remain in **[docs/automation-verification.json](docs/automation-verification.json)**; the added Email/Password and AI scope has its own **[docs/firebase-ai-verification.json](docs/firebase-ai-verification.json)** report. The configured suite uses real local Auth/Firestore emulators, actual Next APIs and Chromium. Synthetic Google-provider identities and explicit OAuth/AI/posting response doubles are **not genuine consent or live posts**. It also invokes the same native scheduled-function bundle with Chromium fully closed, not a deployed Scheduler job. HTTPS image fetches, PNG rendering and Google Trends reads are actual.

Historical SQL results/schema are archived under `docs/legacy-postgresql/`; they are **not Firebase verification**. There is no active SQL migration or automatic import/mapping of old Google IDs or provider grants to Firebase UIDs. Fresh provider consent is required.

The post-commit auto-push hook is preserved; the agent commits/pushes and verifies deployment. No manual user Git steps are required.

## Runtime compatibility

Firebase Admin is pinned to **13.10.0**. Admin 14’s JWKS dependency synchronously
requires ESM-only `jose`, which reproduced Vercel’s `ERR_REQUIRE_ESM` when Node’s
experimental `require(esm)` feature was disabled. Do not blindly restore that
combination. Root and Functions lockfiles override `uuid` to **11.1.1** and gRPC
to **1.14.7**; dependency audits and the actual Node 22 worker are rechecked.
Root tooling also pins patched Glob **14.0.2** and OpenTelemetry Core **2.10.0**;
Firebase CLI startup, tracing and archive/glob compatibility are checked rather
than downgrading the CLI to silence development-tool advisories. Functions also
pins its transitive `@firebase/database-compat` to **2.1.7**: 2.1.8 requires Node
24, while the worker deliberately remains on Node 22. Its clean install is
checked with `--engine-strict` under the actual worker runtime.
Use `NODE_OPTIONS=--no-experimental-require-module` when verifying startup.
