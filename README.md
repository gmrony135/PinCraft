# PinCraft — Your Pinterest Automation Machine

A Pinterest content-workflow **UI/prototype**: turn a topic into pin ideas and SEO article drafts, keep content in a device-local library, and preview automation and income dashboards.

**Live:** https://pincraftly.vercel.app
**Repository:** https://github.com/gmrony135/PinCraft

Pushes to `main` automatically deploy to Vercel. The repository's post-commit hook automatically pushes committed changes.

## Completion status

All five page-building steps and the final **UI-first** polish step are implemented. Google OAuth is **not configured**. Publish/automation confirmations are explicitly labeled demos. No live Pinterest posting, remote blog publication, live ad reporting, or cloud sync is claimed.

| Route | Working features |
| --- | --- |
| `/` | Landing sections, connected generator CTA, dismissible welcome popup |
| `/pin-generator` | Local niche-aware titles, description, hashtags, image idea, real Copy/Save, title handoff |
| `/article-writer` | Local structured 500–800-word drafts, stats, Copy/Save, clearly labeled demo publish |
| `/dashboard` | Demo analytics, editable device-local posting preferences, ON/OFF demo confirmations |
| `/adsterra-income` | Labeled sample income/history, inert device-local ad-snippet editor |
| `/library` | Real saved pins/articles, demo examples for empty collections, search, pagination, full reader |
| `/login` | Google popup entry, honest configuration-pending state, setup information |
| `/about` | Product overview and integration boundaries |
| `/contact` | Real public issue-tracker links; no dummy contact form |

The shared Navbar tracks the current page and includes all six product routes. Mobile navigation, native modals, keyboard focus, Escape, clipboard failures, and blocked-storage behavior are tested.

## Google Login foundation

The Navbar button opens a Google popup. Until the site owner configures OAuth, it clearly shows **Google Login needs setup** and never invents a logged-in identity.

The server foundation validates Google-signed RS256 credentials, audience/issuer/expiry/age, verified email and an HttpOnly nonce before issuing a signed HttpOnly session. A genuine verified session drives the Navbar username/account menu and My Library marker. Sign-out clears the session.

See `.env.example` and `/login#setup` for future deployment configuration. The public OAuth Web Client ID, authorized JavaScript origin, and server-only session-signing secret must be set before real Google sign-in is available. No real credentials are committed. Offline auth tests and an isolated signed-in UI fixture are **not** a live Google OAuth test.

## Storage and integration boundaries

- `pincraft.library.v1`: browser-local pins, articles, and demo publication records; up to 100 raw saves.
- `pincraft.automation.v1`: local posting preferences, **not** a running scheduler.
- `pincraft.adsterra.v1`: exact pasted snippet stored as inert text; never executed/injected by the editor.
- Empty library collections show six labeled examples without writing them to storage.
- Dashboard/income figures are examples, not API-derived reports. Income is not guaranteed.
- Account login does not yet provide account-scoped cloud content or cross-device sync.

## Stack and design

Next.js **15.5.29**, React **18.3.1**, Tailwind CSS 3.4, Lucide icons, `jose` for server-side token verification. Pinterest red **#E60023**, white surfaces, black text, rounded cards, English UI, mobile-first layouts and reduced-motion support. Google SDK/auth dialogs load on demand; local content generation has no artificial network delay.

A compatible patched PostCSS override removes Next's old bundled PostCSS advisories. Clean install and audit were verified with **0 known vulnerabilities** at release verification time.

## Development

```bash
npm ci
npm run dev -- --hostname 0.0.0.0
# Stop the dev server before building:
npm run build
npm run start -- --hostname 0.0.0.0
```

Never run development and build simultaneously: both use `.next`.

## Verification

With a production server running on port 3000:

```bash
node scripts/check-home.js             # 15 checks
node scripts/check-pin-generator.js    # 21
node scripts/check-article-writer.js   # 25
node scripts/check-dashboard.js        # 54
node scripts/check-step-5.js           # 87
node scripts/check-auth.js             # 35 offline crypto/auth guards
node scripts/check-final.js            # 74 final UI checks
npm audit
```

**Final local production verification: 311/311 passed**, zero browser console errors. Responsive coverage includes all nine routes at 320 / 390 / 640 / 768 / 1024 / 1440px. Final modal checks also cover 320×568px. If Playwright's browser is absent in a fresh environment, install it with `npx playwright install chromium`.

The UI suites support `BASE_URL=https://pincraftly.vercel.app`. Test artifacts are in ignored `.shots/`; selected screenshots are versioned under `docs/screenshots/`.

Full final-scope implementation and verification notes: [docs/final-step.md](docs/final-step.md). Prior step notes remain as historical release records.
