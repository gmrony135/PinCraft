# Reviewed Blogger publisher: API and durable data contract

Current flow is `blogger_manual_pin`. See [owner setup, বাংলা](blogger-manual-pinterest-setup.bn.md) for secrets, callback and activation. Old Worker bridge endpoints/Pinterest API contracts are not this API.

## Browser entrypoints

`/publish` loads only the current session owner’s existing Cloud Library article drafts, or accepts pasted complete text. It formats/escapes plain text and simple Markdown locally; opening review never creates a job. `/connector` links each ready owned site to this screen. The `website` and `draft` URL parameters are hints, not authorization; the session-scoped status/Library response must resolve them. A sole ready destination may be preselected, but final publication consent remains unchecked. The optional Pin pack is OFF by default; no artwork/copy gate exists for Blogger-only publication. Consent is synchronously bound to the exact current review values. Client/server share strict article HTML/plain-copy/hashtag validation; Unicode combining marks inside letter/number-started hashtags support normal Bengali/Indic spelling without permitting markup, format controls or a mark-only tag. The saved receipt displays its immutable Job ID.

## Authentication and input boundary

All `/api/publish/*` routes require a currently valid managed-user PinCraft session. Mutation routes additionally require a same-origin JSON request; body limit is 145,000 bytes. No UID, provider token, session, transport adapter, remote result URL, raw image bytes or already-published flag can be supplied by the client.

Article HTML is 50–100,000 bytes, with balanced lowercase `p`, `h2`, `h3`, `ul`, `ol`, `li`, `strong`, `em`, `blockquote`, `br` only, without arbitrary attributes/comments/embeds. The adapter—not caller HTML—adds its own job marker and optional escaped hosted featured image. Titles/Pin copy/hashtags and HTTPS URLs have separate validation. Description accepts plain newlines. Date/time inputs must be real explicit UTC timestamps (or `now`), within a year, with the manual target not before the blog. IANA timezone is retained for display; ambiguous/nonexistent local DST input is rejected by the client helpers.

Use connection/site IDs actually returned for the current owner. Never substitute arbitrary Google account IDs, a caller-supplied blog URL or guessed post slug.

## Routes

| Method / path | Purpose |
| --- | --- |
| `GET /api/publish/status` | Owner Blogger profiles/sites/subscription, actual OAuth readiness, separate reviewed-runner heartbeat |
| `GET /api/publish/jobs` | Latest 100 owner projections, newest first; no invented records |
| `GET /api/publish/connections/blogger/resources?connectionId=…&cursor=…` | Owned Blogger resource listing with pagination |
| `POST /api/publish/websites` | `{connectionId, blogId}`; verifies administrator ownership, saves site, publishes nothing |
| `POST /api/publish/jobs` | Creates/replays one immutable reviewed parent |
| `POST /api/publish/jobs/:id/process` | Empty `{}`; runs at most one due checkpoint (same function as Actions), no content replacement |
| `POST /api/publish/jobs/:id/retry` | Optional `{reconfirmConnection: true}` after restoring original identity/site; counters/draft ID retained |
| `POST /api/publish/jobs/:id/review` | `{action:'verify', remoteId, inspected:true, reconfirmConnection?:true}` or `{action:'abandon', inspected:true}` |
| `POST /api/publish/jobs/:id/manual-complete` | `{pinURL, confirmedManual:true}`; user-reported only, not remote verification |

Create request shape (IDs below are **synthetic examples**, not production destinations):

```json
{
  "requestId": "3c8c1766-c26a-4633-94f6-c84c10ce9d3c",
  "article": {
    "title": "A small balcony garden",
    "html": "<h2>Begin with one plant</h2><p>Review your sunlight, drainage and available space before choosing a plant for your own balcony.</p>",
    "featuredImageUrl": ""
  },
  "pin": {
    "title": "Make room for a small garden",
    "description": "Save these reviewed ideas for your next small garden project.",
    "hashtags": ["#SmallGarden"],
    "imageSource": "local_download",
    "imageUrl": "",
    "altText": "A small balcony with green plants"
  },
  "bloggerConnectionId": "blogger",
  "websiteId": "blogger_123456789012",
  "blogPublishAtUTC": "now",
  "pinReadyAtUTC": "now",
  "timezone": "America/New_York",
  "reviewed": true
}
```

