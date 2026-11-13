# Firebase private Library + offline publishing

## Scope and honest status

PinCraft now uses **Firebase Authentication for verified Email/Password and Google identity, Cloud Firestore for owner-private persistence, and Firebase Cloud Functions + Cloud Scheduler for 30-minute background checks**. Firebase Auth does not supply or persist a Pinterest/Blogger publishing grant: each provider has its own separate OAuth consent.

**Live Firebase setup remains pending.** Public configuration for `pincraft-ly` has been supplied, but no secure production Admin authorization, Firestore production rules/indexes, Functions deployment, Scheduler delivery, provider approval/consent or live publication has been verified. Local emulator/fixture success is not production connection evidence. No billing upgrade or paid service was activated.

The manual guest tools remain device-only and clearly separate. Signed-in manual saves go to private Firestore drafts; the old Article Writer publishing preview remains an explicitly labeled local demo, not an external publication. No Firebase Storage upload is needed: the requested image links are sufficient.

## Owner workflow

1. Sign in with verified Email/Password or Google. Account passwords go directly to the Firebase browser SDK, not PinCraft APIs. Google uses its own popup. Email verification and password reset are supported.
2. Dashboard → **Connect Pinterest** sends the owner to `https://www.pinterest.com/oauth/`. Blogger consent is separately requested on Google's OAuth page when article publishing is needed.
3. Load/select a **public board owned by that authorized Pinterest account** and, for generated mode, a **live Blogger blog with administrator access**. Saving destinations verifies ownership and leaves posting paused.
4. Choose the saved Pin queue, or generated Pin + Blogger Article mode. Generated mode supports managed Gemini/Groq fallback or an optional personal OpenAI/Gemini/Groq key, verified with explicit usage consent. Managed requests use the same Firestore budgets as AI Studio.
5. Save a schedule such as **5 Pins/day, every 120 minutes**. Bounds: 1–10/day, 30–1440 minutes in 30-minute steps. Defaults: 10/day, 120 minutes, Asia/Dhaka.
6. Queue title, description, public HTTPS image link, destination and optional due time; or choose generated topics. A private Library draft is **not** automatically queued/published.
7. Explicitly consent to scheduled publishing and turn Full Auto ON. Native Firebase checks Firestore every **30 minutes**, even with the phone/browser off.
8. Dashboard shows waiting/published work, Next Post Time, Total Published, Failed Posts, actual provider-confirmed links and errors. Pause/Disconnect stops future steps; already-sent requests may finish.

IANA timezone controls daily resets; date inputs convert the device's local time to UTC. Displayed dates are due times, not exact-delivery guarantees. Provider delays and scheduler delivery can postpone work. No traffic/income guarantee.

## Firebase identity and session boundary

`lib/firebase/client.js` lazy-loads only Firebase App/Auth when a configured sign-in button is clicked. Auth is initialized with **in-memory persistence**, Google popup or Firebase email/password methods, then a verified ID token is sent to the same-origin server and client Auth is immediately signed out. Firebase credentials are not saved to localStorage.

The server:

- Requires a matching 256-bit browser nonce and same-origin bounded JSON POST.
- Uses Firebase Admin `verifyIdToken(token, true)`; requires Google or password provider, verified email claim and recent `auth_time` (five minutes).
- Creates PinCraft's **own signed app cookie**, `pincraft.session.v2`: Firebase UID, display name, project, original authentication time and normal signed-cookie metadata. This is not Firebase Admin's native session-cookie API. It does not contain email, Firebase ID token, Pinterest/Blogger tokens or passwords.
- Uses HttpOnly, SameSite=Lax, path `/`, seven-day expiry and Secure over HTTPS. Each authenticated API request checks the managed Firebase user for deletion, disablement, provider identity and revocation time.
- Ignores caller-supplied owners and old localStorage/custom-Google sessions. Sign-in clears the old v1 cookie. Sign-out expires app/nonce cookies, refreshes other open tabs and removes private cloud UI; existing guest device saves are not erased.

Firebase/Google maintain their own identity profile under their services. PinCraft checks verified email transiently and stores no Gmail/password in its account records. A compromised Admin identity or session-signing secret is privileged; protect, scope and rotate deliberately.

