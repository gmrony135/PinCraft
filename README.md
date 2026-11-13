# 📌 PinCraft — Your Pinterest Automation Machine

Give a topic. PinCraft creates the viral pin, writes the SEO article and posts
it automatically. Pinterest sends free traffic → your blog shows Adsterra ads →
you earn.

**Formula:** `PinCraft = Pin Create + Article Write + Auto Post` · `Pinterest = Free Traffic` · `Blog = Content` · `Adsterra = Income`

---

## 🔗 Live

| | |
|---|---|
| **Live site** | **https://pincraftly.vercel.app** |
| **GitHub** | **https://github.com/gmrony135/PinCraft** |

Every push to `main` auto-deploys to Vercel production.

---

## ✅ Built so far

### Step 1 — Homepage (`/`) ✔

| Section | Contents |
|---|---|
| **Navbar** | PinCraft logo · Home · Pin Generator · Article Writer · Dashboard · My Library · Login button (mobile hamburger menu) |
| **Hero** | H1 *“PinCraft — Your Pinterest Automation Machine”* · sub-text · **Generate Viral Pin** (red) + **How It Works** buttons · live generator demo card |
| **How It Works** | 4 steps with icons: Give Topic → PinCraft Creates Viral Pin → Auto Article + Auto Post → Traffic → Income |
| **Features** | 3 cards: Viral Pin Generator · Auto Article Writer · Automation Dashboard |
| **Income Formula** | `PinCraft = Pin Create + Article Write + Auto Post` and the Pinterest → Blog → Adsterra pipeline |
| **Footer** | PinCraft · About · Contact (+ product links) |

### Step 2 — Pin Generator (`/pin-generator`) ✔

| Part | Contents |
|---|---|
| **Header** | Title *“Viral Pin Generator”* + sub-text, breadcrumb, free-tool badge |
| **Input** | “Enter your topic” field (placeholder `Sad Quotes`) + 6 example chips + validation |
| **Generate** | **Generate Viral Pin** red button (loading state, smooth scroll to results) |
| **Output 1** | 5 viral, emotional, US-style pin titles — **Copy** on each |
| **Output 2** | 1 SEO description, 100–150 words — **Copy description** |
| **Output 3** | 10 viral hashtags — tag chips (tap to copy) + **Copy all hashtags** |
| **Output 4** | Pin image idea (headline text, palette, layout, AI prompt + copy) |
| **Output 5** | **Generate Article For This Pin** (pre-fills Article Writer) + **Save To My Library** (persists) |

Niche-aware engine (`lib/generator.js`) detects the topic type (quotes, food,
home, beauty, wood… ) and uses matching hooks + hashtag sets.

### Next steps (not built yet)

- Article Writer tool
- Automation Dashboard
- My Library page
- Adsterra Income section
- Google login

---

## 🎨 Design system

- **Colors:** Pinterest Red `#E60023`, white, black text
- Modern, clean, professional; soft shadows, rounded cards, brand glow accents
- Fully responsive: mobile-first (390px) up to 1440px+ desktop
- 44px+ tap targets, sticky navbar with blur, smooth anchor scrolling
- English UI, fast static rendering (no client-side libraries beyond React)

## 🗂 Project structure

```
app/
  layout.js         metadata, SEO/OG tags, fonts, viewport
  page.js           homepage composition
  globals.css       design tokens + component classes (.btn, .h1, .card…)
components/
  Brand.js          logo + brand mark
  Navbar.js         responsive nav with mobile menu
  Hero.js           hero copy + animated generator demo card
  HowItWorks.js     4-step section
  Features.js       3 feature cards
  IncomeFormula.js  dark formula + pipeline section
  Footer.js
public/brand/       official logo, marks, app icons, favicons
lib/generator.js     pin pack generator (titles, description, hashtags, image idea)
lib/library.js       localStorage library (Save To My Library)
components/CopyButton.js         clipboard copy with fallback + copied state
components/pin-generator/        PinGenerator + ResultSection
scripts/check-home.js            Playwright checks (desktop + mobile)
scripts/check-pin-generator.js   Playwright checks for the generator
```

## 🧪 Verification

```bash
npm run build                 # production build
node scripts/check-home.js            # 15/15 homepage checks
node scripts/check-pin-generator.js   # 21/21 generator checks (real clipboard reads)
```

Latest run: **homepage 15/15 · pin generator 21/21 · zero console errors.**

## 🚀 Local development

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
```
