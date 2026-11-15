# PinCraft — Blogger publishing, category-trend automation & optional manual Pins

The existing Next.js website remains **https://pincraftly.vercel.app**. Existing AI generation, private Library, authentication and reviewer-gated billing are retained. The selected runtime is **`blogger_manual_pin`**: Blogger API v3 with encrypted per-owner offline OAuth; **Pinterest is optional and entirely manual/native-scheduler**.

**No Pinterest API, headless login/clicks, session-cookie collection, VPS, card/Blaze upgrade, Firebase Functions/Cloud Scheduler or new paid storage dependency.** Legacy Pinterest automation stays disabled.

## Start here

- **[Connector-এর recurring posts ও Blogger-only publishing — বাংলা](docs/blogger-trend-automation.bn.md)**
- [Full OAuth, Secrets, free-tier and recovery setup — বাংলা](docs/blogger-manual-pinterest-setup.bn.md)
- [Owner API, durable records and checkpoints](docs/reviewed-publishing-api.md)
- [Local validation and production acceptance boundary](docs/blog-automation-validation.json)

## A focused workspace

- **Connector** owns Blogger authorization, owned-blog verification and the single recurring-post editor. Account connection and recurring authorization remain separate. There is no standalone Automation setup page or menu; old `/automation` bookmarks redirect to `/connector#blogger-recurring`.
- **Content Studio** is a tool-selection hub. Article Writer and Pin Generator stay separate. Blog featured images, SEO/hashtags, the 7-day plan and editorial review each have one canonical tool page under `/content-studio/`.
- **Pin Generator** suggests the same ten `CATEGORIES` used across the product. Selecting a category fills the Pin topic and suggests a matching artwork prompt. Pin artwork is available directly on the page—even before generating Pin copy—and a generated Pin can prefill its own image prompt. Click **Post Info** to generate or reveal the matching title choices, description and hashtags; choose/copy the copy you want while the image remains available for download. A verified account and the existing daily image allowance are required; generated 1000 × 1500 WebP bytes stay in page memory for preview/download only, are not saved or hosted, and do not publish. Content Studio keeps a separate, blog-only 1200 × 630 featured-image tool, while Article Writer keeps its own three-image draft flow.
- **Account sessions** use a persistent, signed HttpOnly cookie so a page refresh does not log out a still-valid user. PinCraft rechecks the managed Firebase account; temporary account-service failures keep the saved session and offer a retry rather than silently showing a signed-out state.
- **Publish article** is the single reviewed publishing form, with Publish now and custom-date Schedule. Article Writer explicitly saves a private draft and hands it to that same review instead of duplicating the form; **Jobs** retains actual checkpoints, inspection/recovery and optional manual Pin packs. No existing private jobs or drafts are removed by this UI change.

## Two explicit authorization paths

### Publish one article — Pinterest Pin artwork is separate

Open **`/publish`**, paste the complete article or select an owned Cloud Library draft. The reviewed article must be 1,000–1,600 words. An AI-generated Library source must also have its saved AI cover and two section images; Pinterest Pin art is not a substitute. A sole ready owned blog can be preselected, but this never authorizes publication. Review the exact title/HTML/blog, then explicitly authorize **Publish blog now** or **Schedule Blogger post**.

**Include optional manual Pin pack is OFF by default.** Blogger-only input contains no Pinterest Pin copy, artwork, image host or Pin target. The server creates no manual child. If you opt in, the existing strict copy/artwork review and export remain available. Final authorization is synchronously bound to the current review values; editing cannot retain an old checked approval for one render.

### Recurring current-topic generation — separate consent

Open **`/connector` → Blogger → Recurring Blogger posts** and expand **Set up recurring posts** (or **Edit recurring posts**). Select your verified blog, 1–3 categories, optional narrowing topic, English/Bengali, trend region, IANA timezone, daily ceiling **1–6**, and each editable time. New schedules start at one daily slot; selecting six suggests **08:00, 10:30, 13:00, 15:30, 18:00, 20:30** in the chosen timezone. They are suggestions, not measured or universal “perfect” times.

Saving paused settings or connecting Blogger starts nothing. A separate unchecked authorization explains that future AI articles can publish **without individual owner review**, using the existing AI quota. Saving new active settings requires fresh recurring consent. Pause stops new generation/unsent Blogger mutations; already in-flight calls may finish, and schedules already registered in Blogger must be managed there.

## Evidence and quality, without fake trends or filler