## Private Firestore layout and access

| Path | Contents |
| --- | --- |
| `pincraft_accounts/{sha256(firebaseUid)}` | UID, schedule, destinations, due pointers, enabled state, counters, separately encrypted optional AI configuration |
| `.../connections/{pinterest\|blogger}` | Owner/provider-bound encrypted OAuth envelope, expiry, scopes, status, revision/token versions and refresh lease |
| `.../oauthAttempts/{provider}` | Ten-minute hashed single-use state, hashed browser binding and encrypted Blogger PKCE verifier |
| `.../requests/{uuid}` | Owner-scoped queue/draft request fingerprint and resulting job ID for idempotency |
| `.../aiRequests/{uuid}`, `.../aiUsage/{UTC-day}` | Private bounded AI request receipts, leases and daily counters; no image bytes or raw input prompts |
| `pincraft_system/ai-{UTC-day}` | Cross-instance site-wide AI daily caps and leases |
| `.../logs/{id}` | Bounded API activity views; no raw token/code/password logging |
| `pincraft_jobs/{uuid}` | Owner UID, kind, title/description/content/image/destination links, due time, saved original targets, posting/checkpoint/retry state, confirmed result URLs |
| `pincraft_system/heartbeat` | Actual last worker start/finish/status; never inserted as production sample success |

`firestore.rules` denies **all direct browser/REST client reads and writes**, including a signed-in owner reading their own credential document. The app deliberately uses no browser Firestore SDK. Authenticated server APIs enforce UID ownership and return only allow-listed public fields; Library cursors are also owner-checked. Private requests use no-store headers. Guests cannot read private cloud Pins/Articles.

**Admin SDK bypasses security rules.** The website and Function therefore need restricted IAM identities and explicit server ownership checks. Rules alone cannot protect against a leaked Admin key. Deploy `firestore.indexes.json` and wait until every required composite/collection-group index is READY. The local emulator does not enforce production composite-index availability. Ciphertext, AI credentials, PKCE envelope and full article content are excluded from indexing.

A Firestore transaction atomically updates the job, relevant owner counters and due pointers. Posting, refresh, OAuth callback and request-idempotency races are coordinated through Firestore transactions; network/provider calls are outside transactions.

### Manual saves

Signed-in `POST /api/library` validates/allow-lists the complete draft and persists a `pin_draft` or `article_draft`, state `draft`, with owner/request fingerprint. Same-key duplicates return one ID; a changed payload with that key returns 409. A failed server save cannot show Saved or silently write localStorage instead. UI completion is bound to the identity and content being saved.

Article saves retain intro, sections/paragraphs, list, conclusion, keywords and complete plain text. Pin saves retain title choices, description, hashtags, topic and optional HTTPS links. Library separates manual article versus Pin types, generated packs, scheduled drafts and actual published URLs. User-requested public images/published posts are intentionally public; private Library APIs are not.

## Operator configuration — no secrets in chat or Git

`.env.example` lists names, not real values. Use trusted environment/secret-management channels. Public Firebase web config may be supplied for connection planning; **never paste an Admin key or provider secret into chat**.

| Variable | Website | Native Functions |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | The selected real project ID | Same project, or injected `GCLOUD_PROJECT` |
| `FIREBASE_WEB_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_APP_ID` | Public web-app config; auth domain exactly `<project>.firebaseapp.com` | Not needed |
| `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` | Dedicated least-privilege server Admin identity in secure deployment env; key supports escaped newlines | **Do not copy this key**: use runtime service account/ADC |
| `AUTH_SESSION_SECRET` | Separate strong random secret, at least 32 characters | Not needed by scheduled worker |
| `APP_URL` | Exact public HTTPS origin with no path/query | Same origin; generated image links must be publicly reachable |
| `AUTOMATION_ENCRYPTION_KEY` | Exactly 32 random bytes in standard base64 | **Same value**, Secret Manager binding |
| `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET` | Actual approved Pinterest app | Same app ID; secret through Secret Manager |
| `BLOGGER_CLIENT_ID`, `BLOGGER_CLIENT_SECRET` | Google OAuth Web app, Blogger API enabled | Same app ID; secret through Secret Manager |
| `GEMINI_API_KEY`, `GROQ_API_KEY` | Live AI text fallback; server-only | Secret Manager bindings for managed generated mode |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Downloadable AI artwork; server-only | Not required by the current public-rendered-image worker |
| `FIREBASE_SCHEDULER_CONFIGURED=1` | Set **only after** authorized scheduled deployment and IAM verification | Not required by the native handler |
| `CRON_SECRET` | Optional protected maintenance HTTP endpoint | Not used by native Scheduler/IAM trigger |

