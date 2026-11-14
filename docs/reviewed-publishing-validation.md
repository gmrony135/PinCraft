> **Superseded scope notice:** optional Pin + explicitly consented recurring generation are now documented in [blogger-trend-automation.bn.md](blogger-trend-automation.bn.md). Historical counts below predate those features.

# PinCraft publishing — final local validation

## Result

**Selected path:** Blogger API v3 automatic publication → manual Pinterest upload/native scheduling, using the existing Vercel website, Firestore Spark and the direct GitHub Actions Node runner.

| Validation | Final result |
| --- | --- |
| Reviewed publishing backend / real local Auth & Firestore transactions | **49 / 49 passed** |
| Production-build Next APIs + Chromium / manual pack end-to-end | **31 / 31 passed** |
| Existing automation compatibility suite | **89 / 89 passed**, isolated `legacy_api` only |
| Existing Library, ownership, billing, quota and workspace suite | **55 / 55 passed**, isolated `legacy_api` only |
| Public AI contracts / privacy projections | **17 / 17 passed** |
| Existing AI generation / usage / fallback contracts | **50 / 50 passed** |
| Next.js 15.5.29 production build | **Passed**, exit 0 |
| Production-only runner dependencies | **289 installed packages**; refreshed final source imports passed with root/dev dependency fallback denied |
| Workflow syntax | Both YAML files parsed; selected workflow's pinned actions, activation gate and secret mapping checked |
| Browser runtime / unexpected console errors | **None** on the tested surfaces |

The retained compatibility/generation regression checks total **211 / 211**. Compatibility results do not authorize enabling the old Pinterest API path. New production requests default to `blogger_manual_pin`.

Detailed current test names and results are in [reviewed-publishing-validation.json](reviewed-publishing-validation.json). Reproduction commands are in [the বাংলা setup guide](blogger-manual-pinterest-setup.bn.md).

## What was exercised

- Managed-user sessions, owner isolation, same-origin mutation protection, immutable request IDs, concurrent duplicate submissions and stale-account browser responses.
- Offline Google OAuth start with PKCE, canonical callback, callback-scoped HttpOnly cookie, replay rejection, per-owner encrypted refresh grants and actionable reconnection.
- Draft creation, saved post-ID reuse, a separate publish checkpoint and future `publishDate` requests without a body.
- Separation of `SCHEDULED`, ADMIN `LIVE`, matching unauthenticated public HTML and the released manual Pin task. A draft or schedule does not invent a public result URL.
- Actual browser PNG download; real browser clipboard copy; a downloaded ZIP containing the reviewed Pin copy, confirmed **synthetic fixture** article URL and locally reselected PNG.
- Owner-confirmed Pin links labeled **user-reported, not API-verified**, without a Pinterest API request or automatic upload.
- Consent invalidation after edits; no image-byte or grant exposure in browser publishing receipts.
- Malformed JSON and declared/streamed oversized accepted mutation responses at both draft and publish checkpoints: stop for inspection, never blind reinsertion.
- Rejected Firestore checkpoint writes, lost successful commit acknowledgements, and complete post-send write outage: retain a known ID where possible or recover the durable pre-send marker into inspection.
- Concurrent processing, expired leases, connection locks, disconnect during a send, same-identity reconfirmation and website removal/reassignment/revision changes during preflight.
- Three logical attempts, provider rate-limit backoff, bounded candidate/step processing and summary-only CLI completion with the Firestore client closed.
- Disabled legacy API queue/enable/worker entry points in the selected mode. The old workflow source now also has an explicit, separate legacy activation gate.
- Current home, footer, policies and subscription copy correctly describe manual Pinterest. Responsive containment was checked at **320, 390, 768 and 1440 px**.

The public-page verifier still requires public-only DNS resolution, pins the connection lookup, rejects redirects, and does not send Google authorization to the public article host. Externalizing the Node `undici` package keeps its Agent implementation consistent across production route bundles; it does not bypass those checks.

## What this does not establish

All Google/Blogger/public-page responses were **explicit synthetic test doubles**. Auth and Firestore ran under guarded local `demo-pincraft-local` emulators. No app request flag can enable the doubles. The GitHub publishing workflow does not install Chromium or a browser publisher.

This is **not** evidence of genuine owner Google consent, production publishing credentials, an enabled new GitHub scheduler, actual Blogger publication, Pinterest visibility or exact-minute execution. The direct runner has not been dispatched in production for this delivery. Historical OIDC/Worker results are not substituted for that acceptance.

No new commit, push, Vercel deployment, production Secret installation, Firestore Rules/IAM/billing change, paid-service activation or real external post was performed for this delivery. Temporary local test services were stopped after verification.

## Owner activation still required

1. Review/deploy the source normally without private input files. Preserve existing generation, Library, billing, authentication and the website origin.
2. Configure Blogger API/OAuth and the exact callback `https://pincraftly.vercel.app/api/blogger/callback`.
3. Use the **same existing Firebase project, Google client and encryption key** on the website and in the documented GitHub Secrets/Variables. Do not replace per-owner grants with a shared user refresh token.
4. Complete genuine Blogger consent and verify the owned blog. Inspect the queue before deliberately enabling `REVIEWED_BLOGGER_SCHEDULER_ENABLED=true` on the trusted public main branch. Leave the legacy gate unset/false and review any old remote workflow separately.
5. Use one owner-approved real article for live acceptance. Perform Pinterest upload/scheduling yourself. A Blogger schedule already accepted remotely must be canceled inside Blogger if no longer wanted.

See the setup guide for Spark/API/GitHub limits, best-effort scheduling, Google Testing-mode grant expiry, retry/inspection and safe rollback boundaries.
