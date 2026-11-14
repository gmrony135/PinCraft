# Automation-first architecture and safe operation

> **Historical / superseded publishing instructions.** Current selected path: Blogger automatic + Pinterest manual, Firestore Spark + direct GitHub Actions runner. Follow [the current বাংলা setup guide](blogger-manual-pinterest-setup.bn.md). Do not activate the Pinterest API, old OIDC workflow or deferred Worker from this document. Historical results below are not evidence that the new runner or real owner publication is live.

## Primary scheduled path: existing Vercel + public GitHub Actions

`.github/workflows/pincraft-automation.yml` requests a GitHub OIDC token and POSTs an empty body to the canonical production worker endpoint at `7,37 * * * *` UTC. Checks are best effort: hosted workflow queues and external requests can delay them. No personal credential, OAuth token, Admin key or long-lived worker secret is stored in the workflow.

The three website settings are `AUTOMATION_SCHEDULER=github-actions`, `AUTOMATION_GITHUB_REPOSITORY=gmrony135/PinCraft`, and `AUTOMATION_GITHUB_REPOSITORY_ID=1456649831`. They were added through connected Vercel without a paid upgrade and consumed by the READY/PROMOTED production release. Declared configuration is not a healthy heartbeat; the Dashboard reads the persisted actual worker check-in. The real manual [OIDC delivery run 43561574146](https://github.com/gmrony135/PinCraft/actions/runs/43561574146) succeeded and its exact execution ID independently matched the finished `ok` Production database heartbeat. This proves the delivery path, not future exact-time cron execution or an external publication.

The signed workload is validated against GitHub's fixed issuer/JWKS, RS256, exact endpoint audience, immutable repository ID, repository name, public visibility, `refs/heads/main`, approved workflow path and schedule/manual-dispatch event. Run ID/attempt is claimed transactionally once. Forks, PRs, private repositories, alternate branches/workflows and replayed deliveries fail closed. Provider publishing and credentials cannot be supplied in the request body.

The public-repository guard must remain enabled. If this repository becomes private, reassess free Action allowance with the owner instead of silently enabling billable usage. Free quotas, platform terms and runtime duration apply; there is no unlimited-service promise.

`functions/index.mjs` remains an **undeployed alternative**, bundling the same worker for actual Node22. It is not needed for the selected Vercel/Actions path. Do not enable Firebase billing, provision Cloud Scheduler/Functions, change IAM or deploy Rules/indexes as a side effect of releasing website code.

## Setup gates

1. Verified Email/Password or Google identity, same-origin nonce-bound exchange, current enabled managed account and private HttpOnly session.
2. Working owner-scoped Firestore and preserved session/encryption keys.
3. Real Pinterest/Blogger OAuth apps and exact registered callbacks. Firebase Google sign-in is **not** Blogger publishing consent.
4. Pinterest **approved Standard app access** for public publication. Trial API Pins are visible only to their creator. `PINTEREST_ACCESS_TIER=standard` is an operator attestation, not an approval request or bypass. It is checked before enablement, generation and each remote mutation, including legacy paths.
5. Connector verifies an owned public Pinterest board and Blogger site with administrator permission. One Google account owning multiple sites does not bypass subscription capacity.
6. Category processing consent at setup save and **separate ongoing publishing consent** at Start. Saving always pauses. Current capacity and connection revisions are checked again before publication.

No genuine OAuth grant, email delivery, wallet receipt or external post has been established by emulator/HTTP-double tests. Missing app credentials must remain missing—not filled with placeholders. The local guarded server is never the production endpoint.

## User workflow and route boundaries

`/connector` owns publishing account consent, reconnect/disconnect and verified Blogger websites. `/automation` owns names, categories, owned board/site choices, daily quantity, language, timezone, editable slots, start/pause/removal. `/dashboard` is monitoring and uncertain-result review, not a duplicate setup form. `/library` displays private complete drafts and confirmed links. Manual generator/Article Writer/Content Studio tools do not silently queue or publish their output.

One nonarchived automation is allowed per Pinterest identity per user. Free capacity is one Pinterest account and one website. The confirmed paid allowance is total two of each, not two extra. Additional work requires a current independently approved manual subscription; capacity is rechecked before new remote mutations. Expiry retains saved content.

## Scheduling and the six-Pin invariant

Daily quantity is a server-validated integer 1–6. Slots lie on half-hour boundaries and must be at least an hour apart, including across midnight. Timezone is a validated IANA zone; English/Bengali generation is persisted per workflow. Spring DST missing slots are skipped, and a repeated autumn wall-clock slot is not run twice. Delays do not cause catch-up bursts. After publication, the next actual configured slot is at least an hour later; reaching the user's selected local-day maximum selects tomorrow's next slot, not midnight.

`pincraft_pin_limits/{sha256("pinterest-account:" + immutableNumericId)}` is a **shared rolling-24-hour safety ledger**, independent of Firebase owner, board, connection UUID and campaign. Numeric Pinterest ID is required; mutable username is not a quota identity. At most six confirmed results or unresolved requests can occupy the ledger. Transactional idempotent reservation happens immediately before a Pin mutation. Definitely rejected requests can release; confirmed Pins count 24 hours from persisted response time. Unresolved reservations never expire automatically. Explicit abandonment of an uncertain Pin conservatively starts a further 24-hour count rather than silently freeing a slot. Malformed ledgers or absent identities fail closed.

This cap covers PinCraft's own workers, legacy settings, retries and reconnections, not posting by a human or an unrelated service. Per-user local-day limits apply in addition. Quota deferral preserves the article checkpoint and uses an actual future slot.

## Data layout and privacy

| Collection/path | Role |
| --- | --- |
| `pincraft_accounts/{hashedUid}` | Root private account; legacy settings are paused when a named workflow is saved |
| `pincraft_accounts/{hashedUidAndChannel}` | Owner-bound named automation, schedule, due pointers and counters |
| Root `connections/{providerOrUUID}` | Owner/provider-bound encrypted grants, immutable identity, revisions and refresh lease |
| Root `websites/{blogger_id}` | Owner-verified Blogger destinations and grant revision |
| Root `oauthAttempts/{provider}` | Hashed single-use state/browser binding, encrypted PKCE, ten-minute logical expiry |
| Root `payments/{id}` | Short private reference projection, never full wallet credentials |
| Root `logs/{id}` | Owner-scoped neutral operational messages |
| Root `aiRequests/{uuid}`, `aiUsage/{UTCday}` | Private bounded idempotency and usage accounting |
| `pincraft_jobs/{uuid}` | Owner/channel, complete content, targets, leases, retries, uncertainty and confirmed URLs |
| `pincraft_pin_limits/{identityHash}` | Cross-owner account publishing safety ledger |
| `pincraft_subscriptions/{hashedUid}` | Actual approval, included capacity, start/expiry |
| `pincraft_payment_requests/{uuid}` | Encrypted full reference/payer information, deduplication and review state |
| `pincraft_billing_audit/{id}` | Explicit verified administrator's review decision |
| `pincraft_scheduler_deliveries/{hash}` | Single accepted workload run/attempt; logical expiration is not physical TTL deletion |
| `pincraft_system/heartbeat` | Actual worker starts/finishes/status |

The deployed Rules were checked read-only and contain a deny-all client rule. Browser code uses no direct Firestore SDK. Every private server projection enforces verified Firebase UID ownership and no-store headers. Admin bypasses Rules; least privilege and server checks remain necessary. Never expose credentials, AI integration identities, PKCE, private generation metadata or raw provider failures in a public receipt. `uploads/`, private env files and credentials are ignored and excluded from artifacts.

Indexes are **already deployed and READY**: ten composites and ten field overrides. The redesigned query shapes reuse them; the emulator does not prove production indexes. Preserve Rules/IAM/TTL and completed index-deployment evidence. No redundant deployment is needed.

## OAuth and remote mutation safety

OAuth uses owner/provider/browser-bound ten-minute state, fixed canonical HTTPS callback, single-use consumption and Blogger PKCE/offline consent. Cross-service connection overwrite and duplicate identity attachments are rejected. Every destination is checked against the actual authorized identity. Reconnect invalidates destination revisions and pauses every linked automation; revoked/failed grants do the same.

Pinterest access/refresh credentials are AES-256-GCM encrypted with a purpose tied to UID/provider/connection. Blogger access tokens are transient; only refresh tokens are persisted. Ninety-second refresh leases and revision/token-version receipts prevent stale rotation or invalidation. Maintenance can refresh paused connected grants, but no permanent authorization is promised.

Jobs have eight-minute leases and at most three bounded attempts; definite retryable failures wait an hour. External network operations are outside Firestore transactions. Content/target checkpoint and revision checks precede every step. A missing identity, expired subscription, removed website, changed grant or operator publishing lock blocks the next mutation. An accepted-but-unpersisted remote result pauses for owner inspection, never a blind duplicate retry. Existing confirmed remote IDs may be verified using read calls; checked abandonment records no invented success.

Disconnect deletes local grants and pauses related work. Google remote revocation is marked confirmed only after its response; Pinterest requires the owner's app-permission setting. A request already in flight can finish, and removing an automation does not delete published content.

## Manual billing: still closed until reviewer is supplied

Confirmed plan: **৳99, 30 days, total two Pinterest accounts and two Blogger sites**. The user chose to provide the reviewer later. No Production administrator allowlist is installed or inferred. The public plan may show terms but returns neither receiving instructions nor submission controls until reviewer-gated collection is deliberately enabled.

When eventually enabled: owner submits an encrypted globally deduplicated reference; pending grants nothing. The explicitly allowlisted, currently verified/enabled managed administrator independently checks the receiving bKash/Nagad wallet, confirms the exact amount/reference and records an audit note. Only that transaction grants a dated entitlement. Approval cannot double-extend on a race. Rejected references cannot be reused. Wallet PIN/OTP/password is never collected. Do not turn this into an invented merchant API.

## Verification

Run reset-dependent emulator suites sequentially. Local HTTP preloads require synthetic credentials, `demo-pincraft-local`, loopback Auth/Firestore and non-production. They cannot be activated by client input. Browser tests exercise real Next production APIs and Firebase SDK/account sessions but deliberately double remote generation/consent/publication. The workspace suite closes Chromium and invokes the real bundled worker on actual Node22; that proves browser independence locally, not a deployed timer or genuine post.

Public production smoke must use current routes and check private guest boundaries without creating users, sending emails, starting inference, submitting real references or publishing test posts. A real OIDC workflow heartbeat, genuine owner login/email delivery and real platform consent/publication must be reported independently. Never describe a saved schedule, configured flag, emulator result or Trial Pin as public end-to-end success.

The released application source `1c7af7d65d7ca49ed3271f204f1f9fcd1056a013` passed 342 local checks and 21 public production checks; see `automation-first-verification.json`. An additional real production Firebase SDK negative-path probe received the expected invalid-credentials response without creating an account/session or sending mail. Neither that probe nor provider configuration reads prove genuine owner signup, successful login or email delivery. The successful manual OIDC invocation was guarded by read-only preflight showing zero enabled schedules and zero connected Pinterest authorizations; no content was published. Future naturally scheduled delivery remains unobserved at this release checkpoint.
