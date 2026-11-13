// Step 4 verification. Usage: [BASE_URL=https://pincraftly.vercel.app] node scripts/check-dashboard.js
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const OUT = path.resolve(__dirname, "../.shots");
const KEY = "pincraft.automation.v1";
const results = [];
const errors = [];

function check(name, pass) {
  results.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
}

function watch(page, label) {
  page.on("pageerror", (error) => errors.push(`${label}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${label}: ${message.text()}`);
  });
}

async function load(page, reload = false) {
  const response = reload
    ? await page.reload({ waitUntil: "networkidle" })
    : await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#pins-per-day")?.disabled === false);
  return response;
}

async function values(page) {
  return {
    enabled: (await page.getByRole("switch", { name: "Auto Post", exact: true }).getAttribute("aria-checked")) === "true",
    pins: await page.getByLabel("How many Pins per day?", { exact: true }).inputValue(),
    time: await page.getByLabel("Post Time", { exact: true }).inputValue(),
  };
}

async function stored(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), KEY);
}

async function save(page) {
  await page.getByRole("button", { name: "Save Automation Settings", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Got it", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Automation settings saved on this device." }).waitFor();
}

async function screenshot(page, filename, fullPage = true) {
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(OUT, filename), fullPage });
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const source = fs.readFileSync(path.resolve(__dirname, "../lib/dashboard.js"), "utf8");
  const data = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const sanitized = data.normalizeAutomation({ enabled: "yes", pinsPerDay: 999, postTime: "Noon", savedAt: "bad" });
  check("Invalid settings normalize to safe defaults", !sanitized.enabled && sanitized.pinsPerDay === 10 && sanitized.postTime === "Morning" && sanitized.savedAt === null);
  check("Null/array settings rejected safely", !data.isValidAutomation(null) && !data.isValidAutomation([]) && data.normalizeAutomation(null).pinsPerDay === 10);
  check("Seven demo days sum to the displayed 45,200 views", data.WEEKLY_VIEWS.length === 7 && data.WEEKLY_VIEWS.reduce((sum, day) => sum + day.views, 0) === 45200);

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    watch(page, "desktop");
    const response = await load(page);

    check("Dashboard route returns HTTP 200", response.status() === 200);
    check("Page title and canonical metadata", (await page.title()) === "Automation Dashboard · PinCraft" && (await page.locator('link[rel="canonical"]').getAttribute("href")).endsWith("/dashboard"));
    check("One page H1: Automation Dashboard", await page.getByRole("heading", { level: 1, name: "Automation Dashboard", exact: true }).count() === 1);
    check("Truthful workspace sub-text", await page.getByText("Plan your content routine, all in one place", { exact: true }).isVisible());
    check("Demo analytics and disconnected posting disclosed", await page.getByText("Demo workspace", { exact: true }).isVisible() && await page.getByText(/no pins are posted automatically yet/).isVisible());

    for (const stat of data.DASHBOARD_STATS) {
      const card = page.getByTestId(`stat-${stat.key}`);
      check(`${stat.label}: ${stat.value}`, await card.getByRole("heading", { name: stat.label, exact: true }).isVisible() && await card.getByText(stat.value, { exact: true }).isVisible());
    }

    check("Auto Post Settings section", await page.getByRole("heading", { name: "Auto Post Settings", exact: true }).isVisible());
    let state = await values(page);
    check("Safe defaults: OFF, 10 pins, Morning", !state.enabled && state.pins === "10" && state.time === "Morning");
    check("Daily pin options are exactly 5 / 10 / 15 / 20", (await page.locator("#pins-per-day option").allTextContents()).join("|") === "5|10|15|20");
    check("Time options: Morning / Afternoon / Evening / Night", (await page.locator("#post-time option").allTextContents()).join("|") === "Morning|Afternoon|Evening|Night");

    const autoPost = page.getByRole("switch", { name: "Auto Post", exact: true });
    await autoPost.click();
    await page.getByLabel("How many Pins per day?", { exact: true }).selectOption("15");
    await page.getByLabel("Post Time", { exact: true }).selectOption("Evening");
    check("Toggle switches ON accessibly", (await autoPost.getAttribute("aria-checked")) === "true" && (await page.getByTestId("auto-post-state").innerText()) === "ON");
    const preview = page.getByTestId("schedule-preview");
    check("Live preview follows draft: 15 pins, Evening, ON", (await preview.getByTestId("preview-pin-count").innerText()) === "15" && (await preview.getByTestId("preview-description").innerText()).includes("evening") && (await preview.getByTestId("preview-description").innerText()).includes("ON"));
    check("Draft is not written before saving", await stored(page) === null);

    await save(page);
    const firstSaved = await stored(page);
    check("Save persists all three settings + valid timestamp", firstSaved.enabled === true && firstSaved.pinsPerDay === 15 && firstSaved.postTime === "Evening" && Number.isFinite(Date.parse(firstSaved.savedAt)));
    check("Saved state and last-saved time shown", (await page.getByTestId("settings-status").innerText()) === "Saved locally" && await page.getByText(/^Last saved:/).isVisible());

    await load(page, true);
    state = await values(page);
    check("Settings survive a full reload", state.enabled && state.pins === "15" && state.time === "Evening");
    await page.getByLabel("How many Pins per day?", { exact: true }).selectOption("20");
    await page.getByLabel("Post Time", { exact: true }).selectOption("Night");
    check("Edits show Unsaved changes", (await page.getByTestId("settings-status").innerText()) === "Unsaved changes");
    check("Unsaved edits do not overwrite stored plan", (await stored(page)).pinsPerDay === 15 && (await stored(page)).postTime === "Evening");
    await load(page, true);
    state = await values(page);
    check("Reload restores saved rather than unsaved choices", state.pins === "15" && state.time === "Evening");

    await page.getByRole("switch", { name: "Auto Post", exact: true }).click();
    await page.getByLabel("How many Pins per day?", { exact: true }).selectOption("5");
    await page.getByLabel("Post Time", { exact: true }).selectOption("Afternoon");
    await save(page);
    await load(page, true);
    state = await values(page);
    check("OFF preference also persists with 5 pins / Afternoon", !state.enabled && state.pins === "5" && state.time === "Afternoon");

    await page.getByRole("switch", { name: "Auto Post", exact: true }).focus();
    await page.keyboard.press("Space");
    check("Switch works with keyboard Space", (await values(page)).enabled === true);
    await page.getByLabel("How many Pins per day?", { exact: true }).selectOption("10");
    await page.getByLabel("Post Time", { exact: true }).selectOption("Morning");
    await page.getByRole("button", { name: "Save Automation Settings", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").getByRole("button", { name: "Got it", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Automation settings saved on this device." }).waitFor();
    check("Save works with keyboard Enter", (await stored(page)).enabled === true && (await stored(page)).pinsPerDay === 10);
    const buttonColor = await page.getByRole("button", { name: "Save Automation Settings", exact: true }).evaluate((node) => getComputedStyle(node).backgroundColor);
    check("Save button uses Pinterest red #E60023", buttonColor === "rgb(230, 0, 35)");

    const table = page.getByRole("table");
    check("Recent Activity contains exactly five data rows", await table.getByRole("row").count() === 6);
    check("Activity columns match the specification", (await table.getByRole("columnheader").allTextContents()).map((text) => text.trim()).join("|") === "Pin Title|Status|Views|Clicks|Date");
    const firstRow = table.locator("tbody tr").first();
    check("Sad Quotes example: Posted, 1,250 views, 340 clicks, Today", (await firstRow.innerText()).includes("10 Sad Quotes") && (await firstRow.locator("td").allTextContents()).map((text) => text.trim()).join("|") === "Posted|1,250|340|Today");
    check("Activity has both Posted and Scheduled states", await table.getByText("Posted", { exact: true }).count() === 3 && await table.getByText("Scheduled", { exact: true }).count() === 2);

    const bars = page.getByTestId("views-bar");
    check("Last 7 Days Views chart with seven bars", await page.getByRole("heading", { name: "Last 7 Days Views", exact: true }).isVisible() && await bars.count() === 7);
    check("Bars cover Monday to Sunday with exact values", (await bars.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")))).join("|") === data.WEEKLY_VIEWS.map((day) => `${day.fullDay}: ${day.views.toLocaleString("en-US")} views`).join("|"));
    const heights = await bars.evaluateAll((nodes) => nodes.map((node) => node.querySelector('span[aria-hidden="true"]').getBoundingClientRect().height));
    check("Bar heights are proportional to views", heights.every((height) => height > 0) && Math.abs(heights[0] / heights[5] - 4200 / 8900) < 0.01);
    await page.getByRole("button", { name: "Monday: 4,200 views", exact: true }).click();
    await page.mouse.move(0, 0);
    check("Chart click selects Monday and 4,200 views", (await page.getByTestId("chart-selection").innerText()).includes("4,200") && (await bars.first().getAttribute("aria-pressed")) === "true");
    const wed = page.getByRole("button", { name: "Wednesday: 5,100 views", exact: true });
    await wed.focus();
    await page.keyboard.press("Enter");
    check("Chart also works by keyboard", (await wed.getAttribute("aria-pressed")) === "true" && (await page.getByTestId("chart-selection").innerText()).includes("5,100"));
    await page.getByRole("button", { name: "Saturday: 8,900 views", exact: true }).click();
    await screenshot(page, "dashboard-desktop.png");
    await screenshot(page, "dashboard-desktop-fold.png", false);
    check("Desktop has no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));

    // Mobile layout and real saved preferences.
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    const mobile = await mobileContext.newPage();
    watch(mobile, "mobile");
    await load(mobile);
    check("Mobile: heading, stats and settings are visible", await mobile.getByRole("heading", { name: "Automation Dashboard", exact: true }).isVisible() && await mobile.getByTestId("stat-earning").isVisible() && await mobile.getByRole("switch", { name: "Auto Post", exact: true }).isVisible());
    const pinBox = await mobile.getByTestId("stat-pins").boundingBox();
    const viewBox = await mobile.getByTestId("stat-views").boundingBox();
    const clickBox = await mobile.getByTestId("stat-clicks").boundingBox();
    check("Mobile: stats form a two-column grid", Math.abs(pinBox.y - viewBox.y) < 2 && clickBox.y > pinBox.y);
    check("Mobile: no page-level horizontal overflow", await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    const scroll = mobile.getByTestId("activity-scroll");
    const tableScroll = await scroll.evaluate((node) => {
      const overflows = node.scrollWidth > node.clientWidth;
      node.scrollLeft = node.scrollWidth;
      const works = node.scrollLeft > 0;
      node.scrollLeft = 0;
      return overflows && works;
    });
    check("Mobile: activity table scrolls internally to all columns", tableScroll && await mobile.getByText("Swipe to see all columns", { exact: false }).isVisible());
    const targetHeights = await mobile.locator('button[role="switch"], #pins-per-day, #post-time, button[type="submit"]').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    check("Mobile: main controls have at least 44px tap targets", targetHeights.length === 4 && targetHeights.every((height) => height >= 44));
    await mobile.getByRole("switch", { name: "Auto Post", exact: true }).tap();
    await mobile.getByLabel("How many Pins per day?", { exact: true }).selectOption("20");
    await mobile.getByLabel("Post Time", { exact: true }).selectOption("Night");
    await save(mobile);
    await load(mobile, true);
    const mobileValues = await values(mobile);
    check("Mobile: saved ON / 20 / Night survives reload", mobileValues.enabled && mobileValues.pins === "20" && mobileValues.time === "Night");
    await mobile.getByRole("button", { name: "Sunday: 7,400 views", exact: true }).tap();
    check("Mobile: touch selects chart bar", (await mobile.getByTestId("chart-selection").innerText()).includes("7,400"));
    await mobile.getByLabel("How many Pins per day?", { exact: true }).selectOption("10");
    await mobile.getByLabel("Post Time", { exact: true }).selectOption("Morning");
    await save(mobile);
    await screenshot(mobile, "dashboard-mobile.png");

    for (const width of [320, 768]) {
      await mobile.setViewportSize({ width, height: 900 });
      check(`${width}px viewport: no horizontal overflow`, await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    }

    // Bad local data must never crash hydration or trap the user.
    await page.evaluate((key) => localStorage.setItem(key, "{broken json"), KEY);
    await load(page, true);
    state = await values(page);
    check("Corrupted storage recovers to defaults with an alert", !state.enabled && state.pins === "10" && state.time === "Morning" && await page.getByRole("alert").filter({ hasText: "could not load" }).isVisible());
    await save(page);
    check("Saving replaces corrupted storage with a valid plan", data.isValidAutomation(await stored(page)));
    await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ enabled: "yes", pinsPerDay: 999, postTime: "Noon", savedAt: "invalid" })), KEY);
    await load(page, true);
    state = await values(page);
    check("Invalid stored choices rejected with safe defaults", !state.enabled && state.pins === "10" && state.time === "Morning" && await page.getByRole("alert").filter({ hasText: "were invalid" }).isVisible());

    // Simulate denied writes; an unsuccessful save must not claim success.
    const blockedContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await blockedContext.addInitScript((key) => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (name === key) throw new DOMException("Storage denied for verification", "QuotaExceededError");
        return original.call(this, name, value);
      };
    }, KEY);
    const blocked = await blockedContext.newPage();
    watch(blocked, "blocked storage");
    await load(blocked);
    await blocked.getByLabel("How many Pins per day?", { exact: true }).selectOption("20");
    await blocked.getByRole("button", { name: "Save Automation Settings", exact: true }).click();
    check("Denied storage write shows an honest save error", await blocked.getByRole("alert").filter({ hasText: "could not be saved" }).isVisible() && (await blocked.getByTestId("settings-status").innerText()) !== "Saved locally");
    check("Failed save preserves the editable draft", (await values(blocked)).pins === "20" && await stored(blocked) === null);

    check("Zero browser console errors / uncaught exceptions", errors.length === 0);
  } finally {
    await browser.close();
  }

  const failed = results.filter((result) => !result.pass);
  const report = { baseUrl: BASE, checkedAt: new Date().toISOString(), passed: results.length - failed.length, total: results.length, results, errors };
  fs.writeFileSync(path.join(OUT, "dashboard-verification.json"), JSON.stringify(report, null, 2));
  console.log(`\n${report.passed}/${report.total} passed`);
  console.log(errors.length ? `\nCONSOLE ERRORS:\n${errors.join("\n")}` : "No console errors ✅");
  process.exitCode = failed.length || errors.length ? 1 : 0;
}

run().catch((error) => {
  console.error("CRASH:", error);
  process.exitCode = 1;
});
