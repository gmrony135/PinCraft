// Pin Generator verification: generation, every copy button, save, next action
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
  ok("Page title heading", await page.getByRole("heading", { name: "Viral Pin Generator", exact: true }).isVisible());
  ok("Sub-text", await page.getByText(/PinCraft will create everything automatically/i).isVisible());
  ok("Topic input with placeholder", (await page.getByPlaceholder("Sad Quotes").count()) === 1);
  ok("Generate button", await page.getByRole("button", { name: /Generate Viral Pin/i }).isVisible());

  // ---------- validation ----------
  await page.getByRole("button", { name: /Generate Viral Pin/i }).click();
  await page.waitForTimeout(300);
  ok("Empty topic shows error", await page.getByText(/Please type a topic first/i).isVisible());

  // ---------- generate via example chip ----------
  await page.getByRole("button", { name: "Sad Quotes", exact: true }).click();
  ok("Example chip fills input", (await page.getByLabel("Enter your topic").inputValue()) === "Sad Quotes");

  await page.getByRole("button", { name: /Generate Viral Pin/i }).click();
  await page.waitForTimeout(1600);

  ok("5 viral titles shown", (await page.getByRole("button", { name: /Copy to clipboard/i }).count()) >= 5);
  const titleItems = await page.locator("li", { has: page.locator("text=Copy") }).count();
  ok("Title rows rendered", titleItems >= 5);

  // ---------- copy a title ----------
  const firstCopy = page.getByRole("button", { name: "Copy to clipboard" }).first();
  await firstCopy.click();
  await page.waitForTimeout(250);
  const copiedTitle = await clip();
  ok(`Title copied → "${copiedTitle.slice(0, 40)}…"`, copiedTitle.length > 12);
  ok("Copy shows Copied state", await page.getByRole("button", { name: /Copied to clipboard/i }).first().isVisible());

  // ---------- description section ----------
  await page.getByRole("button", { name: /Pin Description/i }).click();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: /Copy description to clipboard/i }).click();
  await page.waitForTimeout(250);
  const desc = await clip();
  const descWords = desc.split(/\s+/).filter(Boolean).length;
  ok(`Description copied (${descWords} words, 100–150)`, descWords >= 100 && descWords <= 150);

  // ---------- hashtags ----------
  await page.getByRole("button", { name: /Viral Hashtags/i }).click();
  await page.waitForTimeout(350);
  const tagCount = await page.locator("button", { hasText: /^#/ }).count();
  ok(`10 hashtags rendered (${tagCount})`, tagCount === 10);

  await page.getByRole("button", { name: /Copy all hashtags to clipboard/i }).click();
  await page.waitForTimeout(250);
  const tags = await clip();
  ok(`All hashtags copied (${tags.split(" ").filter((t) => t.startsWith("#")).length} tags)`,
     tags.split(" ").filter((t) => t.startsWith("#")).length === 10);

  // single hashtag click copies it
  await page.locator("button", { hasText: /^#SadQuotes$/ }).first().click();
  await page.waitForTimeout(250);
  ok("Single hashtag copies", (await clip()).startsWith("#"));

  // ---------- image idea ----------
  await page.getByRole("button", { name: /Pin Image Idea/i }).click();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: /Copy prompt to clipboard/i }).click();
  await page.waitForTimeout(250);
  ok("Image prompt copied", (await clip()).includes("Vertical 2:3"));

  // ---------- next actions ----------
  ok("Generate Article button", await page.getByRole("link", { name: /Generate Article For This Pin/i }).isVisible());
  const href = await page.getByRole("link", { name: /Generate Article For This Pin/i }).getAttribute("href");
  ok(`Article link carries the title (${href.slice(0, 44)}…)`, href.startsWith("/article-writer?title="));

  await page.getByRole("button", { name: /Save To My Library/i }).click();
  await page.waitForTimeout(400);
  ok("Save shows saved state", await page.getByRole("button", { name: /Saved to My Library/i }).isVisible());

  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem("pincraft.library.v1");
    const list = raw ? JSON.parse(raw) : [];
    return { count: list.length, topic: list[0]?.topic, titles: list[0]?.titles?.length };
  });
  ok(`Saved to localStorage (${stored.count} item, "${stored.topic}", ${stored.titles} titles)`,
     stored.count === 1 && stored.titles === 5);

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
  await m.getByPlaceholder("Sad Quotes").fill("Home Decor Ideas");
  await m.getByRole("button", { name: /Generate Viral Pin/i }).click();
  await m.waitForTimeout(1600);
  ok("Mobile: results render", await m.getByRole("button", { name: /Step 01 Viral Pin Titles/i }).isVisible());
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