No `DATABASE_URL`, old `GOOGLE_CLIENT_ID` login flow, SQL migration or Firebase Storage bucket is required. The current scheduled export binds five named secrets (vault, Pinterest app secret, Blogger app secret, Gemini key and Groq key); the operator must supply/authorize them before deploying that combined export.

Firebase Console prerequisites:

- Select the owner's actual project/web app. Enable **Authentication → Email/Password and Google** and authorize the canonical website domain `pincraftly.vercel.app` (plus only deliberately allowed development/custom domains).
- Use Firestore `(default)` in production mode with the location agreed by the owner; location and IAM are not guessed/provisioned without approval.
- Give website server identity only the Firebase Auth user-verification/read and Firestore access it needs. Give the runtime Function identity Firestore access and access to its five secret bindings. Do not make either identity an Owner or put Admin credentials in `NEXT_PUBLIC_*`.
- Configure real Pinterest/Google OAuth applications, consent/approval, redirect URLs and API permissions. Firebase Google login and Blogger publishing are separate grants even if the operator uses one Google project.

Exact provider callbacks:

```text
https://pincraftly.vercel.app/api/integrations/pinterest/callback
https://pincraftly.vercel.app/api/integrations/blogger/callback
```

Start consent on that same canonical host. A preview alias is never silently substituted into an approved callback. Firebase's Google provider also uses its own configured Firebase Auth handler; it is not the Blogger callback above.

### Authorized deployment order and billing gate

**Functions/Cloud Scheduler require a billing-enabled Firebase/Google Cloud project and may incur charges**, including execution, scheduling, Firestore, secret/artifact storage and network usage. No billing activation, API enablement, new project/database, location choice or paid deployment is authorized solely by this code change. Obtain explicit owner approval first; local emulators do not require a paid cloud deployment.

After approval and secure access, the **agent/operator**, not the user manually running Git, performs:

1. Verify project/web config, provider apps, chosen database location, billing consent and least-privilege IAM. Do not log secrets.
2. Install locked dependencies; build the website and `npm run build:functions`. `firebase.json` also runs this shared-source build before Functions deployment.
3. Deploy the deny-all Firestore rules/indexes to the correct explicitly selected project; wait for indexes READY. Verify denied anonymous/client-token access plus successful owner-scoped server access.
4. Configure the five authorized Secret Manager bindings, non-secret `APP_URL`/provider client IDs in Functions environment, and the runtime service account. The function region currently defaults to `asia-south1`; confirm region/location suitability before deployment.
5. Selectively deploy codebase `pincraft-automation` / export `pincraftAutoPost`, Node 22. Firebase CLI creates the native Scheduler job and IAM-bound invocation. Confirm that **anonymous invocation is denied**, the Scheduler service identity is permitted, and UTC `*/30 * * * *` is correct. Do not make the Function public or rely on a spoofable schedule header.
6. Configure the website's secure Admin/session/vault/app settings and verify Firebase Email/Password and Google sign-in. Once native deployment/IAM is confirmed, declare `FIREBASE_SCHEDULER_CONFIGURED=1` and redeploy the website. This flag is not execution proof.
7. Observe an actual scheduled heartbeat, inspect its status, obtain genuine owner provider consent and verify destinations. No fixture Connected/Published records are inserted into the production project.
8. With explicit publishing consent, enable one controlled real scheduled Pin (and Blogger article if selected). Verify the provider's real URL and a later browser-off dispatch. Only then describe production offline posting as verified.

