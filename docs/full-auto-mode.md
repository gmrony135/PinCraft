# Password-free offline publishing — Condition 1

## Release scope and honest operating status

Implemented: Pinterest authorization-code OAuth, Google/Blogger offline OAuth, encrypted per-user credentials, background refresh, a persistent scheduled Pin queue, optional generated Pin + Blogger Article mode, configurable schedule, 30-minute worker dispatch, 1-hour bounded retries, real-result metrics and Disconnect.

**Production setup is still required.** No production secrets, permanent database, provider app approval, real account consent or paid infrastructure was supplied/provisioned by this release. Do not confuse isolated test callbacks, provider responses or published-content fixtures with genuine Pinterest/Google authorization or a live post. The deployed UI must remain **Setup required / Not Connected** until its actual requirements are met.

The existing manual browser drafting/demo-publication tools and labeled sample Adsterra report remain separate. LocalStorage cannot authorize or enable the server worker.

## Account-owner workflow

1. Sign in through verified Google Identity Services. The site never asks for an account password.
2. Dashboard → Settings → **Connect Pinterest**. The browser leaves for `https://www.pinterest.com/oauth/`; only Pinterest handles login/Allow.
3. Connect Blogger on Google's consent page if automatically publishing articles. It is optional for user-queued Pins with an existing destination link.
4. Load destinations from the connected accounts. Select a **public board owned by that Pinterest account** and a **live Blogger blog with owner/admin access**. Save revalidates ownership with those same saved user tokens; it does not enable posting.
5. Choose `My scheduled Pin queue`, or `Generate Pin + Blogger article automatically`. The latter also needs a separately encrypted OpenAI/Gemini API key. Verification makes a small real provider request only after explicit usage consent.
6. Save the schedule, for example **5 Pins/day, 120 minutes apart**. Current bounds are 1–10/day and 30–1440 minutes, in 30-minute steps. Default remains 10/day and 120 minutes; this is a ceiling, not promised delivery.
7. In queue mode, save title, description, public HTTPS image URL, destination link and optional due time. In generated mode, choose rotation or actual Google Trends RSS topics.
8. Confirm real scheduled publishing, then turn Full Auto Mode ON. It runs on the server; closing the tab/browser does not stop it.
9. Inspect Next Post Time, Total Published, Failed Posts, last confirmed result, actual activity/error logs and returned Pinterest links. Pause/Disconnect are available without provider password entry.

Date/time inputs explicitly use the device timezone and convert to UTC. The editable IANA timezone (default Asia/Dhaka) controls daily quota reset. Displayed times are **due times**, not exact-delivery guarantees.

## Required deployment configuration

Set server secrets through the trusted environment, never Git or chat. `.env.example` contains names/placeholders only.

| Variable | Required purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google Identity Services Web Client ID; authorized JavaScript origin is the actual canonical website |
| `AUTH_SESSION_SECRET` | Separate random session-signing secret, at least 32 characters |
| `DATABASE_URL` | Persistent PostgreSQL, pooled URL preferred; certificate-verifying TLS |
| `AUTOMATION_ENCRYPTION_KEY` | Exactly 32 random bytes encoded in standard base64; back up and retain |
| `CRON_SECRET` | Separate random 32–256-character Bearer secret captured by the scheduler at deployment |
| `APP_URL` | Canonical publicly reachable HTTPS origin; no path/query; image routes must be public |
| `PINTEREST_CLIENT_ID/SECRET` | Actual Pinterest OAuth application; approved access/scopes/account where required |
| `BLOGGER_CLIENT_ID/SECRET` | Actual Google Web OAuth application, Blogger API enabled and consent configured |

Register these **exact redirect URLs** (replace the origin consistently only if the canonical domain changes):

```text
https://pincraftly.vercel.app/api/integrations/pinterest/callback
https://pincraftly.vercel.app/api/integrations/blogger/callback
```

Sign in and connect from that same canonical host; a preview/alternative alias is not silently substituted into a registered callback. Google sign-in and Blogger publishing are separate grants, even if the operator uses the same Google project.

