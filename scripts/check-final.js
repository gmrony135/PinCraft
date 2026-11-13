// Final UI/prototype acceptance + regression checks. No live Google account is simulated.
// Usage: [BASE_URL=https://pincraftly.vercel.app] node scripts/check-final.js
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const BASE = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const ORIGIN = new URL(BASE).origin;
const OUT = path.resolve(__dirname, "../.shots");
const LIBRARY = "pincraft.library.v1";
const results = [];
const errors = [];
const ROUTES = ["/", "/pin-generator", "/article-writer", "/dashboard", "/library", "/adsterra-income", "/about", "/contact", "/login"];
const NAV = ROUTES.slice(0, 6);
const WELCOME = "Welcome to PinCraft - Your Automation Machine is Ready!";
const AUTOMATION = "Automation ON - Your PinCraft will post automatically";

function check(name, pass) { results.push({ name, pass: Boolean(pass) }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}`); }
function watch(page, label) {
  page.on("pageerror", (issue) => errors.push(`${label}: ${issue.message}`));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`${label}: ${message.text()}`); });
}
async function load(page, route) { return page.goto(`${BASE}${route}`, { waitUntil: "networkidle" }); }
async function noOverflow(page) { return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1); }
async function fits(locator, page) {
  const box = await locator.boundingBox(); const viewport = page.viewportSize();
  return box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1;
}
async function photo(page, filename, fullPage = false) { await page.screenshot({ path: path.join(OUT, filename), fullPage }); }
async function json(page, key) { return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), key); }
async function saved(page) { return (await json(page, LIBRARY)) || []; }
async function login(page) {
  await page.getByRole("banner").getByRole("button", { name: "Login with Google", exact: true }).click();
  await page.getByTestId("google-setup-notice").waitFor();
  return page.getByRole("dialog");
}
async function focusContained(page, dialog, count = 14) {
  for (const direction of ["Tab", "Shift+Tab"]) {
    for (let index = 0; index < count; index++) {
      await page.keyboard.press(direction);
      if (!await dialog.evaluate((node) => node.contains(document.activeElement))) return false;
    }
  }
  return true;
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"], reducedMotion: "reduce" });
    const page = await context.newPage(); watch(page, "desktop");
    const externalGoogle = [];
    context.on("request", (request) => { if (/accounts\.google\.com|googleapis\.com/.test(request.url())) externalGoogle.push(request.url()); });

    // Unconfigured endpoints must never authenticate a forged profile/token.
    const configResponse = await context.request.get(`${BASE}/api/auth/config`);
    const config = await configResponse.json();
    check("Google config is truthful: unconfigured, no public client ID or nonce", configResponse.status() === 200 && config.configured === false && config.clientId === null && config.nonce === null);
    check("Auth configuration is not cached", /no-store/.test(configResponse.headers()["cache-control"] || ""));
    const session = await context.request.get(`${BASE}/api/auth/session`);
    check("Guest session endpoint contains no invented account", session.status() === 200 && (await session.json()).user === null);
    const forged = await context.request.get(`${BASE}/api/auth/session`, { headers: { Cookie: "pincraft.session.v1=forged-profile-token" } });
    check("Forged session cookies do not authenticate", (await forged.json()).user === null);
    const fakeLogin = await context.request.post(`${BASE}/api/auth/google`, { headers: { origin: ORIGIN }, data: { credential: "forged.google.token", name: "A Fake Creator" } });
    check("Unconfigured Google login fails closed and never sets a session", fakeLogin.status() === 503 && !/pincraft\.session/.test(fakeLogin.headers()["set-cookie"] || ""));
    const foreign = await context.request.post(`${BASE}/api/auth/google`, { headers: { origin: "https://attacker.invalid" }, data: { credential: "fake" } });
    check("Cross-origin authentication is rejected", foreign.status() === 403);
    const noOrigin = await context.request.post(`${BASE}/api/auth/logout`);
    check("Logout requires a same-origin request", noOrigin.status() === 403);
    const logout = await context.request.post(`${BASE}/api/auth/logout`, { headers: { origin: ORIGIN } });
    check("Same-origin logout clears HttpOnly session cookies", logout.status() === 200 && /pincraft\.session\.v1=/.test(logout.headers()["set-cookie"] || "") && /HttpOnly/i.test(logout.headers()["set-cookie"] || ""));

    await load(page, "/");
    check("Homepage shows the requested small welcome popup", await page.getByTestId("notification").getByText(WELCOME, { exact: true }).isVisible());
    check("Welcome popup discloses Google Login/live posting setup", await page.getByTestId("notification").getByText(/Google Login and live posting still need/).isVisible());
    await photo(page, "final-home-desktop.png");
    await page.getByRole("button", { name: "Dismiss notification", exact: true }).click();
    check("Welcome popup can be dismissed", await page.getByTestId("notification").count() === 0);
    await page.reload({ waitUntil: "networkidle" });
    check("Welcome is not repeated on every visit in the same session", await page.getByTestId("notification").count() === 0);
    check("Navbar has all six working product routes", await page.getByRole("navigation", { name: "Main navigation", exact: true }).locator("ul a").count() === 6);
    const links = await page.locator('a[href^="/"]').evaluateAll((nodes) => [...new Set(nodes.map((node) => node.getAttribute("href").split(/[?#]/)[0]))]);
    let allLinks = true;
    for (const href of links) { if (!(await context.request.get(`${BASE}${href}`)).ok()) allLinks = false; }
    check("Every homepage internal link resolves (no dead Login/About/Contact)", allLinks);

    let dialog = await login(page);
    check("Navbar Login opens a real accessible popup", await dialog.getByRole("heading", { name: "Welcome to PinCraft", exact: true }).isVisible() && await dialog.getByRole("button", { name: "Continue with Google", exact: true }).isVisible());
    check("Login discloses pending setup before the Google button is clicked", await dialog.getByText("Google Login needs setup", { exact: true }).isVisible());
    check("Login locks background scrolling and traps both Tab directions", await page.evaluate(() => document.body.style.overflow === "hidden") && await focusContained(page, dialog));
    await dialog.getByRole("button", { name: "Continue with Google", exact: true }).click();
    check("Unconfigured Google button explains the limitation instead of faking login", await dialog.getByRole("status").filter({ hasText: /does not simulate a Google account/ }).isVisible() && await page.getByTestId("google-setup-notice").evaluate((node) => document.activeElement === node));
    await photo(page, "final-login-desktop.png");
    await page.keyboard.press("Escape");
    check("Escape closes Login and restores Navbar focus/scroll", await page.getByRole("dialog").count() === 0 && await page.getByRole("banner").getByRole("button", { name: "Login with Google", exact: true }).evaluate((node) => document.activeElement === node) && await page.evaluate(() => document.body.style.overflow !== "hidden"));
    await login(page); await page.mouse.click(3, 3);
    check("Login backdrop click also closes the popup", await page.getByRole("dialog").count() === 0);
    await login(page);
    await page.getByRole("dialog").getByRole("link", { name: "View setup requirements", exact: true }).click();
    await page.waitForURL(`${BASE}/login#setup`);
    check("Setup link opens the implemented Login/setup page", await page.getByRole("heading", { name: "Google Login setup requirements", exact: true }).isVisible());
    await page.evaluate(() => { localStorage.setItem("pincraft.user.v1", JSON.stringify({ name: "Forged User", email: "fake@example.test" })); localStorage.setItem("pincraft.session.v1", JSON.stringify({ user: { name: "Forged User" } })); });
    await page.reload({ waitUntil: "networkidle" });
    check("LocalStorage identities cannot spoof the signed-in Navbar", await page.getByRole("banner").getByRole("button", { name: "Login with Google", exact: true }).isVisible() && await page.getByRole("button", { name: /Account: Forged User/ }).count() === 0);

    // Complete the homepage -> pin -> article -> demo publish -> library workflow.
    await load(page, "/");
    await page.getByRole("link", { name: "Generate Viral Pin", exact: true }).first().click();
    await page.waitForURL(`${BASE}/pin-generator`);
    check("Homepage Generate Viral Pin navigates to Pin Generator", await page.getByRole("heading", { name: "Viral Pin Generator", exact: true }).isVisible());
    await page.getByLabel("Enter your topic").fill("Home Decor Ideas");
    const generationStart = Date.now();
    await page.getByRole("button", { name: "Generate Viral Pin", exact: true }).click();
    await page.getByRole("button", { name: "Save To My Library", exact: true }).waitFor();
    const generationMs = Date.now() - generationStart;
    check(`Local pin generation has no fake network delay (${generationMs}ms)`, generationMs < 2000);
    await page.getByRole("button", { name: "Save To My Library", exact: true }).click();
    await page.getByRole("button", { name: "Saved to My Library", exact: true }).waitFor();
    check("Pin Save genuinely persists on this device", (await saved(page)).some((item) => item.type === "pin"));
    const nextLink = page.getByRole("link", { name: "Generate Article For This Pin", exact: true });
    const requestedTitle = new URL(await nextLink.getAttribute("href"), BASE).searchParams.get("title");
    await nextLink.click();
    await page.waitForURL(/\/article-writer\?/);
    await page.waitForFunction((title) => document.querySelector("#pin-title")?.value === title, requestedTitle);
    check("Generate Article hands off the actual pin title", await page.getByLabel("Enter your pin title").inputValue() === requestedTitle);
    await page.getByRole("button", { name: "Generate Article", exact: true }).click();
    await page.locator("article h1").waitFor();
    await page.getByRole("button", { name: "Save To My Library", exact: true }).click();
    await page.getByRole("button", { name: "Saved to My Library", exact: true }).waitFor();
    await page.getByRole("button", { name: "Auto Publish To Blog", exact: true }).click();
    dialog = page.getByRole("dialog"); await dialog.waitFor();
    check("Auto Publish shows the exact requested success popup", await dialog.getByRole("heading", { name: "Article Published Successfully!", exact: true }).isVisible());
    check("Publish success is visibly labeled Demo, not a live blog claim", await dialog.getByText("Demo preview", { exact: true }).isVisible() && await dialog.getByText(/No live blog is connected and nothing was published online/).isVisible());
    check("Publish popup fits the screen and traps keyboard focus", await fits(dialog, page) && await focusContained(page, dialog, 5));
    await photo(page, "final-publish-desktop.png");
    const items = await saved(page);
    check("Demo publish saves a local record with source ID and demo mode", items.some((item) => item.type === "published" && item.publicationMode === "demo" && item.sourceId));
    await dialog.getByRole("link", { name: "View in My Library", exact: true }).click();
    await page.waitForURL(`${BASE}/library?tab=articles`);
    await page.waitForFunction(() => document.querySelector('[data-testid="library-root"]')?.dataset.ready === "true");
    check("Publish CTA opens the real Saved Articles tab", await page.getByRole("tab", { name: /Saved Articles/ }).getAttribute("aria-selected") === "true" && await page.getByTestId("library-article-card").count() === 1);
    check("Saved + demo-published versions remain deduplicated", (await page.getByTestId("library-article-card").getByRole("heading", { level: 3 }).innerText()) === requestedTitle);

    await load(page, "/dashboard");
    await page.getByRole("switch", { name: "Auto Post", exact: true }).click();
    await page.getByRole("button", { name: "Save Automation Settings", exact: true }).click();
    dialog = page.getByRole("dialog"); await dialog.waitFor();
    check("ON Save shows the exact requested automation popup", await dialog.getByRole("heading", { name: AUTOMATION, exact: true }).isVisible());
    check("Automation popup prominently discloses demo/no scheduler", await dialog.getByText("Demo preview", { exact: true }).isVisible() && await dialog.getByText(/no pins will be posted automatically/).isVisible());
    await photo(page, "final-automation-desktop.png");
    await dialog.getByRole("button", { name: "Got it", exact: true }).click();
    check("Automation ON really saves only the local preference", (await json(page, "pincraft.automation.v1")).enabled === true);
    await page.getByRole("switch", { name: "Auto Post", exact: true }).click();
    await page.getByRole("button", { name: "Save Automation Settings", exact: true }).click();
    dialog = page.getByRole("dialog"); await dialog.waitFor();
    check("OFF Save never lies that automation is ON", await dialog.getByRole("heading", { name: "Automation OFF - Your settings are saved", exact: true }).isVisible() && (await json(page, "pincraft.automation.v1")).enabled === false);
    await dialog.getByRole("button", { name: "Close confirmation", exact: true }).click();
    check("Confirmation close restores focus to Save", await page.getByRole("button", { name: "Save Automation Settings", exact: true }).evaluate((node) => document.activeElement === node));

    // Active route state, page availability, mobile layout and modal ergonomics.
    for (const route of NAV) {
      await load(page, route);
      const active = page.getByRole("navigation", { name: "Main navigation", exact: true }).locator('a[aria-current="page"]');
      check(`Navbar highlights only the current route: ${route}`, await active.count() === 1 && await active.getAttribute("href") === route);
    }
    check("Google SDK is never loaded while login is unconfigured", externalGoogle.length === 0);

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    const mobile = await mobileContext.newPage(); watch(mobile, "mobile");
    await load(mobile, "/");
    check("Mobile welcome popup fits and can be dismissed", await fits(mobile.getByTestId("notification"), mobile));
    await photo(mobile, "final-home-mobile.png");
    await mobile.getByRole("button", { name: "Dismiss notification", exact: true }).tap();
    await mobile.getByRole("button", { name: "Open menu", exact: true }).tap();
    check("Mobile navigation opens all six product links and locks scroll", await mobile.locator("#mobile-navigation a").count() === 6 && await mobile.evaluate(() => document.body.style.overflow === "hidden"));
    await photo(mobile, "final-menu-mobile.png");
    await mobile.locator("#mobile-navigation").getByRole("button", { name: "Login with Google", exact: true }).tap();
    await mobile.getByTestId("google-setup-notice").waitFor();
    check("Mobile-menu Login closes the menu and keeps the modal scroll-locked", await mobile.locator("#mobile-navigation").count() === 0 && await mobile.evaluate(() => document.body.style.overflow === "hidden"));
    check("Mobile Login fits without horizontal overflow", await fits(mobile.getByRole("dialog"), mobile) && await mobile.getByRole("dialog").evaluate((node) => node.scrollWidth <= node.clientWidth + 1));
    await photo(mobile, "final-login-mobile.png");
    await mobile.getByRole("dialog").getByRole("button", { name: "Close login popup", exact: true }).tap();
    check("Mobile Login close restores page scrolling", await mobile.evaluate(() => document.body.style.overflow !== "hidden"));
    await mobile.getByRole("button", { name: "Open menu", exact: true }).tap();
    await mobile.keyboard.press("Escape");
    check("Mobile menu Escape closes and returns focus", await mobile.locator("#mobile-navigation").count() === 0 && await mobile.getByRole("button", { name: "Open menu", exact: true }).evaluate((node) => document.activeElement === node));
    await mobile.getByRole("button", { name: "Open menu", exact: true }).tap();
    await mobile.setViewportSize({ width: 1440, height: 900 });
    await mobile.waitForFunction(() => document.body.style.overflow !== "hidden");
    check("Switching to desktop closes the mobile menu and releases scrolling", await mobile.locator("#mobile-navigation").count() === 0);

    for (const width of [320, 390, 640, 768, 1024, 1440]) {
      await mobile.setViewportSize({ width, height: width <= 390 ? 740 : 900 });
      let routesFit = true;
      let allOK = true;
      for (const route of ROUTES) {
        const response = await load(mobile, route);
        if (!response.ok()) allOK = false;
        if (!await noOverflow(mobile)) { routesFit = false; console.log(`OVERFLOW: ${width}px ${route}`); }
      }
      check(`${width}px: all nine public routes return 200 without horizontal overflow`, allOK && routesFit);
      dialog = await login(mobile);
      check(`${width}px: Google popup fits, scrolls vertically and never clips horizontally`, await fits(dialog, mobile) && await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1));
      await dialog.getByRole("button", { name: "Close login popup", exact: true }).click();
    }
    await mobile.setViewportSize({ width: 320, height: 568 });
    await load(mobile, "/article-writer");
    await mobile.getByLabel("Enter your pin title").fill("Easy 15 Minute Dinner Recipes");
    await mobile.getByRole("button", { name: "Generate Article", exact: true }).click();
    await mobile.locator("article h1").waitFor();
    check("320px generated article and action buttons do not overflow", await noOverflow(mobile));
    await mobile.getByRole("button", { name: "Auto Publish To Blog", exact: true }).tap();
    dialog = mobile.getByRole("dialog"); await dialog.waitFor();
    check("320×568 publish popup is readable and fits the viewport", await fits(dialog, mobile));
    await photo(mobile, "final-publish-mobile.png");
    await dialog.getByRole("button", { name: "Got it", exact: true }).tap();
    await load(mobile, "/dashboard");
    await mobile.getByRole("switch", { name: "Auto Post", exact: true }).tap();
    await mobile.getByRole("button", { name: "Save Automation Settings", exact: true }).tap();
    dialog = mobile.getByRole("dialog"); await dialog.waitFor();
    check("320×568 long automation popup stays within the viewport", await fits(dialog, mobile) && await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1));
    await photo(mobile, "final-automation-mobile.png");
    await dialog.getByRole("button", { name: "Got it", exact: true }).tap();

    // Denied storage/copy should preserve work and never claim false success.
    const blockedContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await blockedContext.addInitScript((key) => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) { if (name === key) throw new DOMException("Test denied write", "QuotaExceededError"); return original.call(this, name, value); };
    }, LIBRARY);
    const blocked = await blockedContext.newPage(); watch(blocked, "storage denied");
    await load(blocked, "/pin-generator");
    await blocked.getByLabel("Enter your topic").fill("Balcony Gardening");
    await blocked.getByRole("button", { name: "Generate Viral Pin", exact: true }).click();
    await blocked.getByRole("button", { name: "Save To My Library", exact: true }).click();
    check("Denied pin save shows an honest error and remains retryable", await blocked.getByRole("status").filter({ hasText: /could not save this item/ }).isVisible() && await blocked.getByRole("button", { name: "Save To My Library", exact: true }).isEnabled() && await json(blocked, LIBRARY) === null);
    await blocked.evaluate(() => { navigator.clipboard.writeText = async () => { throw new DOMException("Denied", "NotAllowedError"); }; document.execCommand = () => false; });
    await blocked.getByRole("button", { name: "Copy to clipboard", exact: true }).first().click();
    check("Older shared Copy buttons no longer report false Copied", await blocked.getByRole("button", { name: "Copy failed. Try again", exact: true }).isVisible());
    await load(blocked, "/article-writer");
    await blocked.getByLabel("Enter your pin title").fill("Easy 15 Minute Dinner Recipes");
    await blocked.getByRole("button", { name: "Generate Article", exact: true }).click();
    await blocked.locator("article h1").waitFor();
    await blocked.getByRole("button", { name: "Save To My Library", exact: true }).click();
    check("Denied article save does not mark the article as saved", await blocked.getByRole("status").filter({ hasText: /could not save this item/ }).isVisible() && await blocked.getByRole("button", { name: "Save To My Library", exact: true }).isEnabled());
    await blocked.getByRole("button", { name: "Auto Publish To Blog", exact: true }).click();
    check("Failed demo publish never shows a success popup", await blocked.getByRole("dialog").count() === 0 && await blocked.getByRole("button", { name: "Auto Publish To Blog", exact: true }).isEnabled() && await json(blocked, LIBRARY) === null);

    // Isolated API-response fixture checks only the signed-in UI branch, not Google OAuth.
    const uiContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    let fixtureSignedIn = true;
    await uiContext.route("**/api/auth/session", (route) => route.fulfill({ json: { configured: true, user: fixtureSignedIn ? { id: "ui-fixture-only", name: "UI Test Creator", email: "ui@example.test" } : null } }));
    await uiContext.route("**/api/auth/logout", (route) => { fixtureSignedIn = false; return route.fulfill({ json: { signedOut: true } }); });
    const ui = await uiContext.newPage(); watch(ui, "isolated signed-in UI fixture");
    await load(ui, "/library");
    await ui.getByRole("button", { name: "Account: UI Test Creator", exact: true }).waitFor();
    check("UI fixture only: a server-provided session shows the Navbar username", await ui.getByRole("button", { name: "Account: UI Test Creator", exact: true }).isVisible());
    check("UI fixture only: My Library is active and marked available", await ui.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("link", { name: "My Library", exact: true }).getAttribute("aria-current") === "page");
    await ui.getByRole("button", { name: "Account: UI Test Creator", exact: true }).click();
    await ui.getByRole("button", { name: "Sign out", exact: true }).click();
    await ui.getByRole("banner").getByRole("button", { name: "Login with Google", exact: true }).waitFor();
    check("UI fixture only: Sign out returns the Navbar to guest state", await ui.getByRole("banner").getByRole("button", { name: "Login with Google", exact: true }).isVisible());

    check("Zero browser console errors / uncaught exceptions", errors.length === 0);
    fs.writeFileSync(path.join(OUT, "final-verification.json"), JSON.stringify({ base: BASE, date: new Date().toISOString(), googleOAuth: "not configured; no live account login tested", generationMs, results, errors }, null, 2));
    console.log(`\n${results.filter((result) => result.pass).length}/${results.length} final UI checks passed`);
    if (errors.length) console.log(errors.join("\n"));
    if (results.some((result) => !result.pass)) process.exitCode = 1;
  } finally { await browser.close(); }
}
run().catch((issue) => { console.error("CRASH:", issue); process.exitCode = 1; });