The existing post-commit hook automatically pushes main; the agent handles/verifies website deployment. Git/website deployment alone does **not** deploy Firebase resources or enable billing.

### Previous SQL data

Old SQL schemas and verification are retained only in `docs/legacy-postgresql/`. Active PostgreSQL dependencies, migration runner and Vercel schedule are removed. There is **no automatic legacy Google-ID → Firebase-UID mapping or token import**. If a real legacy database is later supplied, pause its worker, back it up and plan an explicit owner-proven content migration; obtain new Firebase login and fresh provider consent. Never guess ownership or silently reactivate old credentials.

## OAuth contracts and Disconnect

Pinterest authorization requests exactly:

```text
pins:read,pins:write,boards:read,boards:write,user_accounts:read
```

Exchange/refresh: form POST `https://api.pinterest.com/v5/oauth/token`, HTTP Basic app credentials, exact redirect on code exchange, and `continuous_refresh=true` for legacy-app compatibility. Persist only encrypted `{accessToken, refreshToken}` plus separate expiry/status/version metadata. Refresh with a five-minute margin; maintenance includes paused connected accounts before continuous-refresh expiry, with seven-day refresh-expiry safety. Provider rotation is committed atomically.

Blogger requests scope `https://www.googleapis.com/auth/blogger`, offline access, fresh consent and PKCE S256. Both initial save and rotation allow-list **only `{refreshToken}`** into its encrypted envelope. Access tokens are transient. Missing refresh permission fails closed. Public live/admin blog verification precedes publishing. Articles use escaped HTML and a per-job marker and are checkpointed before the linked Pin.

Binding/safety: ten-minute state bound to UID/provider/HttpOnly browser nonce; 256-bit random hashed state and browser values; encrypted PKCE verifier; no stored authorization code. AES-256-GCM uses fresh IVs and authenticated data bound to owner/purpose. A 90-second refresh lease plus grant/token versions prevents simultaneous rotation, stale overwrite or token resurrection after Disconnect.

**Disconnect commits local token deletion, pause, OAuth-attempt removal and revision invalidation first**. A request already sent may finish; no later step is authorized by deleted grants.

- Blogger: POST the removed refresh token to Google's revoke endpoint. Only a confirmed response yields `revoked`; otherwise retain deletion and show a Google Account permissions link.
- Pinterest: its documented revoke endpoint supports system-user tokens, not the personal authorization-code grants here. Save `manual_required`, delete local tokens and link to Pinterest Settings → Security and logins → Apps. Never invent successful remote revocation.

Provider consent may expire/be revoked; app approval/testing mode/quotas can require renewed consent. No code promises permanent authorization. Operators must redact callback query strings and credentials from external APM/proxy logs too; application code does not log raw OAuth requests/responses.

## Scheduled worker, quotas and uncertainty

`functions/index.mjs` exports `pincraftAutoPost` with Functions v2 `onSchedule`: **every 30 minutes UTC**, Node 22, `asia-south1`, timeout 300 s, 512 MiB, min instances 0, max instances 1, concurrency 1 and Scheduler retry count 0. Shared server modules are bundled by esbuild into ignored `functions/runtime/index.mjs`; no secrets are embedded. `functions/package.json` has its own runtime/lockfile.

Each invocation performs bounded token maintenance and expired mutation recovery, then processes at most **12 claim slots, up to three accounts concurrently**, with a bounded drain deadline. More due accounts wait for a later dispatch. This is a small initial deployment, not an unlimited-volume queue service. Redelivery/overlap remains safe through Firestore transactions even with platform concurrency limits.

Firestore enforces one active owner job, eight-minute leases, request-fingerprint idempotency, earliest eligible queued due time, local-day successful-completion quota and configured cadence. Confirmed completion pushes the next new-job time at least one interval ahead; OFF/ON does not permit catch-up bursts. Retries also obey lease/quota rules.