Operator/agent deployment order: configure authorized infrastructure/apps → apply `npm run db:migrate` (v1 then v2) → deploy/promote with scheduler secret → verify actual scheduler heartbeat → owner consent and destination selection → enable schedule → verify one genuine published Pin, Blogger URL when applicable, and an offline follow-up. No manual user Git steps are required.

App approval, provider quotas, consent-screen publishing/review and account permission cannot be created by code. Google testing/time-limited grants and Pinterest refresh grants can expire; revocation/expiry may require renewed consent. There is no promise of permanent access without any future reauthorization.

## OAuth request and storage contracts

### Pinterest

Authorization: `https://www.pinterest.com/oauth/`, with app `client_id`, exact `redirect_uri`, `response_type=code`, random `state`, and exactly these requested permissions:

```text
pins:read,pins:write,boards:read,boards:write,user_accounts:read
```

Exchange/refresh: `POST https://api.pinterest.com/v5/oauth/token`, form-encoded, HTTP Basic app credentials. Code exchange uses the same registered redirect. Refresh uses the particular user's refresh token, not an app-global posting identity. `continuous_refresh=true` is sent for legacy-app compatibility. Returned expiry metadata is parsed; no obsolete 365-day assumption is hardcoded.

At rest: encrypted `{accessToken, refreshToken}` only, with access/refresh expiry, scopes, connection status and version metadata in separate columns. Access is renewed with a five-minute safety margin. Maintenance also renews connected paused accounts when the continuous refresh expiry is within seven days. Returned token rotation is persisted atomically. Actual posting uses `POST /v5/pins`, authorized board, title, description, HTTPS image URL and the selected destination/article link.

Continuous refresh still depends on renewing before the provider's refresh expiry and retaining valid authorization. Uncertain lost refresh-rotation responses can require reconnection rather than repeated use of a potentially invalid old token.

### Blogger

Authorization: Google OAuth2, `access_type=offline`, `prompt=consent`, PKCE S256, scope `https://www.googleapis.com/auth/blogger`. Code exchange and refresh use the configured Google OAuth app.

**Only `{refreshToken}` is persisted in the encrypted Blogger envelope.** Initial and refreshed Blogger access tokens are discarded after use in server memory. An explicit allow-list at both save and rotation boundaries excludes access tokens, account passwords, email/password data or arbitrary grant properties. Missing offline permission fails closed; an access-token-only connection cannot activate offline posting.

Articles publish through `POST https://www.googleapis.com/blogger/v3/blogs/{id}/posts?isDraft=false`. The worker requires a public URL from the verified blog's hostname and a published result; it will not accept a draft as success. HTML is escaped, includes a job marker, and is checkpointed before the linked Pin step.

### Binding, encryption and refresh races

- Server-verified, signed, HttpOnly sessions determine the owner; no request may supply another posting user ID. Google identity email verification is transient; issued sessions and returned profiles contain only the stable user ID and display name, not a Gmail/email address. No email/password field is collected or persisted.
- Same-origin POST starts authorization. The canonical callback origin is fixed server-side.
- 256-bit random state, hashed at rest, is bound to user + provider + a separate HttpOnly browser nonce, expires in ten minutes and is consumed atomically once. Google PKCE verifier is encrypted. No authorization code is stored.
- AES-256-GCM uses a random IV and authenticated data bound to user, provider and purpose. Cross-user/provider decryption fails.
- Per-provider 90-second refresh leases plus grant/token versions avoid concurrent rotation. Network calls occur outside long-held SQL transactions.
- Disconnect/new authorization invalidates stale callback and refresh writes. A worker cannot resurrect deleted tokens or overwrite a newer grant.
- Status, resource, Library and mutation responses never return saved secrets or ciphertext; application code never logs callback URLs/codes, raw provider responses or token payloads. Operators must likewise redact OAuth callback query strings and request bodies in external proxy/APM/access logs.
- Auth API failure pauses and marks the specific grant reconnect-required. Existing public board-read access is not described as unconditional write permission.

## Schedule, worker and retry semantics