**Blogger-only request:** omit both `pin` and `pinReadyAtUTC` entirely (or use null for both). The example above opts into a strict manual pack; no Pin content is required otherwise. Final `reviewed:true` is still mandatory for this one-article owner API. An automation object or missing per-article approval cannot inject a recurring job.

`imageSource` is `local_download` or `public_url`. In public URL mode `imageUrl` is required; local upload bytes are never submitted. `pinReadyAtUTC` is **not** the old `pinPublishAtUTC`. No Pinterest connection, board, Trial acknowledgment or mandatory image host is required.

Creation returns `{job, replayed}` with HTTP 201. The raw reviewed request fingerprint is immutable for a request UUID; replay returns that existing owner job even if its original due time has passed. Changed content under the same UUID returns 409. A UUID belonging to another owner returns 404, not its receipt. A new UUID is not a reconciliation strategy for an uncertain remote send.

`configured:true` in status means this local implementation/mode is selected. Actual provider configuration is **`providers.blogger.configured`**; saved connections require successful genuine OAuth, and heartbeat alone does not prove provider access.

## Firestore

- `publish_jobs/{uuid}`: private authoritative parent/child records. `flow:'blogger_manual_pin'` identifies this implementation.
- `pincraft_accounts/{sha256(uid)}/publish_job_views/{uuid}`: owner-safe projections, including manual copy only after the real article URL is released.
- Existing `connections` and `websites` subcollections: unchanged encrypted per-owner grants and administrator destinations; no new shared refresh-token document.
- `publisher_system/reviewed_blogger`: summary heartbeat for **this** runner. No owner IDs, content, URLs, grants or provider error objects in CI heartbeat/logs.

Parent fields include `ownerUID`, `type:'blogger'`, `status`, `phase`, `publishAtUTC`, `pinReadyAtUTC`, `timezone`, immutable reviewed payload/account-key/revision/site snapshot, `remoteId`, `draftURL` (private), `resultURL` (LIVE/public only), an optional predetermined `manualTaskId` (null for Blogger-only/recurring jobs), `attempts`, `attemptOpen`, `lease`, `leaseUntilUTC`, `mutationPending`, `reviewedRunAtUTC`, fingerprint and audit timestamps.

The one due query is `reviewedRunAtUTC <= now`, ordered/limited on that same field. New jobs are due immediately to register future Blogger publication in advance. Terminal rows **omit** that field rather than retain an old due timestamp. Default single-field indexes suffice for the new collections; existing production index/TTL policies are not redeployed here. Browser rules remain deny-all; Admin access must already be authorized.

Manual children contain `type:'manual_pin'`, `bloggerJobId`, reviewed Pin copy/image reference, the verified `articleURL`, manual target, reminder state and optional `reportedPinURL`. They never contain an API Pinterest post ID/token or a provider-verified Pin receipt. Browser-downloaded image files are not retained in these documents.

## Checkpoints and race handling

1. **Claim:** transaction checks owner/flow/due/lease and opens or continues a logical attempt. Eight-minute lease; three logical attempts maximum. Repeated harmless LIVE polls do not spend attempts.
2. **Authorize:** read the current managed account, original Google identity/revision and verified site. Capacity is checked on create, retry and immediately before each mutation.
3. **Before mutation:** one transaction reads job/connection/sites/subscription, rechecks lease/context and writes `mutationPending`. A per-connection `reviewed_publish_job` + lease + expiry locks concurrent mutations and OAuth replacement. Token rotation preserves that lock.
4. **Draft:** POST `posts?isDraft=true`; include `<!-- pincraft-reviewed-job:{uuid} -->`; persist ID before the separate publish checkpoint. Valid ID on an otherwise unexpected accepted result is retained for inspection.
5. **Publish:** POST the saved ID's `/publish` endpoint; optional future `publishDate`, **no body**. Validate response/ADMIN state; malformed JSON, declared/streamed oversized bodies and unconfirmed acceptance become review, not another publish call.
6. **Verify:** due ADMIN GET must confirm that post as LIVE with a nonfuture publication timestamp; separate unauthenticated, DNS-pinned HTTPS HTML GET must match this post. Redirects/login-only/private/unmatched pages do not count. Only then atomically complete the parent and, if explicitly requested, create its one manual child. Blogger-only jobs complete without a child.
7. **Failure:** bounded backoff for definite rejections/read-only transport failures; a 429 stops this runner run. Mutation timeout/5xx, lost commit acknowledgement or recovery of an expired mutating lease requires remote inspection. If a successful checkpoint write is rejected, its accepted ID is retained in the failure record where possible. If all post-send writes fail, the durable pre-send marker forces inspection after lease expiry. A lost acknowledgement after a successful checkpoint resumes only its saved next phase. Retry never resets IDs/counter.
8. **Review:** owner must attest inspection. A supplied existing post ID must return from the selected blog and contain this exact job's marker. DRAFT resumes publish on the same ID; SCHEDULED/LIVE resume read-only verification, not insertion. Abandon records no success and deletes nothing remotely.