- Confirmed retryable failure: wait **60 minutes**, max three automatic attempts, preserve saved content and already-confirmed Blogger result; post only unfinished work.
- Revoked/auth/configuration errors: pause and require correction rather than retry indefinitely.
- Timeout, ambiguous mutation 5xx/malformed result, expired publishing lease, or Firestore failure after external acceptance: `attention`, owner review and pause, **never blind repost**.
- Review must verify a real provider ID, board/destination or Blogger job marker, or explicitly abandon after checking the remote destination. Saved target snapshots prevent retries silently moving to another board/blog.

No exactly-once guarantee spans external providers and Firestore. Heartbeat older than 45 minutes or error is **Awaiting server worker**, not Running. Empty queue is waiting, not fabricated publication.

The optional `POST /api/internal/automation/tick` remains a bounded, constant-time Bearer-protected maintenance path. Native Firebase Scheduler **does not call it or need `CRON_SECRET`**; it invokes the native IAM trigger. The CLI `npm run automation:worker` is one invocation, not a daemon or permanent scheduler. Preview/local execution is blocked unless explicitly authorized for isolated synthetic tests.

## Image safety

No Storage bucket is provisioned. Queued PNG/JPEG/WebP images must be public HTTPS, ≤5 MiB, no login/redirect/private/custom-port URLs, valid magic bytes and public pinned DNS. Image bytes are checked at queue insertion and before posting; destination URLs must also resolve publicly. Unknown provider hosts cannot receive Bearer secrets.

Generated mode renders a signed **1000×1500 PNG** from saved Firestore content. HMAC URLs bind a single job, contain no provider token and are checked for public reachability/dimensions before publishing. Intentionally public/published images may be cached by providers; Disconnect does not delete external posts or cached images. Back up the vault/signing key: changing it invalidates stored grants and existing signed image links and needs a migration plan.

## API surface

| Endpoint | Access/effect |
| --- | --- |
| `GET /api/auth/config` | Public Firebase web config + HttpOnly browser nonce, no Admin secret |
| `POST /api/auth/firebase` (legacy `/google` alias) | Same-origin nonce-bound Firebase ID-token verification and v2 app cookie |
| `GET /api/auth/session`, `POST /api/auth/logout` | Managed-user check / same-origin cookie expiry |
| `GET /api/ai/status` | Public server-configuration flags and app caps, not a live quota/connectivity guarantee |
| `POST /api/ai/generate` | Same-origin verified owner, explicit usage consent, UUID request key, allowlisted task and transactional budget |
| `GET /api/ai/usage` | Owner-private daily text/image counters; provider charges/quotas are separate |
| `GET /api/automation` | Guest-safe empty state or owner's real metrics/logs/queue |
| `POST /api/integrations/{provider}/start` | Same-origin owner, registered app callback, consent URL |
| `GET /api/integrations/{provider}/callback` | Owner/browser/state-bound one-time exchange, clean redirect |
| `GET /api/integrations/{provider}/resources` | Own authorized public boards/admin blogs |
| `POST /api/integrations/{provider}/disconnect` | Confirmed local deletion/pause, honest remote revoke outcome |
| `POST /api/automation/settings` | Preferences, destinations, explicit enable, optional AI access; passwords/manual publishing tokens rejected |
| `POST /api/automation/queue`, `/api/automation/review` | Own idempotent queue/cancel/retry or checked remote-result review |
| `GET /api/library?cursor=` | Owner-private 20-item pages, owner-checked cursor |
| `POST /api/library` | Owner-private complete manual Pin/Article draft, never implicit publication |
| `GET /api/automation/image/{id}?sig=` | Intentionally public signed PNG, not private Library access |
| `POST /api/internal/automation/tick` | Optional protected maintenance, not browser publication or native scheduler endpoint |

## Reproducible local verification

Use Node ≥24.12 for website/tooling, Java 21 for the Firestore emulator, and Node 22 to check the deployed-runtime bundle. Do not point tests at real Firebase projects or use real provider credentials.

```bash
npm ci
npm ci --prefix functions
npm run test:firebase:setup       # excluded 0600 synthetic .cache/firebase-test.env
npm run firebase:emulators       # explicit demo-pincraft-local, loopback Auth/Firestore
```

In a separate local test terminal, source only the excluded synthetic test environment:

