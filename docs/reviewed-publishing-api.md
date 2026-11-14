# Reviewed Blogger publisher: API and durable data contract

Current flow is `blogger_manual_pin`. See [owner setup, বাংলা](blogger-manual-pinterest-setup.bn.md) for secrets, callback and activation. Old Worker bridge endpoints/Pinterest API contracts are not this API.

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

`imageSource` is `local_download` or `public_url`. In public URL mode `imageUrl` is required; local upload bytes are never submitted. `pinReadyAtUTC` is **not** the old `pinPublishAtUTC`. No Pinterest connection, board, Trial acknowledgment or mandatory image host is required.

Creation returns `{job, replayed}` with HTTP 201. The raw reviewed request fingerprint is immutable for a request UUID; replay returns that existing owner job even if its original due time has passed. Changed content under the same UUID returns 409. A UUID belonging to another owner returns 404, not its receipt. A new UUID is not a reconciliation strategy for an uncertain remote send.

`configured:true` in status means this local implementation/mode is selected. Actual provider configuration is **`providers.blogger.configured`**; saved connections require successful genuine OAuth, and heartbeat alone does not prove provider access.

## Firestore

- `publish_jobs/{uuid}`: private authoritative parent/child records. `flow:'blogger_manual_pin'` identifies this implementation.
- `pincraft_accounts/{sha256(uid)}/publish_job_views/{uuid}`: owner-safe projections, including manual copy only after the real article URL is released.
- Existing `connections` and `websites` subcollections: unchanged encrypted per-owner grants and administrator destinations; no new shared refresh-token document.
- `publisher_system/reviewed_blogger`: summary heartbeat for **this** runner. No owner IDs, content, URLs, grants or provider error objects in CI heartbeat/logs.

Parent fields include `ownerUID`, `type:'blogger'`, `status`, `phase`, `publishAtUTC`, `pinReadyAtUTC`, `timezone`, immutable reviewed payload/account-key/revision/site snapshot, `remoteId`, `draftURL` (private), `resultURL` (LIVE/public only), one predetermined `manualTaskId`, `attempts`, `attemptOpen`, `lease`, `leaseUntilUTC`, `mutationPending`, `reviewedRunAtUTC`, fingerprint and audit timestamps.

The one due query is `reviewedRunAtUTC <= now`, ordered/limited on that same field. New jobs are due immediately to register future Blogger publication in advance. Terminal rows **omit** that field rather than retain an old due timestamp. Default single-field indexes suffice for the new collections; existing production index/TTL policies are not redeployed here. Browser rules remain deny-all; Admin access must already be authorized.

Manual children contain `type:'manual_pin'`, `bloggerJobId`, reviewed Pin copy/image reference, the verified `articleURL`, manual target, reminder state and optional `reportedPinURL`. They never contain an API Pinterest post ID/token or a provider-verified Pin receipt. Browser-downloaded image files are not retained in these documents.

## Checkpoints and race handling

1. **Claim:** transaction checks owner/flow/due/lease and opens or continues a logical attempt. Eight-minute lease; three logical attempts maximum. Repeated harmless LIVE polls do not spend attempts.
2. **Authorize:** read the current managed account, original Google identity/revision and verified site. Capacity is checked on create, retry and immediately before each mutation.
3. **Before mutation:** one transaction reads job/connection/sites/subscription, rechecks lease/context and writes `mutationPending`. A per-connection `reviewed_publish_job` + lease + expiry locks concurrent mutations and OAuth replacement. Token rotation preserves that lock.
4. **Draft:** POST `posts?isDraft=true`; include `<!-- pincraft-reviewed-job:{uuid} -->`; persist ID before the separate publish checkpoint. Valid ID on an otherwise unexpected accepted result is retained for inspection.
5. **Publish:** POST the saved ID's `/publish` endpoint; optional future `publishDate`, **no body**. Validate response/ADMIN state; malformed JSON, declared/streamed oversized bodies and unconfirmed acceptance become review, not another publish call.
6. **Verify:** due ADMIN GET must confirm that post as LIVE with a nonfuture publication timestamp; separate unauthenticated, DNS-pinned HTTPS HTML GET must match this post. Redirects/login-only/private/unmatched pages do not count. Only then atomically complete parent and create its one manual child.
7. **Failure:** bounded backoff for definite rejections/read-only transport failures; a 429 stops this runner run. Mutation timeout/5xx, lost commit acknowledgement or recovery of an expired mutating lease requires remote inspection. If a successful checkpoint write is rejected, its accepted ID is retained in the failure record where possible. If all post-send writes fail, the durable pre-send marker forces inspection after lease expiry. A lost acknowledgement after a successful checkpoint resumes only its saved next phase. Retry never resets IDs/counter.
8. **Review:** owner must attest inspection. A supplied existing post ID must return from the selected blog and contain this exact job's marker. DRAFT resumes publish on the same ID; SCHEDULED/LIVE resume read-only verification, not insertion. Abandon records no success and deletes nothing remotely.

OAuth start/save race on the same connection document as mutation locking. Disconnect may delete credentials immediately during a send, but retains the short-lived lock until the in-flight checkpoint settles/expires; it cannot restore grants or let a late result overwrite a replacement lease. Already-sent publication can finish. A future schedule already accepted by Blogger must be canceled in Blogger itself, not by deleting a local grant.

## Validation evidence

Reproducible test commands are in the setup guide. New suites exercise real local Auth/Firestore transactions and production-build API/UI code with **explicit synthetic Google/Blogger/public-page replies**. Unit tests inject a synthetic transport; browser integration uses a guarded, process-only preload that denies other external publishers. No request flag can activate those doubles in production.

Production-only runner dependencies are checked separately from the website/dev toolchain. Historical Worker/legacy tests are regression context only, not evidence of genuine owner consent, Google credential configuration, actual Blogger publication, scheduled production execution or Pinterest visibility.