OAuth start/save race on the same connection document as mutation locking. Disconnect may delete credentials immediately during a send, but retains the short-lived lock until the in-flight checkpoint settles/expires; it cannot restore grants or let a late result overwrite a replacement lease. Already-sent publication can finish. A future schedule already accepted by Blogger must be canceled in Blogger itself, not by deleting a local grant.

## Validation evidence

Reproducible test commands are in the setup guide. New suites exercise real local Auth/Firestore transactions and production-build API/UI code with **explicit synthetic Google/Blogger/public-page replies**. Unit tests inject a synthetic transport; browser integration uses a guarded, process-only preload that denies other external publishers. No request flag can activate those doubles in production.

Production-only runner dependencies are checked separately from the website/dev toolchain. Historical Worker/legacy tests are regression context only, not evidence of genuine owner consent, Google credential configuration, actual Blogger publication, scheduled production execution or Pinterest visibility.


## Recurring category-trend generation API

The discoverable `/automation` route is `BlogAutomationSetup` in the selected mode, not the old Pinterest API automation. [Full behavior/limits, বাংলা](blogger-trend-automation.bn.md).

| Method / path | Input / result |
| --- | --- |
| `GET /api/publish/automation` | Current owner config, latest 12 actual slots/evidence/editorial outcomes, separate generation heartbeat, existing AI usage and configuration readiness |
| `POST /api/publish/automation` | `{requestId,expectedRevision,settings,enabled,consent}`; strict same-origin owner JSON. `expectedRevision:null` for first save; otherwise exact returned revision. Explicit `consent:true` required when enabled |
| `POST /api/publish/automation/pause` | `{requestId,expectedRevision}`; always available to the owner even if AI/OAuth readiness is broken. Invalidates new generation/unsent automated mutations, not already-registered Blogger schedules |
| `POST /api/internal/blog-automation/tick` | Empty `{}`, no cookies/owner/settings/adapters. Exact reviewed-workflow, public-repo, main-ref, deployed-SHA GitHub OIDC only; one accepted delivery per run/attempt. At most one existing-generator AI stage per invocation |

`settings` fields are exactly:

```text
bloggerConnectionId: an owned connection ID
websiteId: an owned verified Blogger website ID
categoryIds: 1–3 of the product category IDs
topic: optional narrowing plain text, <=120 characters
language: en | bn
trendRegion: BD | US | GB | IN | CA | AU
timezone: valid IANA timezone
dailyLimit: integer 1–6
postingTimes: exactly dailyLimit distinct HH:MM values, >=1 hour apart
```

Save is immutable by request ID and guarded by settings revision. A paused save creates no slot/job or generation. Enabled saves require real live-text/secure-Blogger/exact-production-scheduler configuration. Website connection alone creates no config. No source/evidence, lease, quota ledger, generated content, existing-post flag, owner UID or provider credentials may be injected by these owner requests. New active settings require renewed consent and skip already-used upcoming instants.

### Records and authorization

