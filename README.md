# PinCraft — private content workspace & Pinterest/Blogger automation

Next.js 15.5.29 / React / Node 24 website; Firebase Authentication and owner-scoped Firestore APIs. Manual content tools and unattended publishing are intentionally separate. The website does not expose AI integration names, models, keys, raw upstream errors or historical provider metadata.

## Product routes

| Route | Purpose |
| --- | --- |
| `/` | Product and setup overview, not sample account activity |
| `/pin-generator` | Generate, copy and save an individual Pin draft |
| `/article-writer` | Generate, read and privately save a complete article draft |
| `/content-studio` | Download-only artwork, keyword suggestions, draft plans and editorial reviews |
| `/connector` | Official Pinterest/Blogger consent, owned website verification, reconnect/disconnect |
| `/automation` | Categories, daily quantity, language, timezone, slots and explicit publishing consent |
| `/dashboard` | Only this owner's actual schedules, results, heartbeat, review items and activity |
| `/library` | Signed-in private cloud records; guest browser saves remain device-only |
| `/subscription` | Confirmed plan, actual subscription and reviewer-gated manual references |
| `/admin/billing` | Explicitly allowlisted, currently verified administrator only |
| `/login`, `/register`, `/forgot-password` | Email/Password **and** Google; verification and password reset |
| `/privacy`, `/terms`, `/contact` | Public policies and project support |

Old `/ai-studio` and income links permanently redirect. Simulated publications, injected Library examples, demo income/traffic charts and duplicate dashboard setup controls were removed. Actual legacy article text is retained as a draft, not relabeled as a confirmed publication.

## Setup and operational boundaries

- The existing **16 Vercel Production variables** (including Admin, session/vault and generation configuration) are preserved. The three additional non-secret GitHub workload-scheduler settings were installed through the connected Vercel account and are active in the released Production deployment.
- The authorized index-only deployment is complete: **10 composite indexes + 10 field overrides READY**, TTL policy preserved. Do not redeploy/delete indexes or change Rules/IAM as a routine code release.
- Read-only production checks confirmed Email/Password is enabled, signup is not disabled, the canonical domain is authorized, Google sign-in has a configured client, and the deployed Firestore rules contain a deny-all browser-access rule. These configuration reads are **not a genuine production signup, email-delivery or login round trip**.
- **Pinterest/Blogger OAuth app credentials remain owner-portal prerequisites.** Vercel access does not grant access to those developer consoles or consent on behalf of a user. No fake client ID, grant or connected state is installed.
- Pinterest Trial Pins are visible only to their creator. Public scheduled publishing additionally requires actual Standard-access approval and the server-only `PINTEREST_ACCESS_TIER=standard` attestation. Setting client credentials alone does not activate it.
- Native Firebase Functions/Cloud Scheduler remains an undeployed alternative. **No Firebase/Vercel paid upgrade is authorized or performed.** The primary scheduling path is public-repository GitHub Actions → short-lived OIDC → the existing production worker route.
- Runtime success is evidence-specific: local emulators and HTTP doubles, public production smoke, real scheduled heartbeat, genuine owner sign-in and external publication are separate checks. Never substitute one for another.

**Only unavoidable owner-side developer-portal steps:** [OAuth activation checklist, বাংলা](docs/oauth-activation.bn.md). Server/security details: [full automation architecture](docs/full-auto-mode.md). Historical generation setup: [Firebase + AI guide, বাংলা](docs/firebase-ai-setup.bn.md).

## Automation contract

1. The owner signs in with a verified Email/Password or Google identity. Firebase handles passwords directly; PinCraft APIs accept only verified short-lived tokens at exchange. The seven-day HttpOnly app cookie contains UID/display name, not email or publishing tokens. Each private request checks current managed-user enablement/revocation.
2. Connector separately requests official Pinterest and Blogger consent, reads owned destinations and verifies the selected Blogger administrator site. No provider passwords or manually pasted personal tokens are collected.
3. Automation chooses one or more of the ten requested categories, English or Bengali, an IANA timezone, **1–6 daily Pins** and editable half-hour posting slots at least an hour apart. Saving leaves publishing paused. One nonarchived workflow per Pinterest identity per user prevents overlapping setups.
4. Ongoing publishing needs its own explicit consent. The server privately saves generated content, publishes the linked Blogger article and sends the Pin using revocable encrypted grants while the browser is closed.
5. Provider-confirmed IDs count as published. Ambiguous remote mutations stop for review rather than blind reposting. A definite bounded retry waits an hour, at most three attempts. Missed slots do not cause catch-up bursts, and next work is at least an hour after confirmed publication.

### Global hard limit, not a per-board setting

An immutable provider numeric account ID is hashed into a shared transactionally protected ledger. Across users of this instance, boards, named/legacy campaigns, reconnects, workers and retries, a Pinterest identity may have at most **six confirmed Pins or unresolved attempts per rolling 24 hours**. Confirmed or conservatively abandoned uncertainty counts from persisted confirmation/review time. Unresolved holds do not automatically expire; definitely rejected requests can release their reservation. Missing identity or malformed ledgers fail closed. Timezone, board and subscription changes cannot raise this ceiling. Manual posting and third-party services outside PinCraft are not under its control.