- Read bounded XML from fixed Google Trends and category-constrained Google News RSS hosts. Reject entities/DOCTYPE, stale dates, unsafe/private URLs and unrelated titles. Never fetch/execute feed HTML or follow source links during discovery.
- Prefer a **category-relevant Google Search trend** with relevant source headlines. Otherwise require a fresh category-news cluster with **two distinct publisher names**, explicitly labeled **news signal, not measured search demand**. Publisher names do not establish independent fact verification.
- Rank by explicit category/topic relevance, freshness, source diversity and search-trend confirmation. No invented search volume, popularity analytics or claim to know the objectively best topic on the internet. No static editorial angle masquerades as a current trend.
- Deduplicate attempted/generated topics for seven days. Reuse the existing AI provider/model fallback and transactional text/image quotas, plus idempotent private AI receipts. No silent repeat of a spent provider request; no offline template fallback.
- Require a **1,000–1,600 visible-word** original article: one focus-keyword 50–60-character title/H1, 100–150-word introduction, clickable contents list, four substantive H2/H3 sections, a dedicated Tips & Common Mistakes list, 3–5 useful FAQs and a concise conclusion with a gentle next-step CTA. SEO fields include a 140–160-character meta description, focus keyword, 5–10 secondary terms used naturally and a short keyword-focused slug; meta description and slug are copy suggestions, not API-applied claims.
- Generate one featured cover and two relevant section illustrations with descriptive ALT text. Every image is normalized to **1200×630 WebP** and saved privately under the existing image quota. All three must be present before an AI article can enter the publishing job; the cover is placed first and section images beside their selected sections.
- Require **2–5 relevant LIVE Blogger posts**, verified against the selected blog, as internal links, plus **AI editorial score ≥82 with every check passing**. Manual publishing surfaces outbound source links for explicit owner verification; the AI never invents citations or claims it checked an external page. Recurring posts omit external links and continue without waiting for external-source review. These are editorial gates, **not independently verified fact-checking, plagiarism detection or SEO guarantees**.
- Store article and image records privately in Firestore; Blogger receives only signed, unguessable image URLs. Missing images, insufficient live links, quota exhaustion or failed review retain an explained private draft where possible and block publication. The SEO meta description is a manual-copy suggestion; PinCraft does not claim the Blogger API set it.
- Retain failed-quality drafts. Insufficient evidence, quota, failed checks or missed deadlines can yield **fewer than six** posts, with actual blockers shown.
- Begin preparation up to 90 minutes before a slot. Skip missed deadlines, never backdate or flood catch-up posts. A repeated DST wall-clock slot is used once; nonexistent slots are skipped. Enforce both the configured local-day ceiling and a hard six-reservation rolling-24-hour ceiling across settings revisions, plus one-hour spacing.

## Genuine Blogger publication

Both paths enter the same durable publisher:

1. Verify current managed owner, encrypted original Google identity/revision, verified administrator blog and subscription capacity.
2. Insert a **Blogger draft**, persist its real post ID, then publish/schedule **that same ID** using `posts.publish` and optional **`publishDate`**, with no request body.
3. `SCHEDULED` is not `LIVE`. Release the actual result URL only after due ADMIN `LIVE` plus an independent unauthenticated, DNS-pinned matching public article page.
4. Only a specifically requested manual Pin pack receives a manual child after live verification. Manual Pin links are always **user-reported, not API-verified**.

Blogger can return a non-public editor/preview URL in a draft or schedule receipt. Such a URL (and any preview query token) is discarded; it must not discard the genuine saved post ID or trigger another insertion. Only the separate strict ADMIN LIVE/public-page check releases a result URL. Existing `needs_review` jobs still require marker-bound owner inspection, never automatic approval. Jobs displays both immutable job ID and saved Blogger post ID to distinguish existing attempts.

**If Verify existing post returns 404:** use **Find existing post — read only** in Jobs. It checks original same-blog administrator access, then follows up to ten pages of 25 posts per Draft/Scheduled/Live status (at most 30 reads / 750 posts, with a 42-second scan deadline). Provider page cursors remain in memory. Coverage distinguishes complete returned listings from limited/incomplete reads; absence is never proof of deletion. Search only stores safe diagnostics/candidates: it does not change the saved post ID, attempts, consent or checkpoint. Only a subsequent owner-attested marker-bound Verify may resume the existing post. A generic 403 is not fabricated as a reconnect/quota diagnosis.

If no existing post can be reconciled, the owner may **Stop this job — keep saved article**, then **Review saved article again**. That opens the exact original safe HTML and optional featured-image URL in a separate unchecked review, not a new job or automatic replacement. The stopped record retains its old ID and attempts. New request IDs cannot bypass another unresolved job containing this exact article for the same blog. Stop/recovery never deletes a remote post, restores recurring consent, reuses a past schedule or weakens final direct ADMIN LIVE plus public-page verification.

Eight-minute publisher leases, connection locks, pre-send markers and immutable request IDs protect retries. At most three logical publisher attempts; counters/IDs never reset. Ambiguous mutations stop at `needs_review`, requiring marker-bound inspection, never blind insertion. Reconnection requires the original Google identity, site reverification and explicit reconfirmation. Disconnect cannot resurrect grants. Neither local pause nor disconnect deletes/unpublishes a remote post.

## Free guarded execution

