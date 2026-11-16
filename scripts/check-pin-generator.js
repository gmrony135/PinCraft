// Pin Generator verification: generation, removed result sections, artwork, and remaining article handoff
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const OUT = "/home/user/.shots";

async function run() {
  const browser = await chromium.launch();

  // grant clipboard permissions so we can assert real copy values
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

  const steps = [];
  const ok = (name, cond) => steps.push({ name, pass: !!cond });
  const clip = () => page.evaluate(() => navigator.clipboard.readText());

  // ---------- load ----------
  await page.goto(`${BASE}/pin-generator`, { waitUntil: "networkidle" });
  ok("Page title heading", await page.getByRole("heading", { name: "Pin Generator", exact: true }).isVisible());
  ok("Sub-text explains categories and Pin artwork", await page.getByText(/custom Pin artwork option/i).isVisible());
  ok("Topic input with placeholder", (await page.getByPlaceholder("e.g. Balcony garden ideas").count()) === 1);
  ok("Generate button", await page.getByRole("button", { name: "Pin ideas", exact: true }).isVisible());
  const categories = page.getByTestId("pin-category-suggestion");
  ok("Ten product categories are suggested", await categories.count() === 10);

  // ---------- validation ----------
  await page.getByRole("button", { name: "Pin ideas", exact: true }).click();
  await page.waitForTimeout(300);
  ok("Empty topic shows error", await page.getByText(/Please type a topic first/i).isVisible());

  // ---------- generate via canonical product category ----------
  const selectedCategory = await categories.nth(1).innerText();
  await categories.nth(1).click();
  ok("Category suggestion fills input", (await page.getByLabel("Enter your topic").inputValue()) === selectedCategory);

  await page.getByRole("button", { name: "Pin ideas", exact: true }).click();
  await page.waitForTimeout(1600);

  // ---------- removed generated-result sections ----------
  ok("Generated Pin copy results are hidden", await page.getByText("SEO keyword suggestions · not measured search data", { exact: true }).count() === 0 && await page.getByRole("button", { name: /Step 01 Pin Title Ideas/i }).count() === 0 && await page.getByRole("button", { name: /Step 02 Pin Description/i }).count() === 0 && await page.getByRole("button", { name: /Step 03 Hashtags/i }).count() === 0 && await page.getByRole("button", { name: /Step 04 Pin Image Idea/i }).count() === 0 && await page.getByText("Next action", { exact: true }).count() === 0);
  const artwork = page.getByTestId("ai-image-generator");
  ok("Artwork generator remains available", await artwork.isVisible());
  ok("Pin prompt still pre-fills artwork description", (await page.getByLabel("Visual description", { exact: true }).inputValue()).includes("Vertical 2:3"));
  await artwork.getByRole("button", { name: "Generate image with AI", exact: true }).click();
  await page.getByRole("button", { name: "Close login popup", exact: true }).waitFor();
  ok("Guest artwork generation opens sign-in", await page.getByRole("dialog").isVisible());
  await page.getByRole("button", { name: "Close login popup", exact: true }).click();

  const articleLink = page.getByRole("link", { name: "Open Article Writer", exact: true });
  ok("Separate sidebar article handoff remains available", await articleLink.isVisible());
  const href = await articleLink.getAttribute("href");
  ok(`Article link carries the title (${href.slice(0, 44)}…)`, href.startsWith("/article-writer?title="));
  ok("Removed Pin save action is not rendered", await page.getByRole("button", { name: /Save To My Library/i }).count() === 0);

  await page.screenshot({ path: `${OUT}/pin-generator-desktop.png`, fullPage: true });

  // ---------- mobile ----------
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const m = await mctx.newPage();
  m.on("pageerror", (e) => errors.push("mobile PAGEERROR: " + e.message));
  await m.goto(`${BASE}/pin-generator`, { waitUntil: "networkidle" });
  await m.getByPlaceholder("e.g. Balcony garden ideas").fill("Home Decor Ideas");
  await m.getByRole("button", { name: "Pin ideas", exact: true }).click();
  await m.waitForTimeout(1600);
  ok("Mobile: generated-result sections remain hidden", await m.getByRole("button", { name: /Step 01 Pin Title Ideas/i }).count() === 0 && await m.getByText("SEO keyword suggestions · not measured search data", { exact: true }).count() === 0 && await m.getByText("Next action", { exact: true }).count() === 0);
  const overflow = await m.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  ok(`Mobile: no horizontal overflow (${overflow}px)`, overflow <= 1);
  await m.screenshot({ path: `${OUT}/pin-generator-mobile.png`, fullPage: true });

  await browser.close();

  const failed = steps.filter((s) => !s.pass);
  console.log("\n=== PIN GENERATOR CHECKS ===");
  steps.forEach((s) => console.log(`${s.pass ? "PASS" : "FAIL"}  ${s.name}`));
  console.log(`\n${steps.length - failed.length}/${steps.length} passed`);
  console.log(errors.length ? "\nCONSOLE ERRORS:\n" + errors.join("\n") : "\nNo console errors ✅");
  process.exit(failed.length ? 1 : 0);
}

run().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