- `blog_automations/{sha256(uid)}`: private current settings, destination identity/revision snapshot, consent version/fingerprint/time, rolling publication reservations, recent attempted topics, active slot/lease, next slot/due time and truthful last outcome. Disabled records omit `nextRunAtUTC`.
- `pincraft_accounts/{sha256(uid)}/blog_automation_slots/{UTC-instant}`: unique scheduled instant, immutable AI/library/job request IDs, evidence, title, article checkpoint, private Library draft ID, editorial result, content fingerprint and outcome. Sources are headlines/dates/links, not independently verified full-text reporting.
- `publisher_system/blog_automation`: aggregate generation heartbeat. Separate from `publisher_system/reviewed_blogger`, which records direct Blogger checkpoint execution.
- Existing private AI request/usage receipts enforce budgets and no silent repeat. Generated articles are ordinary owner-scoped Library drafts with metadata `source:recurring_automation`, not fabricated owner-written or per-article-reviewed content.

Generation stages: `select → article → quality → approved → queued`, or finite retry/skip/cancel. Preparation lead 90 minutes, first notice at least 45 minutes, minimum register notice five minutes. One AI task per invocation; article and quality use stable request keys and inputs. A lost checkpoint can retrieve a genuine saved result; spent/uncertain AI requests are not repeated with new keys.

An approved article can enter the publisher only through a server-internal repository function. The transaction verifies live recurring consent, owner, revision, destination, active generation lease, exact slot/UTC instant/job ID, successful editorial receipt and normalized article fingerprint. In the same transaction, it writes the job/owner view, consumes the slot, reserves the daily ceiling and advances the config. Automatic jobs have `reviewedAt:null`, their real `recurringConsentAt`, `source:recurring_automation`, evidence and editorial limitations; no manual Pin child.

The configured local-day ceiling and hard six-in-any-rolling-24-hours ceiling include existing future reservations, across all settings revisions/timezone changes. At least one-hour spacing. Quota and attempted-topic history are not reset by save/pause. Missed slots skip rather than late-publish/backfill.

Immediately before **each** automatic Blogger mutation, the existing lease/site/capacity/connection-lock transaction also rereads the current recurring config and exact queued slot. Pause, changed consent, a new revision or reconnection fails closed. Already-registered schedules may still complete read-only LIVE/public verification after pause; no remote delete/revert/unschedule is claimed.

### Workload security

Issuer `https://token.actions.githubusercontent.com`, RS256, short token age; audience `https://pincraftly.vercel.app/api/internal/blog-automation/tick`; repo `gmrony135/PinCraft`, numeric repository ID `1456649831`, public visibility, `refs/heads/main`, exact `.github/workflows/pincraft-reviewed-blogger.yml@refs/heads/main`, schedule/manual-dispatch event, valid run/attempt/jti and SHA equal to Vercel’s current deployed commit. Wrong audience, forks, PRs, private repo, legacy workflow, old commits, expiry and replay are rejected. Production configuration is not enabled by a browser test flag.

GitHub gets `id-token:write`, not repo write. Existing AI credentials remain solely in the already-configured Vercel generator. The CLI bridge returns allowlisted aggregate counters only. Its failure never bypasses consent or prevents already-authorized specific-article jobs from being processed. No production script imports the legacy worker to implement this feature.


### Non-public draft/schedule receipt URLs

Numeric original post ID, matching blog and recognized expected status remain required. An editor/preview URL in an accepted draft or SCHEDULED receipt is **not** a public permalink: discard an invalid/non-public hint and any query token instead of losing the saved ID or inserting again. Safe allowlisted diagnostic booleans/status may be stored privately, never a preview token. `draftURL` is optional and never a result URL. Final `live()` still requires strict same-blog query-free URL plus ADMIN LIVE and a matching unauthenticated public page.

For an old `needs_review` job, marker-bound explicit owner inspection can recover the existing ID even when Blogger returns only an editor URL. Pause/revision/reconnection authority is checked again before any subsequent mutation. This is not automatic recovery or forged inspection; attempts/IDs are not reset. The Jobs table exposes the genuine saved Job ID/Post ID so identical titles can be distinguished.


### Existing-post search, explicit verification and stopped-article recovery

| Method / path | Boundary / result |
| --- | --- |
| `POST /api/publish/jobs/{id}/inspect` | Signed-in owner, same-origin strict empty JSON `{}`; `needs_review` Blogger jobs only. Requires the original Google identity and same current verified blog. It does **not** ask the owner to claim that a missing post was found. Returns `providerReadOnly:true`, `resumed:false` and the saved owner-safe job/diagnostic |
| `POST /api/publish/jobs/{id}/review` | Existing strict `action:verify|abandon`, `inspected:true` contract. Only Verify can resume an exact marked existing post; a changed connection revision still requires explicit original-account reconfirmation. Abandon is an explicit local stop, never a remote delete |
| `GET /api/publish/jobs/{id}/article` | Signed-in owner only; returns only a **cancelled** Blogger job's original article title, validated review HTML, optional featured-image URL and original website hint. Active/uncertain jobs return 409; foreign jobs return 404. No replacement record is created |

