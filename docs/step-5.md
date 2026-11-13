# Step 5 — Adsterra Income + My Library

Two new routes only:

- `/adsterra-income`
- `/library`

Existing page sources, shared navigation/footer/styles, generators, and the original `lib/library.js` are unchanged. The existing My Library nav link now resolves to the new page. A link within My Library leads to Adsterra Income, which links back to My Library.

## Part 1 — Adsterra Income

- Requested title and sub-text.
- Three demo overview cards: **Today's Views 1,250**, **Today's Clicks 340**, **Today's Earning $3.75**.
- A labeled, multiline **Paste Your Adsterra Ad Code Here** editor and red **Save Ad Code** button.
- Real local persistence: exact pasted text plus a save timestamp in `localStorage["pincraft.adsterra.v1"]`. Restores after reload; unsaved edits do not overwrite saved code.
- Empty/whitespace and over-50,000-character validation, saved/unsaved state, last-saved time, and honest storage-denied error handling.
- Requested blog-ad note, explicitly qualified as the behavior **after blog integration is connected**.
- **Income History** table: Date / Views / Clicks / Earning, exactly five demo rows, a $17.60 five-day demo total, and internal horizontal scrolling on narrow screens.

### Integration boundary

Income data is **demo data**, not a live Adsterra report. Pasted code is stored as text and **never executed, injected, or fetched** by this page or the library reader. Blog ad rendering, live reporting, and cross-device sync are not connected in this step. No existing article page has been modified. Do not paste passwords or API keys into the ad-code field.

## Part 2 — My Library

- Requested **My Library** title and **All your saved Pins and Articles** sub-text.
- Accessible **Saved Pins** and **Saved Articles** tabs. Arrow keys, Home, and End select/focus tabs.
- Each empty collection shows **six clearly labeled demo cards**; demo data is never inserted into the user's saved library.
- Existing Pin Generator saves are read from `localStorage["pincraft.library.v1"]`, one card per saved pin pack, using its primary title. Each **Copy** button copies that exact title, with a working selection fallback and an honest retry state on failure.
- Existing Article Writer saves (including `published` entries) appear as articles. Published duplicates are deduplicated by source ID. Real content replaces examples for that collection.
- Every **Read** button opens the actual full article in a native modal reader with internal scrolling, full-article Copy, focus trapping, Escape/close controls, background-scroll locking, and restored trigger focus.
- Plain saved text is supported safely; HTML is displayed as text, not executed. Title-only records offer a real Article Writer link instead of inventing a body.
- Case-insensitive title/topic search, recoverable no-match state, six cards per page, working pagination for larger saved collections, and cross-tab storage updates.
- Invalid records are ignored; corrupted/blocked storage shows a warning and examples without overwriting saved data.

## New source files

- `app/adsterra-income/page.js`, `app/library/page.js`
- `components/income/AdsterraIncome.js`
- `components/library/MyLibrary.js`, `ArticleReader.js`, `ContentCopyButton.js`
- `lib/income.js`, `lib/library-content.js`
- `scripts/check-step-5.js`

## Verification

```bash
node scripts/check-step-5.js
BASE_URL=https://pincraftly.vercel.app node scripts/check-step-5.js
```

**87/87 checks passed** against the production build, zero browser console errors. Includes all twelve demo card actions, real clipboard reads, modal clipboard fallback, focus trapping/restoration, actual existing-page save integration, deduplication, search/pagination, cross-tab updates, malformed/denied storage, and proof that pasted scripts are neither executed nor requested.

Responsive checks: 320px, 390px, 640px, 768px, and 1440px. The 640px tab/search overlap was fixed by stacking the toolbar below the medium breakpoint. Primary mobile controls have at least 44px tap targets; editors use 16px mobile input text.

Regression checks: homepage **15/15**, Pin Generator **21/21**, Article Writer **24/24**, Dashboard **54/54** — **114/114** total, no console errors.

Production build passed. Both new routes are static: Adsterra Income about **105 kB** first-load JavaScript; My Library about **118 kB**, with no new package dependency.

Screenshots: `docs/screenshots/adsterra-income-{desktop,mobile}.png` and `library-{pins,articles,reader}-{desktop,mobile}.png`.

Stop any running Next.js development server before `npm run build`; development and production share `.next`.
