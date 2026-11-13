# 📌 PinCraft

**Pinterest + Blog Automation in 1 Click** — *Crafted Pins, Daily Traffic*

A mobile-app-style web app built with **Next.js 14 (App Router)** and **Tailwind CSS**.
Every screen is designed for a 390px phone viewport first, and every button is functional.

---

## 🔗 Live

| | |
|---|---|
| **Live website** | **https://pincraftly.vercel.app** |
| **GitHub repo** | **https://github.com/gmrony135/PinCraft** |
| Vercel project | https://vercel.com/gmrony135-9877s-projects/pincraft |

Every push to `main` auto-deploys to production (tested and verified).

---

## 📱 Screens

### 1. Landing `/`
- PinCraft logo (red Pinterest-style pin + craft pencil) with the tagline
- Headline: *"Pinterest + Blog Automation in 1 Click"*
- Sub headline: *"Choose category, AI will craft Pin + Blog daily. You just relax."*
- Buttons: **Get Started Free**, **Login**
- 9 niche cards: Home Decor · Food · Fashion · Beauty · DIY & Crafts · Gardening · Quotes · Travel · Art (tap → signup)
- How it works: 1. Connect Pinterest → 2. Choose Category → 3. AI Crafts & Posts Daily

### 2. Signup
- Full Name, Email, Password (with show/hide)
- *Do you have a Pinterest account?* **Yes / No**
- Category dropdown: the 9 niches below
- Inline validation, terms checkbox, **[Create Free Account]**

### 3. Login
- Email + password, session persists across reloads

### 4. Dashboard
- Welcome + first name, **Plan: Free** badge
- 4 stat boxes: Total Pins Created · Total Blogs · Pinterest Connected · Today's Task
- Big **Connect Pinterest Account** button
- Category selection (single select, 9 niches)
- Quick actions + recent content list
- Bottom tab bar: Home · Create · Schedule · Settings

### 5. Create Content
- Topic input with example chips
- **[Generate with AI]** produces, in ~1s:
  - 5 Pinterest pin titles (US style)
  - 5 Pinterest descriptions with hashtags
  - 5 image prompts (2:3 pin format)
  - 1 blog post, **~700 words**, with title, SEO keywords and meta description
- Accordion sections, copy button on every item
- **[Post to Pinterest]** and **[Post to Blog]** buttons mark state + toast

### 6. Schedule
- How many pins per day: **3 / 5 / 10**
- Post time (USA): **9 AM / 12 PM / 6 PM / 9 PM**
- Posting days picker (S M T W T F S)
- Real calendar view (month navigation) with pin dots per scheduled day
- **[Save & Start Automation]** → shows active automation card with stop action

### 7. Settings
- Blog Website Link · Pinterest Profile Link
- WordPress API Key · Pinterest API Key (masked, show/hide)
- URL + key-length validation, **[Save Settings]**
- Log out

### 8. Connect Pinterest
- Profile link → connect flow with loading state → connected card, disconnect option

---

## 🗂 Niches (9)

| # | Niche | Emoji |
|---|---|---|
| 1 | Home Decor & Home Organization | 🏡 |
| 2 | Food, Recipes & Cooking Ideas | 🍔 |
| 3 | Fashion & Outfit Ideas | 👗 |
| 4 | Beauty & Skincare | 💄 |
| 5 | DIY & Crafts | 💡 |
| 6 | Gardening & Plant Ideas | 🌿 |
| 7 | Love Quotes, Sad Quotes & Motivation | ❤️ |
| 8 | Travel & Lifestyle | ✈️ |
| 9 | Art, Aesthetic & Creative Ideas | 🎨 |

Every niche has its own hook lines, US-style title patterns, hashtag sets and
SEO keyword base, so generated pins actually match the topic. Old saved
categories (`sad`, `motivation`, `health`…) are mapped automatically by
`resolveCategory()` so existing state keeps working.

## 🏷 Brand assets

Official logo (pin + pencil, red) lives in `public/brand/`:

| File | Use |
|---|---|
| `pincraft-logo-original.jpeg` | original uploaded artwork (1600×1600) |
| `pincraft-logo-full-1024.png` | approved lockup (circle + wordmark) — used on the landing page |
| `pincraft-mark.png` | square mark tile |
| `pincraft-mark-red.png` | transparent red mark (light backgrounds) |
| `pincraft-mark-white.png` | transparent white mark (dark/red backgrounds) |
| `pincraft-icon.png` / `-192` | app icon / PWA |
| `favicon-16/32.png`, `apple-touch-icon.png` | browser + iOS icons |

The UI logo component is `Logo` / `BrandMark` / `AppIcon` in `components/ui.js`.

## 🎨 Design

- Clean white background, Pinterest red `#e60023`, black text
- Fully rounded buttons (52px tap targets), soft cards, subtle shadows
- Mobile-first single-column, sticky bottom nav, safe-area padding
- Works perfectly down to 360px width and up on desktop (centered app frame)
- Inline SVG logo (no external assets), color-emoji safe

## 🧠 How the "AI" works (frontend-only phase)

Content is generated **locally in the browser** (`lib/store.js`) using a
category-aware template engine — deterministic, instant, offline, and free.
There is no API key required for this phase. Real model calls can be plugged in
later via the keys in Settings.

All app state (user, pins, schedule, settings) is persisted in `localStorage`,
so a reload keeps your session, pins and automation.

---

## 🚀 Local development

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## ✅ Tests

A Playwright mobile-viewport E2E suite covers every screen and flow:

```bash
node scripts/e2e.js                       # against localhost:3000
BASE_URL=https://pincraftly.vercel.app node scripts/e2e.js   # against live
```

**Result: 21/21 passing, zero console errors** (verified on both local and live).

## 🗂 Structure

```
app/                 layout, page, global styles
components/
  AppShell.js        routing, state actions, guards, bottom nav
  ui.js              Logo, buttons, fields, toast, icons
  screens/           Landing, Signup, Login, Dashboard, Content,
                     Schedule, Settings, Pinterest
lib/store.js         persistent store + AI content generator
scripts/e2e.js       Playwright E2E (mobile viewport)
docs/screenshots/    app screenshots
```

---

## 🔒 Notes

- No secrets are committed; `.env*`, credentials and caches are gitignored
- The tool auto-commits and pushes to `main` after every code change