```bash
set -a; . .cache/firebase-test.env; set +a
export NODE_OPTIONS=--no-experimental-require-module
npm run test:firebase
npm run test:auth
npm run test:ai
npm run build:functions
npm run build

# Separate terminal, same synthetic test env, Node 24. No real API keys here:
set -a; . .cache/firebase-test.env; set +a
export NODE_OPTIONS=--no-experimental-require-module
AUTOMATION_HTTP_FIXTURES=1 \
  GEMINI_API_KEY=isolated-gemini-api-key-fixture \
  GROQ_API_KEY=isolated-groq-api-key-fixture \
  CLOUDFLARE_ACCOUNT_ID=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  CLOUDFLARE_API_TOKEN=isolated-cloudflare-token-fixture \
  node --import ./scripts/ai-http-fixtures.mjs \
  node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port 3001

# Back in the test terminal, once that server is ready, run sequentially:
BASE_URL=http://127.0.0.1:3001 npm run test:ai:ui
# Select an actual Node 22 executable for the browser-closed child invocation:
FIREBASE_FUNCTIONS_NODE="$(command -v node22)" \
  NODE_OPTIONS='--no-experimental-require-module --conditions=react-server' \
  npm run test:automation:ui
AUTOMATION_HTTP_FIXTURES=1 node22 --no-experimental-require-module \
  --conditions=react-server --import ./scripts/automation-http-fixtures.mjs \
  scripts/check-functions.mjs
```

`node22` denotes the operator's installed Node 22 executable, not an npm script. `FIREBASE_FUNCTIONS_NODE` may optionally select that executable for the configured UI suite's browser-closed child invocation. Tests reset **only** explicitly authorized `demo-pincraft-local` emulators and must run sequentially, not against shared production data. The optional HTTP preload refuses non-loopback hosts and production; it is never imported by the application or activated through an API input. Never upload the synthetic test env or set its emulator/non-production flags in a real deployment.

See `docs/firebase-ai-verification.json` for the expanded Email/Password/AI regression results; `docs/automation-verification.json` retains the earlier Firebase-migration run, not new-feature or production proof. Real Auth/Firestore emulators, Next routes, browser UI, private owner isolation, rules denial, transactions, signed PNGs and browser-closed native bundle execution are exercised. Google-provider identities and provider consent/AI/publication responses are **explicit test doubles**; they do not prove genuine consent or external publication. Actual public HTTPS PNG and Google Trends RSS are read.

The production-only gates remain: supplied real project/config, secure Admin IAM, deployed/index-ready rules, approved billing and native Function/Scheduler, observed scheduled invocation, genuine provider owner consent and one verified real post/offline follow-up. The old SQL counts are not reused as Firebase evidence.

For the expanded account/AI setup, download-only image limitations, provider models, app budgets, logical receipt expiry and the no-paid-upgrade gate, see [the Bengali operator guide](firebase-ai-setup.bn.md).

## Primary references

- [Firebase Google sign-in](https://firebase.google.com/docs/auth/web/google-signin)
- [Firebase Admin ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [managed sessions/revocation](https://firebase.google.com/docs/auth/admin/manage-sessions)
- [Firestore server security/IAM](https://firebase.google.com/docs/firestore/security/overview), [indexes](https://firebase.google.com/docs/firestore/query-data/indexing)
- [Firebase scheduled Functions](https://firebase.google.com/docs/functions/schedule-functions), [runtime management](https://firebase.google.com/docs/functions/manage-functions)
- [Local Emulator Suite](https://firebase.google.com/docs/emulator-suite/install_and_configure)
- [Pinterest OAuth](https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/), [official API description](https://github.com/pinterest/api-description), [revoke restrictions](https://developers.pinterest.com/docs/api/v5/token-revoke/)
- [Google offline OAuth/revocation](https://developers.google.com/identity/protocols/oauth2/web-server#offline), [Blogger admin verification](https://developers.google.com/blogger/docs/3.0/reference/blogUserInfos/get), [posts.insert](https://developers.google.com/blogger/docs/3.0/reference/posts/insert)

References describe provider contracts, not this application's live account approval or operating status.