`vercel.json` uses **Vercel Schedules Beta**, named `full-auto-worker`, UTC `*/30 * * * *`, POST `/api/internal/automation/tick`, 15-minute hosting jitter. This polls persistent due work every 30 minutes; it does not run a browser timer or post every 30 minutes regardless of the user's cadence.

The protected route requires a constant-time `CRON_SECRET` Bearer check, infrastructure readiness and production environment (or an explicit isolated/alternative-host override). Request bodies cannot inject jobs, adapters, user credentials or fixture flags. Preview publishing is blocked by default.

The database enforces:

- One open active job per account, account-row `FOR UPDATE SKIP LOCKED`, bounded leases and idempotent queue-request keys.
- Earliest eligible queued Pin first; future per-Pin due times and the account's next slot must both permit a claim.
- Configured spacing between new jobs; confirmed completion also pushes the next new job at least one interval ahead. OFF/ON cannot trigger a catch-up burst.
- Successful Pin completions counted using actual completion timestamps in the chosen local timezone. At the cap, wait for the next local day; failed attempts are not published completions.
- Confirmed retryable failures wait **one hour**, up to three automatic attempts, preserving saved content and a previously confirmed Blogger article. Authentication/revoked-grant/configuration errors require correction rather than endless automatic retries.
- Daily cap and one-job lease rules also apply to retries. A due retry runs on the next healthy poll after its wait, not necessarily at an exact minute.
- Timeout, ambiguous 5xx/malformed publication result, interrupted mutation lease, or DB failure after external acceptance becomes `attention` and pauses. No blind repost. Verify an actual Pin ID and expected board/link, verify a Blogger job marker, or explicitly abandon after inspection.
- A failed job can be explicitly scheduled for another bounded retry after one hour, but cannot be retargeted to a different board/blog. Saved target snapshots and connection versions are checked before every publication step.

One invocation processes at most three accounts concurrently under a 300-second function budget, with eight-minute job leases; more due accounts wait for later dispatches. Token maintenance is also bounded. This is an initial small deployment, not an unlimited-volume queue service.

Vercel path/function schedules do not supply automatic handler retries. Persisted application retries and expired-lease recovery handle the next healthy dispatch. If heartbeat is stale (>45 minutes) or the worker reports error, the UI says **Awaiting server worker**, not Running. Empty queues are labeled waiting, not fabricated published work.

Current Schedules Beta Hobby limits include minimum 15-minute cadence, 15-minute jitter and 5,000 team runs/billing period; a 30-minute dispatcher is approximately 1,488 runs in a 31-day month, before other/manual runs. Hosting limits may change, and exhausted/shared quotas can skip runs. No paid upgrade was enabled.

Alternative host: `npm run automation:worker` performs **one** bounded invocation. A reliable external server scheduler must invoke it repeatedly. A temporary workspace process or dev server is not permanent production infrastructure.

## Public HTTPS image safety

Queued images: PNG/JPEG/WebP, at most 5 MiB, valid image magic bytes, public HTTPS without login/redirects/private addresses. Queue insertion and every posting attempt preflight the actual bytes. Destination links must be public HTTPS. Every DNS address is validated and the actual TCP lookup is pinned, blocking rebinding/private-network SSRF; redirects and secret forwarding are disallowed.

Generated images: actual 1000×1500 PNG from saved title/topic, a purpose-bound HMAC image URL, no API tokens in the URL/artwork. The worker checks public reachability, PNG signature and dimensions before publishing the article/Pin. Generated content is saved first to avoid losing it on a provider error.

Images are intentionally public once published and may be provider-cached. Disconnect is not deletion of a previously published Pin, article or cached image. Retain/backup the encryption/signing key; rotating it invalidates existing credentials and signed image URLs and needs an intentional migration plan.

## Disconnect: immediate local stop, honest remote revocation

Disconnect is allowed even during an in-flight job or unresolved result. It commits local pause, token deletion, connection-version invalidation and OAuth-attempt deletion **before** requesting supported remote revocation. Saved content/logs remain. A request already sent to a provider may still finish; no future step is authorized by a disconnected grant.

