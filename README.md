# PinCraft — server-side Full Auto Mode

**Live:** https://pincraftly.vercel.app
**Repository:** https://github.com/gmrony135/PinCraft

Next.js workspace with a real, persistent background automation backend. The old device-only automation switch and fabricated Dashboard analytics have been removed.

## Current production status: SETUP REQUIRED

The backend, provider adapters, server-rendered images, authenticated Dashboard and private cloud Library are implemented. **Production PostgreSQL, Google sign-in, encryption/scheduler secrets, provider authorization and the actual external blog destination have not been supplied/configured. No real Google login, AI generation, blog publication or Pinterest post is claimed as completed.**

The user selected **backend first, credentials later**. No paid infrastructure or upgrade has been provisioned. “AUTO MODE IS RUNNING” requires verified connections, ready infrastructure, an enabled database setting and a healthy recent worker heartbeat—not a browser preference.

## Full Auto pipeline

1. Enable once after authenticated connection verification.
2. A protected server schedule checks persistent due jobs every 15 minutes.
3. A new pipeline starts no more frequently than **every 120 minutes**, with **at most 10 completed Pin + Article pipelines per local calendar day**. The default timezone is editable `Asia/Dhaka`.
4. Select the next of **20 configured topics**, or a fresh **Google Trends RSS** title when live-trend mode is selected. Rotation is never labeled live trending; RSS search trends are not Pinterest trend measurements.
5. Use the configured **OpenAI or Gemini** API to generate a Pin title, description, hashtags and a structured **500–850-word** SEO article.
6. Persist the content pack in the account-scoped PostgreSQL Library before publishing.
7. Render and preflight a real **1000×1500 PNG** Pin image on the server; no separate stock-image account is needed.
8. Publish to the authorized **Blogger** blog or an **other-blog HTTPS publisher endpoint**. An additional WordPress adapter is available in the backend, not preselected in the UI.
9. Post a real Pinterest Pin linked to the confirmed article URL; store returned IDs/URLs and actual logs.

The website/browser can be closed. No browser timer generates or publishes automated content. Hosting jitter, API outages, token expiry, quotas and provider permissions can delay or stop work. **10/day is a ceiling, not a delivery guarantee.** No traffic or income is promised.

## Safety and persistence

- PostgreSQL account row locks, a partial unique open-job index, unique scheduled slots, checkpointed content/remote IDs, and eight-minute leases.
- Safe retries at least 15 minutes apart, maximum three attempts. Completed article steps are not republished when only Pinterest needs retrying.
- A timeout, unknown remote result, interrupted publication or uncertain persistence **pauses for review**, rather than blindly duplicating a public post. The owner can verify a real remote ID or explicitly abandon a checked job without recording success.
- OFF prevents the next step; an already in-flight provider request may finish.
- Keys/tokens are **AES-256-GCM encrypted with per-user AAD**, never returned by APIs or written to browser storage.
- Signed HttpOnly Google-verified sessions; same-origin mutation checks; private/no-store API responses; account-isolated reads and pagination.
- Custom HTTPS destinations reject private/reserved addresses, validate every DNS answer, pin the connection to those addresses and refuse redirects. Remote bodies are bounded; AI HTML is escaped; provider exception bodies are not exposed.
- TLS certificates are verified for the cloud database. Preview publishing is disabled unless explicitly authorized for an isolated non-production environment.

See [the complete setup / worker / provider contract reference](docs/full-auto-mode.md). Environment **names only** are in `.env.example`; real secrets must never be committed or pasted into chat.

## Routes and remaining boundaries

| Route | Current behavior |
| --- | --- |
| `/dashboard` | Real server preferences, connections, setup checklist, status, actual job/log history and uncertain-result review |
| `/library` | Private auto-generated cloud content **separate from** manual device saves and labeled examples |
| `/pin-generator` | Existing browser-local manual drafting/copy/save tool; not silently converted into a paid API call |
| `/article-writer` | Existing local manual drafts and explicitly labeled **demo** publication; distinct from real Full Auto publishing |
| `/adsterra-income` | Labeled sample ad reports and inert device-local snippet editor; no live income API |
| `/login` | Verified Google sign-in foundation; genuinely unavailable until its OAuth/session setup is supplied |
| `/`, `/about`, `/contact` | Existing landing, integration overview and working feedback links |

Old `pincraft.automation.v1` values are ignored. Old manual Library saves remain on their device; they are not silently uploaded to an account or misrepresented as provider-published results. The previous UI-first release is recorded in [docs/final-step.md](docs/final-step.md); its automation scope has been superseded.

## Development

Node **20.18+** (local verification: 20.20.2), Next **15.5.29**, React **18.3.1**, Tailwind, `jose`, PostgreSQL/`pg`, `undici`, `ipaddr.js`. White surfaces, Pinterest red **#E60023**, black text, English UI, mobile-first rounded controls.

```bash
npm ci
npm run dev -- --hostname 0.0.0.0
# Stop dev before build; both use .next:
npm run build
npm run start -- --hostname 0.0.0.0
```

With the database environment supplied securely by the operator:

```bash
npm run db:migrate          # transactional/idempotent; no demo success rows
npm run automation:worker   # one bounded server invocation; not a daemon
```

Production uses the static **Vercel Schedules Beta** entry in `vercel.json`, not legacy daily-only Hobby Cron Jobs. No paid upgrade is assumed. The scheduler secret must be captured by a redeployment; a production scheduler heartbeat is still required to confirm execution.

## Verification of this release

**373/373 local checks passed**, including:

| Suite | Checks | What it proves |
| --- | ---: | --- |
| `npm run test:automation` | 44 | Real isolated PostgreSQL; locking/cap/leases/retries; provider payload/error/security contracts using explicit test doubles; one real public Google Trends RSS read |
| `npm run test:automation:ui` | 38 | Actual Next production-build APIs/browser + isolated PostgreSQL; signed test-session/content fixtures; real rendered PNG, cloud pagination, persistent switch, review and responsive UI |
| `node scripts/check-dashboard.js` | 34 | Public setup-required state, no fake Active/Success, CSRF/auth protection, old local ON ignored, 320–1440px layouts |
| `node scripts/check-auth.js` | 35 | Offline generated-key signature/session/nonce guards, **not live Google OAuth** |
| Existing home / Pin / Article / Step 5 suites | 148 | Retained manual tools, copy/save/reader, income demo safety and responsive regressions |
| `node scripts/check-final.js` | 74 | Updated shared/manual workflow, login/setup, navigation, dialogs, storage denial, all nine public routes |

`npm run build` passes; dependency audit: **0 known vulnerabilities** at verification. Browser suites reported **zero console/runtime errors**.

**Important:** Isolated test sessions, provider doubles and seeded database fixtures are not production identities, genuine provider authorizations or live publication evidence. A live end-to-end run remains pending the real account/site setup. The test scripts refuse to seed fixtures against a non-loopback or non-`_test` database.

The public browser suites support `BASE_URL=https://pincraftly.vercel.app`. The configured API/browser suite uses `AUTOMATION_TEST_BASE` and explicitly authorized local-only environment values. Local reports are in ignored `.shots/`; release notes and selected non-secret screenshots are in `docs/`.

The existing post-commit hook automatically pushes commits to GitHub `main`. The agent also handles and verifies the Vercel deployment; no manual Git/deployment step is required from the user.