The search endpoint rejects injected post IDs, provider cursors, payload/content, authority and inspection flags. Google calls remain scoped to the immutable original blog. OAuth renewal can write its existing token lease/version; safe diagnostics intentionally write locally. Provider-read-only does not mean database-read-only.

1. Request `users/self/blogs/{originalBlogId}` and require original blog ID, administrator access and the original verified URL. This independently distinguishes blog access from post lookup failures.
2. For a saved/supplied numeric ID, perform its direct ADMIN content read. Only a **post 404** permits pagination fallback. A read-only search with no saved ID may search its own job marker directly; it never invents an ID. A successful direct read must itself contain the exact original blog, recognized status and marker. Other HTTP failures do not trigger a list bypass.
3. Read the same blog's [ADMIN post lists](https://developers.google.com/blogger/docs/3.0/reference/posts/list) for Draft/Scheduled/Live. Three bounded status streams, `fetchBodies=true`, `maxResults=25`, `orderBy=updated`, minimal fields. Follow provider-issued `nextPageToken` **in memory only**, URL-encoded into the same fixed Google path. Never accept a cursor/host from the browser. At most ten pages/status, thirty list reads, 750 posts and a 42-second scan deadline; a repeated/invalid cursor or provider failure is incomplete, not absence.
4. Save neutral per-status page/post counts and completeness. `missing` means every returned status listing ended without the marker **at that time**; `limited` means unchecked pages remain. Neither proves physical deletion or authorizes a new insert. Old first-page-only `missing` diagnostics are projected as limited, never promoted into a complete-search claim.
5. Marker matches require a numeric ID, exact original blog ID, recognized DRAFT/SCHEDULED/LIVE status and this exact job marker. Search only displays the candidate. Even an exact saved-ID search result cannot queue/resume a job. Ambiguous matches remain blocked. An ID-fill button clears the inspection attestation, so the owner must actually inspect and Verify separately.

Only OAuth reconnect errors/401 receive reconnect guidance. A generic 403 receives neutral denial guidance; the status alone cannot establish whether permission or a provider limit caused it. No raw provider body is retained.

Private `inspectionDiagnostic` checkpoints contain allowlisted neutral HTTP/status/count/ID flags. Owner projections expose a fixed-message object, never unrelated titles/content/IDs, preview URLs, tokens or cursors. Optimistic job status/version guards prevent an in-flight search from overwriting a concurrent owner stop. No failed search changes `remoteId`, attempts, payload, target, mutation uncertainty or publication authority.

### Ending a missing-post loop without a blind replacement

After actually checking Blogger, an owner may explicitly stop a job using the existing inspection attestation. The job becomes cancelled; its ID, old attempts, original article and inspection history remain saved. It is not a successful publication and no remote post is removed.

`Review saved article again` resolves only the signed-in owner's cancelled job through the protected article read. It restores the exact safe HTML, not generated substitute text; no old schedule, request/attempt reset or publication/recurring consent is transferred. The composer starts unchecked with a fresh schedule. Loading the page makes no create, insert or publish request. Any subsequent submission requires a separate explicit content/destination review and owner command; this recovery read does not authorize one.

Creating a different request ID while an owner has another `needs_review` job for the same exact normalized article and blog is transactionally blocked with `unresolved_article`. Existing immutable-request replays remain valid. Other content is not blocked by title alone. The bounded owner-view query fails closed if its 100-uncertain-record ceiling is reached; no new index, cleanup, rules or billing changes are required.

DRAFT Verify still resumes only the existing ID's publish checkpoint. Paused/changed recurring authorization is rechecked before a subsequent mutation. The runner never invokes owner search/recovery automatically. Final `live()` remains strict direct ADMIN LIVE plus independently matching unauthenticated public page; no inspection list result can convert a final verification 404 into success.
