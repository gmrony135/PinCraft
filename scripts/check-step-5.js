// Step 5 only: income setup + saved library, real integrations and safe failure paths.
// Usage: [BASE_URL=https://pincraftly.vercel.app] node scripts/check-step-5.js
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const BASE = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, ".shots");
const AD_KEY = "pincraft.adsterra.v1";
const LIB_KEY = "pincraft.library.v1";
const results = [];
const errors = [];
const adRequests = [];
const TEST_CODE = '<!-- Verification snippet, not a live ad -->\n<script>window.__pincraftAdExecuted = true;</script>\n<script src="https://example.invalid/pincraft-verification-only.js"></script>';

function check(name, pass) {
  results.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
}
function loadModule(file, exports, bindings = {}) {
  const source = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/^import .*$/gm, "").replace(/\bexport\s+/g, "");
  return new Function(...Object.keys(bindings), `${source}\nreturn {${exports.join(",")}};`)(...Object.values(bindings));
}
function watch(page, label) {
  page.on("pageerror", (error) => errors.push(`${label}: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`${label}: ${message.text()}`); });
  page.on("request", (request) => { if (request.url().includes("pincraft-verification-only")) adRequests.push(request.url()); });
}
async function open(page, route) {
  const response = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
  if (route === "/library") await page.waitForFunction(() => document.querySelector('[data-testid="library-root"]')?.dataset.ready === "true");
  if (route === "/adsterra-income") await page.waitForFunction(() => document.querySelector("#adsterra-code")?.disabled === false);
  return response;
}
const adInput = (page) => page.getByLabel("Paste Your Adsterra Ad Code Here", { exact: true });
const adSave = (page) => page.getByRole("button", { name: "Save Ad Code", exact: true });
const pinsTab = (page) => page.getByRole("tab", { name: "Saved Pins", exact: true });
const articlesTab = (page) => page.getByRole("tab", { name: "Saved Articles", exact: true });
const pinCards = (page) => page.getByTestId("library-pin-card");
const articleCards = (page) => page.getByTestId("library-article-card");
const json = (page, key) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), key);
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
async function shot(page, name, fullPage = true) {
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, behavior: "instant" }); });
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(OUT, name), fullPage });
}
async function saveAd(page) {
  await adSave(page).click();
  await page.getByRole("status").filter({ hasText: "Ad code saved on this device." }).waitFor();
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const income = loadModule("lib/income.js", ["validateAdCode", "isSavedAdCode", "INCOME_HISTORY", "INCOME_STATS", "formatIncome"]);
  const generator = loadModule("lib/generator.js", ["generatePinPack", "detectTopic"]);
  const articleEngine = loadModule("lib/article.js", ["generateArticle"], { detectTopic: generator.detectTopic });
  const library = loadModule("lib/library-content.js", ["partitionLibrary", "createDemoLibrary", "filterLibrary"], { generatePinPack: generator.generatePinPack, generateArticle: articleEngine.generateArticle });
  const demos = library.createDemoLibrary();
  check("Ad validation rejects empty / whitespace / oversized snippets", !!income.validateAdCode("") && !!income.validateAdCode("  ") && !!income.validateAdCode("x".repeat(50001)));
  check("Ad validation accepts 50,000 characters and script text without running it", income.validateAdCode("x".repeat(50000)) === "" && income.validateAdCode(TEST_CODE) === "");
  check("Invalid saved ad-code schemas are rejected", !income.isSavedAdCode(null) && !income.isSavedAdCode({ code: "x", savedAt: "bad" }));
  check("Income has exactly five demo rows and correct $17.60 total", income.INCOME_HISTORY.length === 5 && income.formatIncome(income.INCOME_HISTORY.reduce((sum, day) => sum + day.cents, 0)) === "$17.60");
  check("Exactly six demo pins and six complete demo articles", demos.pins.length === 6 && demos.articles.length === 6 && demos.articles.every((item) => item.wordCount >= 500 && item.structured));
  const mixed = [null, 3, [], {}, { type: "pin", titles: [null, 12] }, { type: "article", title: {} }, { id: "a", type: "article", title: "A", content: "Saved body" }, { id: "pub-a", sourceId: "a", type: "published", title: "A", content: "Saved body" }];
  const before = JSON.stringify(mixed);
  const partitioned = library.partitionLibrary(mixed);
  check("Library skips malformed entries and deduplicates published copies", partitioned.pins.length === 0 && partitioned.articles.length === 1);
  check("Library adapter does not mutate stored objects", JSON.stringify(mixed) === before);

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"], reducedMotion: "reduce" });
    await context.route("https://example.invalid/**", (route) => route.abort());
    const page = await context.newPage();
    watch(page, "desktop");

    // Income page and safe, real local persistence.
    const incomeResponse = await open(page, "/adsterra-income");
    check("Income route / metadata / canonical", incomeResponse.status() === 200 && await page.title() === "Adsterra Income · PinCraft" && (await page.locator('link[rel="canonical"]').getAttribute("href")).endsWith("/adsterra-income"));
    check("Income title and exact sub-text", await page.getByRole("heading", { level: 1, name: "Adsterra Income", exact: true }).isVisible() && await page.getByText("Your traffic is converting into income automatically", { exact: true }).isVisible());
    for (const stat of income.INCOME_STATS) {
      const card = page.getByTestId(`income-stat-${stat.key}`);
      check(`${stat.label}: ${stat.value}`, await card.getByRole("heading", { name: stat.label, exact: true }).isVisible() && await card.getByText(stat.value, { exact: true }).isVisible());
    }
    check("Income demo data and disconnected integration are disclosed", await page.getByText("Demo income", { exact: true }).isVisible() && await page.getByText(/Blog ad rendering and live Adsterra reporting are not connected yet/).isVisible());
    check("Ad code field, red Save Ad Code and requested note", await adInput(page).isVisible() && await adSave(page).evaluate((node) => getComputedStyle(node).backgroundColor === "rgb(230, 0, 35)") && await page.getByText("Your Adsterra ads will show automatically on your Blog articles", { exact: true }).isVisible());
    await shot(page, "adsterra-income-desktop.png");
    await adSave(page).click();
    check("Empty ad code is rejected and focuses input", await page.getByRole("alert").filter({ hasText: "Paste your Adsterra ad code before saving." }).isVisible() && await adInput(page).evaluate((node) => node === document.activeElement) && await adInput(page).getAttribute("aria-invalid") === "true");
    await adInput(page).fill(TEST_CODE);
    check("Ad-code draft is not stored before Save", await json(page, AD_KEY) === null);
    await saveAd(page);
    const savedAd = await json(page, AD_KEY);
    check("Save stores the exact code and ISO timestamp", savedAd.code === TEST_CODE && Number.isFinite(Date.parse(savedAd.savedAt)));
    check("Saved indicator and time shown", (await page.getByTestId("ad-code-status").innerText()) === "Code saved locally" && await page.getByText(/^Last saved:/).isVisible());
    check("Pasted scripts are not inserted or executed", await page.evaluate(() => !window.__pincraftAdExecuted && !document.querySelector('script[src*="example.invalid"]')) && adRequests.length === 0);
    await open(page, "/adsterra-income");
    check("Ad code survives a full reload without executing", await adInput(page).inputValue() === TEST_CODE && await page.evaluate(() => !window.__pincraftAdExecuted) && adRequests.length === 0);
    await adInput(page).fill("<!-- Unsaved replacement -->");
    check("Ad-code edits show Unsaved changes without overwriting", (await page.getByTestId("ad-code-status").innerText()) === "Unsaved changes" && (await json(page, AD_KEY)).code === TEST_CODE);
    await open(page, "/adsterra-income");
    check("Reload restores the saved rather than unsaved code", await adInput(page).inputValue() === TEST_CODE);
    await adInput(page).fill("x".repeat(50001));
    await adSave(page).click();
    check("Oversized code shows a validation error and keeps saved code", await page.getByRole("alert").filter({ hasText: "too long" }).isVisible() && (await json(page, AD_KEY)).code === TEST_CODE);
    await adInput(page).fill(TEST_CODE);
    const incomeTable = page.getByRole("table");
    check("Income table: Date / Views / Clicks / Earning, five rows", await incomeTable.getByRole("row").count() === 6 && (await incomeTable.getByRole("columnheader").allTextContents()).map((text) => text.trim()).join("|") === "Date|Views|Clicks|Earning");
    check("Today's income row matches all three cards", (await incomeTable.locator("tbody tr").first().innerText()).replace(/\s+/g, " ").trim() === "Today 1,250 340 $3.75");
    check("Five-day demo earnings total is $17.60", await page.getByText("$17.60", { exact: true }).isVisible());
    check("Income desktop has no page overflow", await noOverflow(page));

    // Library demo mode, all twelve real card actions, accessible tabs/reader.
    await page.getByRole("link", { name: /Open My Library/ }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="library-root"]')?.dataset.ready === "true");
    check("Income links to the library", new URL(page.url()).pathname === "/library");
    check("Library metadata and canonical", await page.title() === "My Library · PinCraft" && (await page.locator('link[rel="canonical"]').getAttribute("href")).endsWith("/library"));
    check("My Library title and exact sub-text", await page.getByRole("heading", { level: 1, name: "My Library", exact: true }).isVisible() && await page.getByText("All your saved Pins and Articles", { exact: true }).isVisible());
    check("Two accessible tabs; Saved Pins selected first", await page.getByRole("tab").count() === 2 && await pinsTab(page).getAttribute("aria-selected") === "true" && await articlesTab(page).getAttribute("aria-selected") === "false");
    check("Six pin cards, each with title and Copy", await pinCards(page).count() === 6 && await pinCards(page).getByRole("heading", { level: 3 }).count() === 6 && await page.getByRole("button", { name: /^Copy pin title:/ }).count() === 6);
    check("Demo collection clearly labeled and not added to localStorage", await page.getByText(/These six examples are previews/).isVisible() && await json(page, LIB_KEY) === null);
    await shot(page, "library-pins-desktop.png");
    let allCopied = true;
    for (let index = 0; index < 6; index++) {
      const card = pinCards(page).nth(index);
      const title = await card.getByRole("heading", { level: 3 }).innerText();
      await card.getByRole("button").click();
      await card.getByRole("button", { name: "Copied to clipboard", exact: true }).waitFor();
      allCopied = allCopied && (await page.evaluate(() => navigator.clipboard.readText())) === title;
    }
    check("All six pin Copy buttons write the exact title to clipboard", allCopied);
    await pinsTab(page).focus();
    await page.keyboard.press("ArrowRight");
    check("ArrowRight selects and focuses Saved Articles", await articlesTab(page).getAttribute("aria-selected") === "true" && await articlesTab(page).evaluate((node) => document.activeElement === node));
    check("Six article cards, each with a Read button", await articleCards(page).count() === 6 && await page.getByRole("button", { name: /^Read article:/ }).count() === 6);
    await shot(page, "library-articles-desktop.png");
    let allRead = true;
    let focusRestored = true;
    for (let index = 0; index < 6; index++) {
      const card = articleCards(page).nth(index);
      const title = await card.getByRole("heading", { level: 3 }).innerText();
      const read = card.getByRole("button");
      await read.click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      allRead = allRead && await dialog.getByRole("heading", { level: 2, name: title, exact: true }).isVisible() && (await dialog.locator("article").innerText()).split(/\s+/).length >= 500 && await dialog.getByRole("heading", { name: "Final thoughts", exact: true }).isVisible();
      if (index === 0) {
        check("Reader locks page scroll and shows complete article structure", await page.evaluate(() => document.body.style.overflow === "hidden") && await dialog.locator("article h3").count() === 5);
        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");
        check("Reader traps keyboard focus inside the dialog", await dialog.evaluate((node) => node.contains(document.activeElement)));
        await dialog.getByRole("button", { name: "Copy full library article", exact: true }).click();
        await dialog.getByRole("button", { name: "Copied to clipboard", exact: true }).waitFor();
        check("Reader copies the full article, not just its title", (await page.evaluate(() => navigator.clipboard.readText())).split(/\s+/).filter(Boolean).length >= 500);
        await page.screenshot({ path: path.join(OUT, "library-reader-desktop.png") });
      }
      if (index === 1) {
        await page.evaluate(() => { window.__originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = async () => { throw new DOMException("Verification", "NotAllowedError"); }; });
        await dialog.getByRole("button", { name: "Copy full library article", exact: true }).click();
        await dialog.getByRole("button", { name: "Copied to clipboard", exact: true }).waitFor();
        check("Clipboard fallback also works inside the modal", (await page.evaluate(() => navigator.clipboard.readText())).includes(title));
        await page.evaluate(() => { navigator.clipboard.writeText = window.__originalWriteText; });
      }
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      focusRestored = focusRestored && await read.evaluate((node) => document.activeElement === node);
    }
    check("All six Read buttons open their own full article", allRead);
    check("Escape closes reader, restores scroll and returns focus", focusRestored && await page.evaluate(() => document.body.style.overflow !== "hidden"));
    check("Reading demo articles does not write to library", await json(page, LIB_KEY) === null);
    await articlesTab(page).focus();
    await page.keyboard.press("Home");
    check("Home key returns to Saved Pins", await pinsTab(page).getAttribute("aria-selected") === "true");
    const search = page.getByRole("searchbox", { name: "Search library", exact: true });
    await search.fill("HOME");
    check("Library search is case-insensitive", await pinCards(page).count() === 1 && (await pinCards(page).first().innerText()).includes("Home Decor"));
    await search.fill("nothing-matches-this-query");
    check("No-match state is clear and recoverable", await page.getByRole("heading", { name: "No matching pins", exact: true }).isVisible());
    await page.getByRole("tabpanel").getByRole("button", { name: "Clear search", exact: true }).click();
    check("Clear search restores six cards", await pinCards(page).count() === 6 && await search.inputValue() === "");

    // Both clipboard APIs fail: do not report Copied.
    await page.evaluate(() => {
      window.__originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
      window.__originalExecCommand = document.execCommand.bind(document);
      navigator.clipboard.writeText = async () => { throw new DOMException("Verification", "NotAllowedError"); };
      document.execCommand = () => false;
    });
    await pinCards(page).first().getByRole("button").click();
    check("Clipboard denial shows a retry state instead of false success", await pinCards(page).first().getByRole("button", { name: "Copy failed. Try again", exact: true }).isVisible());
    await page.evaluate(() => { navigator.clipboard.writeText = window.__originalWriteText; document.execCommand = window.__originalExecCommand; });
    await pinCards(page).first().getByRole("button").click();
    await pinCards(page).first().getByRole("button", { name: "Copied to clipboard", exact: true }).waitFor();
    check("Copy retry recovers after a failure", (await page.evaluate(() => navigator.clipboard.readText())) === demos.pins[0].title);
    await page.getByRole("link", { name: "Adsterra Income", exact: true }).click();
    await page.waitForURL(`${BASE}/adsterra-income`);
    await adInput(page).waitFor();
    check("Library links back to Adsterra Income", new URL(page.url()).pathname === "/adsterra-income");

    // Integrate with the existing save actions WITHOUT editing those pages.
    await open(page, "/pin-generator");
    await page.getByPlaceholder("Sad Quotes", { exact: true }).fill("Balcony Gardening");
    await page.getByRole("button", { name: /Generate Viral Pin$/ }).click();
    await page.getByRole("button", { name: "Save To My Library", exact: true }).waitFor();
    await page.getByRole("button", { name: "Save To My Library", exact: true }).click();
    await page.getByRole("button", { name: "Saved to My Library", exact: true }).waitFor();
    const realPin = (await json(page, LIB_KEY)).find((item) => item.type === "pin");
    await open(page, "/library");
    check("Real Pin Generator saves appear instead of demo pins", await pinCards(page).count() === 1 && (await pinCards(page).getByRole("heading", { level: 3 }).innerText()) === realPin.titles[0] && !await page.getByText("Demo collection", { exact: true }).isVisible());
    await pinCards(page).getByRole("button").click();
    await pinCards(page).getByRole("button", { name: "Copied to clipboard", exact: true }).waitFor();
    check("Real saved pin copies its actual generated title", (await page.evaluate(() => navigator.clipboard.readText())) === realPin.titles[0]);
    await open(page, "/article-writer");
    await page.getByPlaceholder("10 Sad Quotes That Will Make You Cry", { exact: true }).fill("6 Small Balcony Garden Ideas to Try");
    await page.getByRole("button", { name: "Generate Article", exact: true }).click();
    await page.locator("article h1").waitFor();
    await page.getByRole("button", { name: "Save To My Library", exact: true }).click();
    await page.getByRole("button", { name: "Saved to My Library", exact: true }).waitFor();
    await page.getByRole("button", { name: "Auto Publish To Blog", exact: true }).click();
    await page.getByRole("button", { name: "Published To Blog", exact: true }).waitFor();
    const realItems = await json(page, LIB_KEY);
    const realArticle = realItems.find((item) => item.type === "article");
    await open(page, "/library");
    await articlesTab(page).click();
    check("Real saved and published versions appear as one article", await articleCards(page).count() === 1 && (await articleCards(page).getByRole("heading", { level: 3 }).innerText()) === realArticle.title);
    await articleCards(page).getByRole("button").click();
    check("Read opens the actual saved article body", (await page.getByRole("dialog").locator("article").innerText()).includes(realArticle.intro));
    await page.getByRole("button", { name: "Close article", exact: true }).click();
    check("Library browsing never alters existing saved data or ad code", JSON.stringify(await json(page, LIB_KEY)) === JSON.stringify(realItems) && (await json(page, AD_KEY)).code === TEST_CODE);

    // Seven real pins: exactly six per page and working pagination.
    const sevenPins = Array.from({ length: 7 }, (_, index) => ({ ...realPin, id: `fixture-pin-${index + 1}`, titles: [`Saved pin ${index + 1}`] }));
    await page.evaluate(({ key, items }) => localStorage.setItem(key, JSON.stringify(items)), { key: LIB_KEY, items: sevenPins });
    await open(page, "/library");
    check("Large real libraries show six cards on page one", await pinCards(page).count() === 6 && await page.getByRole("button", { name: "Previous library page", exact: true }).isDisabled());
    await page.getByRole("button", { name: "Next library page", exact: true }).click();
    check("Next shows the seventh pin and disables next at the end", await pinCards(page).count() === 1 && (await pinCards(page).innerText()).includes("Saved pin 7") && await page.getByRole("button", { name: "Next library page", exact: true }).isDisabled());
    await page.getByRole("button", { name: "Previous library page", exact: true }).click();
    check("Previous returns to the first six cards", await pinCards(page).count() === 6);
    const otherTab = await context.newPage();
    watch(otherTab, "cross-tab");
    await open(otherTab, "/library");
    await otherTab.evaluate((key) => localStorage.setItem(key, JSON.stringify([{ type: "pin", id: "cross-tab-pin", title: "Fresh pin from another tab", category: "Test" }])), LIB_KEY);
    await page.getByRole("heading", { level: 3, name: "Fresh pin from another tab", exact: true }).waitFor();
    check("Cross-tab storage updates refresh the visible library", await pinCards(page).count() === 1);
    await otherTab.close();

    const titleOnly = { id: "title-only", type: "article", title: "A title without its body" };
    const escaped = { id: "escaped", type: "article", title: "Safely displayed saved text", content: '<img src="x" onerror="window.__libraryExecuted=true">\n\n<script>window.__libraryExecuted=true</script>' };
    await page.evaluate(({ key, items }) => localStorage.setItem(key, JSON.stringify(items)), { key: LIB_KEY, items: [titleOnly, escaped, null, {}, 7] });
    await open(page, "/library");
    await articlesTab(page).click();
    await articleCards(page).first().getByRole("button").click();
    check("Title-only saves offer a real Article Writer link, not invented content", await page.getByRole("dialog").getByText(/no article body/).isVisible() && (await page.getByRole("dialog").getByRole("link", { name: "Write this article", exact: true }).getAttribute("href")).startsWith("/article-writer?title="));
    await page.keyboard.press("Escape");
    await articleCards(page).nth(1).getByRole("button").click();
    check("Saved HTML is displayed as text, never executed", await page.getByRole("dialog").locator("img, script").count() === 0 && await page.evaluate(() => !window.__libraryExecuted) && (await page.getByRole("dialog").innerText()).includes("<script>"));
    await page.keyboard.press("Escape");

    // Corrupted storage is read-only and does not erase the user's data.
    await page.evaluate((key) => localStorage.setItem(key, "{invalid"), LIB_KEY);
    await open(page, "/library");
    check("Corrupted library falls back with an honest alert", await page.getByRole("alert").filter({ hasText: "could not be loaded" }).isVisible() && await pinCards(page).count() === 6);
    check("Corrupted library is not silently overwritten", await page.evaluate((key) => localStorage.getItem(key), LIB_KEY) === "{invalid");
    await page.evaluate((key) => localStorage.setItem(key, "{invalid"), AD_KEY);
    await open(page, "/adsterra-income");
    check("Corrupted ad-code storage recovers to an empty editor with an alert", await adInput(page).inputValue() === "" && await page.getByRole("alert").filter({ hasText: "could not load" }).isVisible());
    await adInput(page).fill("<!-- Replacement snippet, no live ad -->");
    await saveAd(page);
    check("Saving can repair corrupted ad-code storage", income.isSavedAdCode(await json(page, AD_KEY)));

    // Mobile / narrow layouts: controls, internal table scroll, readable modal.
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    const mobile = await mobileContext.newPage();
    watch(mobile, "mobile");
    await open(mobile, "/adsterra-income");
    check("Mobile income: no horizontal page overflow", await noOverflow(mobile));
    const scrollable = await mobile.getByTestId("income-history-scroll").evaluate((node) => { const overflows = node.scrollWidth > node.clientWidth; node.scrollLeft = node.scrollWidth; const moved = node.scrollLeft > 0; node.scrollLeft = 0; return overflows && moved; });
    check("Mobile income: history table scrolls internally", scrollable);
    check("Mobile income: editor uses >=16px text and Save is >=44px", await adInput(mobile).evaluate((node) => parseFloat(getComputedStyle(node).fontSize) >= 16) && (await adSave(mobile).boundingBox()).height >= 44);
    await adInput(mobile).fill("<!-- Mobile saved ad snippet -->");
    await saveAd(mobile);
    await open(mobile, "/adsterra-income");
    check("Mobile ad code save survives reload", await adInput(mobile).inputValue() === "<!-- Mobile saved ad snippet -->");
    await shot(mobile, "adsterra-income-mobile.png");
    await open(mobile, "/library");
    check("Mobile library: six cards and no horizontal overflow", await pinCards(mobile).count() === 6 && await noOverflow(mobile));
    check("Mobile library: tabs and Copy have >=44px tap targets", (await pinsTab(mobile).boundingBox()).height >= 44 && (await pinCards(mobile).first().getByRole("button").boundingBox()).height >= 44);
    await shot(mobile, "library-pins-mobile.png");
    await articlesTab(mobile).tap();
    check("Mobile library: Articles tab works by touch", await articleCards(mobile).count() === 6);
    await shot(mobile, "library-articles-mobile.png");
    await articleCards(mobile).first().getByRole("button").tap();
    const reader = mobile.getByRole("dialog");
    const readerBox = await reader.boundingBox();
    check("Mobile reader fits inside the viewport", readerBox.x >= 0 && readerBox.y >= 0 && readerBox.x + readerBox.width <= 391 && readerBox.y + readerBox.height <= 845);
    const readerScroll = await mobile.getByTestId("article-reader-scroll").evaluate((node) => { const overflows = node.scrollHeight > node.clientHeight; node.scrollTop = node.scrollHeight; const moved = node.scrollTop > 0; node.scrollTop = 0; return overflows && moved; });
    check("Mobile reader can scroll through the complete post", readerScroll);
    await mobile.screenshot({ path: path.join(OUT, "library-reader-mobile.png") });
    await reader.getByRole("button", { name: "Close article", exact: true }).tap();
    check("Mobile reader closes and restores background scrolling", await reader.count() === 0 && await mobile.evaluate(() => document.body.style.overflow !== "hidden"));
    for (const width of [320, 640, 768]) {
      await mobile.setViewportSize({ width, height: 900 });
      await open(mobile, "/adsterra-income");
      check(`${width}px income: no page overflow`, await noOverflow(mobile));
      await open(mobile, "/library");
      const tabBounds = await mobile.getByRole("tab").evaluateAll((nodes) => nodes.every((node) => { const box = node.getBoundingClientRect(); const parent = node.parentElement.getBoundingClientRect(); return box.left >= parent.left && box.right <= parent.right + 1 && node.scrollWidth <= node.clientWidth + 1; }));
      const noSearchOverlap = await mobile.getByRole("searchbox").evaluate((node) => { const search = node.getBoundingClientRect(); const tabs = document.querySelector('[role="tablist"]').getBoundingClientRect(); return search.left >= tabs.right || search.top >= tabs.bottom || search.bottom <= tabs.top; });
      check(`${width}px library: no overflow, clipped tabs, or overlapping search`, await noOverflow(mobile) && tabBounds && noSearchOverlap);
      if (width === 320) {
        await articlesTab(mobile).click();
        await articleCards(mobile).first().getByRole("button").click();
        check("320px reader: toolbar does not overflow horizontally", await mobile.getByRole("dialog").evaluate((node) => node.scrollWidth <= node.clientWidth + 1));
        await mobile.keyboard.press("Escape");
      }
    }

    // Denied browser storage must fail honestly without erasing a draft.
    const blockedContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await blockedContext.addInitScript(({ adKey, libKey }) => {
      const get = Storage.prototype.getItem;
      const set = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key) { if (key === libKey) throw new DOMException("Verification", "SecurityError"); return get.call(this, key); };
      Storage.prototype.setItem = function (key, value) { if (key === adKey) throw new DOMException("Verification", "QuotaExceededError"); return set.call(this, key, value); };
    }, { adKey: AD_KEY, libKey: LIB_KEY });
    const blocked = await blockedContext.newPage();
    watch(blocked, "denied storage");
    await open(blocked, "/adsterra-income");
    await adInput(blocked).fill("<!-- Keep my unsaved draft -->");
    await adSave(blocked).click();
    check("Denied ad-code writes show an error, never a saved state", await blocked.getByRole("alert").filter({ hasText: "could not be saved" }).isVisible() && (await blocked.getByTestId("ad-code-status").innerText()) !== "Code saved locally");
    check("Failed ad-code save preserves the draft", await adInput(blocked).inputValue() === "<!-- Keep my unsaved draft -->" && await json(blocked, AD_KEY) === null);
    await open(blocked, "/library");
    check("Denied library reads still show usable demos with a warning", await pinCards(blocked).count() === 6 && await blocked.getByRole("alert").filter({ hasText: "could not be loaded" }).isVisible());
    check("No pasted ad scripts made a network request", adRequests.length === 0);
    check("Zero browser console errors / uncaught exceptions", errors.length === 0);
  } finally {
    await browser.close();
  }
  const failed = results.filter((result) => !result.pass);
  const report = { baseUrl: BASE, checkedAt: new Date().toISOString(), passed: results.length - failed.length, total: results.length, results, errors, adRequests };
  fs.writeFileSync(path.join(OUT, "step-5-verification.json"), JSON.stringify(report, null, 2));
  console.log(`\n${report.passed}/${report.total} passed`);
  console.log(errors.length ? `\nCONSOLE ERRORS:\n${errors.join("\n")}` : "No console errors ✅");
  process.exitCode = failed.length || errors.length || adRequests.length ? 1 : 0;
}
run().catch((error) => { console.error("CRASH:", error); process.exitCode = 1; });