`.github/workflows/pincraft-reviewed-blogger.yml` runs on best-effort cron **`7,17,27,37,47,57 * * * *`** or deliberate operator dispatch. Public repository **gmrony135/PinCraft**, `main`, and `REVIEWED_BLOGGER_SCHEDULER_ENABLED=true` are required; private repositories are skipped. Standard hosted runner, Node **24.22.3**, locked production dependencies, SHA-pinned official actions, one concurrent run, five-minute timeout and a 180-second combined soft deadline.

- The direct Node runner first invokes at most **one bounded generation stage** on the existing Vercel generator, then handles at most **4 due Blogger candidates / 12 checkpoints** directly in Node. A generation outage does not suppress previously authorized Blogger work.
- `contents: read` plus **`id-token: write`** permit a short-lived GitHub OIDC identity, not repository write access. The new internal endpoint pins issuer, audience, repository ID, public visibility, main ref, exact reviewed workflow and **deployed commit SHA**, and rejects replay of the same run/attempt.
- **AI keys stay in existing Vercel server configuration.** No new AI key, long-lived worker bearer, Vercel deployment token, shared user refresh grant or Pinterest credential is put in Actions/browser/source. Existing GitHub publishing secrets map Firebase Admin, matching encryption key and Google Web client.
- Vercel must expose its normal system environment, including `VERCEL_GIT_COMMIT_SHA`; `APP_URL` is exactly `https://pincraftly.vercel.app`. A workflow/deployment mismatch fails closed until the matching deployment is ready.
- The old `.github/workflows/pincraft-automation.yml` and `/api/internal/automation/tick` are **not** this generation path. Keep `LEGACY_PINTEREST_API_SCHEDULER_ENABLED=false` and the legacy workflow disabled.

Firestore Spark, Vercel, AI-provider and Google quotas apply project-wide. Standard public Actions scheduling is best effort, not exact-minute/always-on/unlimited-free service. No billing, IAM, browser Rules or TTL changes are required; new due queries use single-field indexes. Browser Firestore Rules stay deny-all.

## Main implementation

| Paths | Purpose |
| --- | --- |
| `lib/publishing/{content,blogger,repository}.mjs` | Optional Pin contract, durable Blogger-only/manual/recurring jobs |
| `lib/publishing/{blog-automation-policy,automation-contract,automations}.mjs` | Explicit settings/consent, slots/leases, quotas/revision binding and orchestration |
| `lib/publishing/{category-trends,automation-editorial}.mjs` | Fresh category evidence, ranking/dedup and editorial gates |
| `lib/publishing/automation-workload.mjs` | Exact-workload GitHub OIDC verification and replay protection |
| `app/api/publish/[...path]/route.js` | Owner-session and same-origin publication/settings APIs |
| `app/api/internal/blog-automation/tick/route.js` | OIDC-only, empty-body, bounded server generator stage |
| `components/publishing/{PublishComposer,BlogAutomationSetup,PublishingJobs}.js` | Independent Blogger review, real recurring controls, truthful results |
| `scripts/{run-reviewed-blogger,request-blog-automation}.mjs` | Direct publisher plus credential-free generation orchestration |

## Verification and acceptance

Local suites use explicitly guarded **demo Firebase/Auth emulators and synthetic RSS/AI/Blogger transports**. They are not genuine production posts, source popularity or actual editorial assessments. Process-only HTTP doubles cannot be activated through an app flag. Tests never install a production browser publisher.

```bash
npm ci
npm run test:firebase:setup
npm run firebase:emulators  # separate terminal; requires Java 21+
# second terminal, synthetic local values only:
set -a; . .cache/firebase-test.env; set +a
PINCRAFT_PUBLISHING_MODE=blogger_manual_pin npm run test:publishing
PINCRAFT_PUBLISHING_MODE=blogger_manual_pin npm run test:publishing:automation
npm run test:publishing:entry
node --test scripts/test-ui-consolidation.mjs
npm run build
```

The pre-existing `npm run lint` command is not configured (no ESLint dependency/config); it is **not** counted as passed. The production build and explicit regression suites are separate checks.

See the setup guide for the guarded Next/Chromium preload command. Historical legacy suites require their explicitly isolated `legacy_api` test mode; that is never a production activation instruction.

**Deployment, a valid OAuth connection, an empty manual runner and a saved schedule are different from publication.** Acceptance still requires a genuine owner-authorized saved job, ADMIN LIVE + unauthenticated public URL, and independently observed scheduled execution. No real owner consent, checkbox or recurring settings should be invented to satisfy a test. Historical run **43581615296** was an empty **manual** dispatch, not proof of recurring cron or an actual post. New release evidence must state its own results separately.

Private keys, `.env.vercel-import`, uploads, `.pki`, auth caches, generated logs and dependency/build folders never belong in source/ZIP. Preserve current billing/security and do not repeat old activation/shipping scripts.
