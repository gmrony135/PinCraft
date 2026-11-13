# Step 4 — Automation Dashboard

> Historical UI-first release record. The browser-only automation/dashboard scope below has been superseded by [real Full Auto Mode](full-auto-mode.md). Old counts describe that release, not live provider authorization.

Route: `/dashboard`

This step adds only the dashboard and its dedicated components, data, verification script, and screenshots. The homepage, Pin Generator, Article Writer, shared navigation, and global styles are unchanged.

## Included

- **Automation Dashboard** heading and requested sub-text.
- Four overview cards: **Total Pins 128**, **Total Views 45,200**, **Total Clicks 8,940**, **Total Earning $42.50**.
- **Auto Post Settings**: accessible ON/OFF switch, daily pin counts **5 / 10 / 15 / 20**, and **Morning / Afternoon / Evening / Night** posting windows.
- Red **Save Automation Settings** button. Saves all preferences plus a timestamp to this browser; restores them after a full reload.
- A live schedule preview, unsaved-change indicator, saved confirmation, and last-saved time.
- Exactly five recent-activity rows with **Pin Title / Status / Views / Clicks / Date**. Both Posted and Scheduled states are represented.
- A lightweight, dependency-free **Last 7 Days Views** bar chart, Monday through Sunday. Hover, click, touch, and keyboard interaction expose exact values. The seven bars total **45,200**.
- Responsive two-column stat cards on mobile, an internally scrollable table, semantic labels, and 44px-or-larger main control targets.

## Honest boundaries

The supplied performance numbers, recent activity (including Posted/Scheduled labels), and weekly views are **demo data**, clearly identified in the interface. No Pinterest account, analytics API, server-side scheduler, or revenue service is connected by this step. Turning the switch ON and saving records a preference; it does **not** post pins.

Preferences live only in `localStorage["pincraft.automation.v1"]`:

```json
{
  "enabled": false,
  "pinsPerDay": 10,
  "postTime": "Morning",
  "savedAt": "<ISO 8601 timestamp set when saved>"
}
```

Defaults are OFF, 10 pins per day, Morning. The default is not automatically written to storage. Invalid JSON or invalid saved choices safely fall back to defaults with an alert. Storage-write failures preserve the draft and display an error instead of claiming a successful save.

## Files

- `app/dashboard/page.js` — route, metadata, existing Navbar/Footer composition.
- `components/dashboard/AutomationDashboard.js` — overview, settings, persistence, live preview.
- `components/dashboard/RecentActivity.js` — semantic responsive activity table.
- `components/dashboard/ViewsChart.js` — accessible interactive daily views chart.
- `lib/dashboard.js` — scoped demo fixtures and settings validation helpers.
- `scripts/check-dashboard.js` — functional, responsive, keyboard, and storage-failure checks.
- `docs/screenshots/dashboard-desktop.png`, `dashboard-mobile.png` — verified layouts.

## Verification

```bash
node scripts/check-dashboard.js
BASE_URL=https://pincraftly.vercel.app node scripts/check-dashboard.js
```

Dashboard: **54/54 passed**, zero browser console errors, including full reload persistence, OFF-state persistence, unsaved changes, malformed data, denied storage writes, keyboard/touch chart controls, 320px/390px/768px layouts, and exact supplied stats.

Regression checks: homepage **15/15**, Pin Generator **21/21**, Article Writer **24/24**, all without console errors. Production build passed; the dashboard is statically rendered with about 107 kB first-load JavaScript and needs no extra runtime dependency.

Before building, stop any running Next.js development server. Development and production builds share `.next` and must not write it concurrently.
