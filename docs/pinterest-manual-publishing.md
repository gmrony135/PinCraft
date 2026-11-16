# Manual Pinterest Publishing Workflow

PinCraft prepares an owner-scoped Pin job and opens Pinterest's official Save/Create interface. The user signs in to Pinterest themselves, chooses a board, reviews the form and manually clicks Save. PinCraft does not use the Pinterest API, OAuth, a password, browser session, cookie, CAPTCHA handling or automated publishing clicks.

## Honest status model

| Stored state | Meaning |
| --- | --- |
| `pin_prepared` — **Pin Prepared** | The owner reviewed the image/copy/destination; PinCraft validated and stored a normalized image. Nothing has been sent to Pinterest. |
| `pinterest_opened` — **Pinterest Opened** | The owner clicked the official Pinterest Create link. Opening a page is not a save or publication receipt. |
| `user_confirmed` — **User Confirmed** | The owner explicitly reports choosing a board and clicking Save. PinCraft has not independently verified it. |
| `published` — **Published · user-reported** | The owner supplied a Pinterest Pin URL and confirmed checking it. This is not Pinterest API verification. |
| `failed` — **Failed** | A bounded validation check did not pass. The workflow has not attempted to publish the Pin. |

The dashboard keeps activity timestamps and job IDs, exposes pending/completed/failed filters, offers safe validation retries (maximum three attempts), and retains the exact user-reported Pin URL. The separate image-validation result never rolls back a manual milestone already recorded by the owner; a validation warning can coexist with a user-reported Published status. The API never changes a job to Published just because a Create page opened or the file was prepared.

## Image privacy and validation

Preparing a job is an explicit, unchecked-by-default consent action. PinCraft accepts one PNG, JPEG or WebP portrait image; rejects animation, malformed bytes, unsupported formats and excessive dimensions/pixels; normalizes it to a 1000 × 1500 WebP; strips source metadata; and limits the stored output to 650 KB. The original filename and original image bytes are not retained. The normalized image bytes live in a separate Firestore document tied to that owner's job, and are never returned by the JSON API.

Pinterest must be able to fetch the image. PinCraft therefore serves the normalized copy at a signed HTTPS image URL, using the existing server-only `AUTOMATION_ENCRYPTION_KEY` and `APP_URL`. Anyone who obtains that signed URL can view the image; the UI explains this before the owner consents. The URL contains no Pinterest credential. Firestore client rules remain deny-all; all job, settings, status and history reads/writes use authenticated owner-scoped server APIs.

The destination is validated as a public HTTPS URL without embedded credentials, private/local addresses, custom ports or a fragment. Title and description are plain text and length-limited. The official Pinterest Save/Create link passes only the supported image URL, destination URL and description. PinCraft stores/copies the title separately; the user reviews any fields Pinterest does not prefill.

## GitHub Actions validation worker

`.github/workflows/pincraft-pinterest-manual.yml` runs on a 15-minute schedule or deliberate `workflow_dispatch`. It has only `contents: read` and short-lived `id-token: write`; its workflow is guarded to the public `gmrony135/PinCraft` repository, `main`, and the opt-in repository variable below. It has **no Pinterest or Firebase secrets**. The Node 24 script (`scripts/run-pinterest-publishing.mjs`) requests an OIDC token for the fixed PinCraft endpoint and sends an empty request body. The server verifies the token's issuer, audience, repository ID, public visibility, exact workflow/ref, event, run, attempt, expiry and current production deployment SHA; replayed runs are rejected.

The Node/Sharp worker on the authenticated PinCraft server rechecks at most ten saved private image records per run: owner/job binding, stored SHA-256, actual WebP bytes, 1000 × 1500 dimensions, metadata policy, title/description and destination URL. It records validation/activity status with a two-minute lease, finite retries and safe error messages. GitHub Actions never downloads a user's image or receives Pin content. This is an integrity check, **not a Pinterest publisher**. No browser or Playwright code visits Pinterest.

### Enable the workflow (optional)

1. Deploy the code to the existing production project with `APP_URL=https://pincraftly.vercel.app`, the existing Firebase Admin/Firestore configuration, and the existing valid `AUTOMATION_ENCRYPTION_KEY`. No new Pinterest secret or OAuth app is required.
2. In `gmrony135/PinCraft` → **Settings → Secrets and variables → Actions → Variables**, set `PINCRAFT_PIN_MANUAL_WORKFLOW_ENABLED` to `true`.
3. No Actions secret is required for this workflow. Use the Actions run summary and each user's Jobs dashboard to inspect only aggregate runner health and that owner's individual validation/activity history.
4. If the variable is unset/false, the schedule and manual dispatch are intentionally no-ops. This does not prevent the authenticated app from preparing a Pin; server-side validation is performed before the job is saved.

Do not enable Pinterest API variables, add Pinterest access tokens, grant repository write permission or weaken the OIDC workflow/commit checks. Existing Blogger Actions secrets belong only to the separate Blogger workflow.

## Endpoints and records

- `GET /api/pinterest/publishing`: current session user's jobs, private default destination and aggregate worker heartbeat.
- `POST /api/pinterest/publishing`: strict `prepare`, `settings`, `opened`, `confirm`, `published` and bounded `retry` actions; same-origin/session checks, input validation, per-user rate limits, idempotency keys and 24-hour same-content duplicate suppression.
- `GET /api/pinterest/publishing/image/{id}?sig=…`: public, signed, read-only WebP delivery for Pinterest's fetcher.
- `POST /api/internal/pinterest-publishing/tick`: exact GitHub OIDC workload only; no browser cookies or user-supplied job list.
- `pincraft_pinterest_publish_jobs`, `pincraft_pinterest_images`, `pincraft_pinterest_settings`, and hashed rate/dedupe documents: server-only Firestore records. `firestore.rules` continues to deny direct client reads and writes.

Manual Pin settings currently store only the signed-in user's default destination URL. No board is stored or selected by PinCraft. Existing Blogger jobs and manual Pin-pack behavior remain separate.

## Verification

Run `npm run test:pinterest` for deterministic validation, dedupe, owner-isolation, lifecycle and workload-policy tests. `npm run build` checks the Next.js routes/components. The existing Playwright tests are limited to PinCraft's local UI and APIs; do not use Playwright to log in to Pinterest, navigate its authenticated pages, defeat CAPTCHA/anti-bot controls, or click Save.