### Subscriptions and collection

Free capacity: **1 Pinterest account + 1 Blogger website**. Owner-confirmed paid terms: **৳99 / 30 days / total 2 Pinterest accounts + 2 Blogger websites**, including the free allowance. Capacity is checked at OAuth, destination save, setup and publication; paid expiry stops extra work without deleting Library drafts.

The billing reviewer is **not supplied yet**. Confirmed prices can display, but **collection, receiving-number instructions, reference submission and activation remain disabled**. No approver is inferred from GitHub/Vercel ownership. The owner-provided bKash/Nagad receiving number is held server-side for later enablement. An authorized verified administrator must independently verify each exact wallet receipt; a transaction claim alone grants nothing. Full references/payer numbers are encrypted and deduplicated globally. Never collect a wallet PIN, OTP or password.

## Private data and generation

All server queries and public projections enforce Firebase UID ownership. Firestore is accessed through server APIs; credentials, ciphertext, PKCE envelopes, generation service/model names and transient access tokens are not returned to browsers. Pinterest access/refresh grants are encrypted and rotation-guarded. Blogger access tokens remain in memory; only its refresh token is persisted. Disconnect pauses linked schedules and deletes local grants; remote revocation is claimed only when confirmed.

Automatic AI failover is bounded and server-managed. Safety refusals do not fail over. Private usage/idempotency accounting fails closed if the database is unavailable. Defaults: 30 text / 5 image logical requests per verified user per UTC day; 150 text / 20 image site-wide. Provider quotas and infrastructure availability remain separate constraints.

Manual AI artwork downloads are real WebP: 1000×1500 Pin / 1200×630 featured. They are not automatically hosted or inserted into an automation. Background publishing instead uses a signed 1000×1500 PNG rendered from the private saved article/Pin. A signed image URL is publicly readable to its holder but does not expose the private Library.

Editorial angles and keyword ideas are not measured Pinterest/search analytics. No exact-minute delivery, permanent permission, traffic, ranking or income guarantee is made.

## Development and validation

```bash
npm ci
npm run dev -- --hostname 0.0.0.0
# Stop dev/start before rebuilding: they share .next.
npm run build
npm run start -- --hostname 0.0.0.0
npm ci --prefix functions
npm run build:functions
```

Website/tooling requires Node 24.x ≥24.12; native worker uses actual Node 22 with its own lockfile. Local Firestore emulator needs Java 21. Firebase Admin remains pinned to 13.10.0 to avoid the reproduced Admin14/JWKS/jose CJS→ESM startup failure. Do not use `audit fix --force` or replace this with an unverified major upgrade.

```bash
npm run firebase:emulators
npm run test:firebase:setup
# Source only the synthetic .cache/firebase-test.env in the isolated test shell.
# Reset-dependent suites MUST run sequentially.
npm run test:auth
npm run test:ai
npm run test:automation
npm run test:workspace
# Configured browser suites additionally require the guarded HTTP-preload server:
npm run test:ai:ui
npm run test:workspace:ui
```

The fixture website must never be exposed as the production service or deployed with test flags. `scripts/ai-http-fixtures.mjs` and `scripts/automation-http-fixtures.mjs` require the explicit `demo-pincraft-local` project and loopback emulators and cannot be activated by HTTP input. The new workspace suite exercises real APIs, Chromium, consent switches, owner isolation, billing administration, auth-transition guards, responsive layouts and a complete Node22 worker run with Chromium closed. External responses and wallet receipts are explicitly synthetic.

Current released application source: **`1c7af7d65d7ca49ed3271f204f1f9fcd1056a013`**, deployed READY/PROMOTED to **https://pincraftly.vercel.app** on Node24. Local suites passed **342/342**, public production browser/API smoke **21/21**, and both dependency audits reported zero vulnerabilities. These are different evidence classes, not 363 genuine external operations.

The actual [GitHub manual OIDC delivery](https://github.com/gmrony135/PinCraft/actions/runs/43561574146) succeeded; an independent Production Firestore read matched its exact `github:43561574146:1` execution ID and finished `ok`. Preflight confirmed zero enabled schedules/connected Pinterest authorizations; no external post was attempted. The workflow schedule is active; this manual delivery does **not** prove that a future cron run will execute at an exact time. A separate real production Firebase SDK negative-login probe produced the expected credential error and no session; genuine owner signup, inbox delivery and successful login remain unverified.

The [release verification report](docs/automation-first-verification.json) records these results and boundaries. Older `docs/*verification.json` files are historical evidence for their named revisions, not proof of the redesigned flows. SQL-era material is archived under `docs/legacy-postgresql/`; there is no automatic migration of provider grants or old identities.

Private attachments, `.env*` except `.env.example`, caches and test artifacts are ignored. Never commit/bundle an Admin credential or user upload. The post-commit auto-push hook is preserved; stage release files explicitly, not with an indiscriminate `git add -A`.
