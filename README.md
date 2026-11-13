# PinCraft — password-free offline auto posting

**Website:** https://pincraftly.vercel.app · **Repository:** https://github.com/gmrony135/PinCraft

Next.js app with persistent, per-user Pinterest + Blogger OAuth publishing, a cloud Pin queue, optional AI-generated Pin + Article pipelines, and a protected server worker. No account password collection or application-global posting token.

## Production status: SETUP REQUIRED

The implementation is deployed separately from configuration. **Production PostgreSQL, Google sign-in/session configuration, encryption/worker secrets, provider OAuth app credentials/approval and genuine owner consent have not been supplied. No real Pinterest/Blogger connection or live publication is claimed.** No paid service or upgrade was provisioned.

Running status requires ready infrastructure, the account's own saved authorizations/destinations, an enabled server schedule and a fresh worker heartbeat. A browser-local switch or fixture cannot make production Connected/Running/Published.

## Condition 1 workflow

1. Sign in with verified Google Identity Services.
2. Dashboard → Settings → **Connect Pinterest** / **Connect Blogger**. Login/Allow happens on the providers' own pages, never a PinCraft Gmail/password form.
3. Load and select your owned public Pinterest board and, for generated articles, your owner/admin Blogger blog.
4. Save a schedule, e.g. **5 Pins/day, 120 minutes apart**, and queue original Pins with public HTTPS images. Or choose automatically generated Pin + Blogger Article mode and verify your OpenAI/Gemini API key.
5. Confirm real scheduled publishing and enable Full Auto once. Close the browser: a protected **30-minute** server dispatch claims due database work.
6. Provider-confirmed publication saves the real Pinterest ID/link; confirmed retryable failures wait **1 hour**, up to three automatic attempts. Uncertain external results pause for review rather than risk duplicates.
7. Dashboard shows **Connected / Not Connected**, **Next Post Time**, **Total Published**, **Failed Posts**, actual logs and published links. Pause or Disconnect stops future work; a request already sent may finish.

Configurable bounds: 1–10 Pins/day, 30–1440 minutes between new posts in 30-minute steps. Default is 10/day, 120 minutes, editable Asia/Dhaka daily-reset timezone. Limits are ceilings, not promised delivery. Hosting jitter (up to 15 minutes), API outages/quotas and revoked/expired consent can delay or stop work. No traffic/income guarantee.

### What is persisted

- PostgreSQL: owner-isolated schedules, queue/content, checkpoints, actual publication IDs/URLs, retry/error logs and worker heartbeat.
- Pinterest: per-user, per-provider AES-256-GCM encrypted **access + refresh tokens**, with expiry metadata and background rotation.
- Blogger: encrypted **refresh token only**. Its access token exists only transiently in server memory, including during callback and refresh.
- Optional AI key: encrypted separately, never stored in browser storage or returned by APIs.
- Sign-in stores only stable Google user ID and display name in the signed session, not a Gmail/email address. Google email verification is transient.
- No account passwords or manually pasted Pinterest/Blogger publishing tokens. Legacy manual/WordPress password-based adapters are removed and migration v2 clears their old encrypted bundle.

### Disconnect limitation, disclosed rather than faked

Google revocation is requested after local Blogger token deletion; only a confirmed response is labeled revoked. Pinterest's documented revoke endpoint currently supports system-user tokens, not personal authorization-code grants. Pinterest Disconnect therefore deletes local tokens/stops posting and links to **Pinterest Settings → Security and logins → Apps** for the owner to remove provider consent. Local deletion is never mislabeled as successful remote revocation.

## Safety and existing tools

- Session-owner + provider + HttpOnly browser nonce + ten-minute, single-use state; Google PKCE S256; fixed registered HTTPS callback URLs.
- Same-origin bounded JSON mutations, private/no-store responses, account-isolated reads and pagination. OAuth codes/tokens are not written to application logs or client storage.
- Versioned token refresh leases prevent rotation races and resurrection after Disconnect/new authorization.
- Per-account row locks, one active job, eight-minute leases, quota by actual completion/local day, saved target snapshots and cadence with no catch-up bursts.
- Network-ambiguous publication or DB failure after remote acceptance stops for explicit inspection. There is no false exactly-once guarantee spanning two providers and PostgreSQL.
- Public HTTPS image validation, pinned all-public DNS, no redirects/private-network SSRF, bounded PNG/JPEG/WebP bytes. Generated mode renders/preflights actual signed **1000×1500 PNGs** after saving the article pack.
- Generated mode retains 20 editable topic defaults or fresh **Google Trends RSS** titles, not mislabeled Pinterest trend measurements. Structured 500–850-word articles, escaped HTML and respectful original religious reflections; no invented scripture/quotations.

`/library` separates private cloud Pins/Articles from device saves and labeled examples; queued Pins never masquerade as generated articles. `/pin-generator` and `/article-writer` remain browser-local manual tools with explicitly labeled demo publication. `/adsterra-income` remains a labeled sample report/snippet editor. None proves live automation or earnings.

## Operator setup

See **[the full OAuth, migration, scheduler, disconnect and verification reference](docs/full-auto-mode.md)**. `.env.example` lists non-secret variable names only. Never commit secrets or paste them into chat.

Register the exact app callbacks:

```text
https://pincraftly.vercel.app/api/integrations/pinterest/callback
https://pincraftly.vercel.app/api/integrations/blogger/callback
```

After securely supplying authorized infrastructure/app configuration, the operator/agent applies both migrations, deploys with the worker secret, verifies an actual scheduled heartbeat, and the owner grants consent/selects destinations. One genuine publication and offline follow-up remain the final operating checks. Code cannot invent a provider app approval or account's Allow decision.

## Development and tests

Node 20.18+, Next 15.5.29, React 18.3.1, PostgreSQL/pg, jose, undici and ipaddr.js. English UI; white surfaces, Pinterest red **#E60023**, black text, rounded responsive controls.

```bash
npm ci
npm run dev -- --hostname 0.0.0.0
# Stop dev first; dev/build share .next.
npm run build
npm run start -- --hostname 0.0.0.0

# With an authorized database environment supplied securely:
npm run db:migrate          # v1 then v2, idempotent, no sample successes
npm run automation:worker   # ONE invocation, not a permanent daemon
npm run test:automation
npm run test:automation:ui
```

Production uses the static Vercel **Schedules Beta** POST entry in `vercel.json` (`*/30 * * * *`), not browser execution or legacy daily-only Hobby Cron. Alternative hosts need their own reliable server scheduler. Preview publishing is blocked by default.

**Verification: 427/427 local checks passed**, production build passed, 0 known dependency vulnerabilities, zero browser runtime/console errors. Exact qualified results are in [docs/automation-verification.json](docs/automation-verification.json). Backend tests use real isolated PostgreSQL and explicit provider doubles; configured browser tests exercise actual start/callback routes, schedules, queue, images, Library, Disconnect and a worker run with Chromium fully closed. Sessions, provider authorization/publication responses and test content are **fixtures, not real account consent or public posts**. Public HTTPS PNG, signed PNG rendering and Google Trends RSS are actually exercised.

Fixtures refuse non-loopback/non-`_test` databases. The HTTP double is an explicit local test-process preload, never imported or activated by production application/API input. Retained public/manual/auth suites cover setup honesty, session/CSRF guards, responsive navigation/dialogs and regression safety. Reports are saved in ignored `.shots/`; selected non-secret release evidence is in `docs/`.

The existing post-commit hook automatically pushes changes to GitHub `main`; the agent handles and verifies deployment. No manual user Git/deployment steps are required.