**Blogger:** POST the removed refresh token to `https://oauth2.googleapis.com/revoke`. Only a successful provider response yields `revoked`. If it cannot be confirmed, local tokens still stay deleted and the UI links to Google Account permissions. It never fabricates provider-side success.

**Pinterest:** the documented `/v5/oauth/token/revoke` currently supports **system-user tokens only**, not the personal authorization-code grants used here. The app therefore deletes local tokens/stops posting, records `manual_required`, and links to Pinterest Settings → Security and logins → Apps. The account owner must remove PinCraft there to ensure provider-side revocation. It does not call an unsupported endpoint and falsely show Revoked.

Legacy WordPress application-password and manual publisher-token adapters/forms were removed. Migration v2 erases the old encrypted manual credential bundle, pauses affected accounts, retains cloud drafts and conservatively marks uncertain legacy publications for inspection. Fresh OAuth consent is required; old manually pasted credentials are not silently promoted into authorization.

## API surface

| Endpoint | Access / effect |
| --- | --- |
| `GET /api/automation` | Guest-safe empty setup state; authenticated owner's status/metrics/logs only |
| `POST /api/integrations/{provider}/start` | Same-origin owner, fixed app config, secure browser nonce, authorization URL |
| `GET /api/integrations/{provider}/callback` | Owner/browser/state-bound single-use exchange, fixed clean redirect, no token response |
| `GET /api/integrations/{provider}/resources?cursor=` | Own authorized public boards/admin blogs; bounded provider pagination |
| `POST /api/integrations/{provider}/disconnect` | Explicit confirmation, immediate local stop/deletion, honest revoke result |
| `POST /api/automation/settings` | Preferences, mode + consent, destination verification, optional AI key save/remove; pasted publishing credentials rejected |
| `POST /api/automation/queue` | Own queue insertion/removal or explicit failed-job retry; bounded JSON and idempotency key |
| `POST /api/automation/review` | Own uncertain result verification or inspected-job abandonment |
| `GET /api/library?cursor=` | Own server content, 20-item pages, owned cursor; queued Pins do not masquerade as articles |
| `GET /api/automation/image/{id}?sig=` | Public signed image only, no authentication secrets |
| `POST /api/internal/automation/tick` | Protected production worker, never a browser publishing endpoint |

Private APIs are no-store; public image bytes are cacheable. No client profile, localStorage ON value or application-global posting token is accepted as an authorization substitute.

## Verification boundaries

The current release's exact suite results are recorded in `docs/automation-verification.json`. Tests use real isolated PostgreSQL, actual Next production-build routes, real signed-image rendering and browser actions, with explicit synthetic signed sessions and provider OAuth/publishing HTTP responses. OAuth state/owner/nonce/PKCE, rotation races, disconnect during refresh, 5/day scheduling, one-hour retry, uncertainty/DB-failure protection, private pagination, no secret persistence, browser-closed worker invocation and responsive layouts are tested. Public Google Trends RSS and a public HTTPS PNG are actually fetched.

Test scripts refuse non-loopback/non-`_test` databases. `scripts/automation-http-fixtures.mjs` is an explicit **test-process preload**, never imported by the app and never enabled through API input or a production runtime flag. No real user/provider authorization or external publication is claimed by a fixture. Live gates remain permanent infrastructure, genuine app/owner consent, observed scheduler execution and one verified real publication/offline follow-up.

## Primary references

- [Pinterest OAuth setup](https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/)
- [Pinterest official API description](https://github.com/pinterest/api-description)
- [Pinterest token revoke restrictions](https://developers.pinterest.com/docs/api/v5/token-revoke/)
- [Google offline OAuth and revocation](https://developers.google.com/identity/protocols/oauth2/web-server#offline)
- [Blogger admin verification](https://developers.google.com/blogger/docs/3.0/reference/blogUserInfos/get)
- [Blogger posts.insert](https://developers.google.com/blogger/docs/3.0/reference/posts/insert)
- [Vercel Schedules configuration](https://vercel.com/docs/schedules/configuration), [limits](https://vercel.com/docs/schedules/limits), [run handling](https://vercel.com/docs/schedules/handle-runs)

These describe contracts and limitations, not proof of this application's account approval or live production connection.
