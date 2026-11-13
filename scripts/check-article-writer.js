// Article Writer verification: generation, structure, stats, all 3 buttons
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const OUT = "/home/user/.shots";

async function run() {
  const browser = await chromium.launch();
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
  await page.goto(`${BASE}/article-writer`, { waitUntil: "networkidle" });
  ok("Page heading", await page.getByRole("heading", { name: "Auto Article Writer", exact: true }).isVisible());
  ok("Sub-text", await page.getByText(/write a full SEO Blog Article for your Pin/i).isVisible());
  ok("Title input placeholder", (await page.getByPlaceholder("10 Sad Quotes That Will Make You Cry").count()) === 1);
  ok("Generate Article button", await page.getByRole("button", { name: /Generate Article$/i }).isVisible());
  ok("Use Title From Pin Generator button", await page.getByRole("button", { name: /Use Title From Pin Generator/i }).isVisible());

  // ---------- validation ----------
  await page.getByRole("button", { name: /Generate Article$/i }).click();
  await page.waitForTimeout(300);
  ok("Empty title shows error", await page.getByText(/Enter a pin title first/i).isVisible());

  // ---------- generate ----------
  await page.getByPlaceholder("10 Sad Quotes That Will Make You Cry").fill("10 Sad Quotes That Will Make You Cry");
  await page.getByRole("button", { name: /Generate Article$/i }).click();
  await page.waitForTimeout(1800);

  // structure
  const h1 = await page.locator("article h1").innerText();
  ok(`H1 equals pin title`, h1.trim() === "10 Sad Quotes That Will Make You Cry");
  const h2count = await page.locator("article h2").count();
  ok(`5 H2 headings (3 sections + list + conclusion) → ${h2count}`, h2count === 5);
  const paras = await page.locator("article p").count();
  ok(`Body paragraphs rendered (${paras})`, paras >= 10);
  const listItems = await page.locator("article ul li").count();
  ok(`Quotes/list section items (${listItems})`, listItems >= 6);

  // stats
  const bodyText = await page.locator("article").innerText();
  const allWords = bodyText.split(/\s+/).filter(Boolean).length;
  ok(`Article 500–800 words (page text ≈ ${allWords})`, allWords >= 480 && allWords <= 900);

  const statText = await page.locator("text=SEO Score").first().isVisible();
  ok("SEO Score shown", statText);
  const seo = await page.locator("text=/^\\d{2,3}\\/100$/").first().innerText();
  const seoNum = parseInt(seo, 10);
  ok(`SEO score is realistic (${seo})`, seoNum >= 80 && seoNum <= 100);
  ok("Word Count shown", await page.locator("text=Word Count").first().isVisible());

  // ---------- copy full article ----------
  await page.getByRole("button", { name: /Copy Full Article to clipboard/i }).click();
  await page.waitForTimeout(300);
  const copied = await clip();
  const copiedWords = copied.split(/\s+/).filter(Boolean).length;
  ok(`Copy Full Article works (${copiedWords} words, has H1 + H2)`,
     copied.includes("# 10 Sad Quotes") && copied.includes("## ") && copiedWords >= 450);

  // ---------- save to library ----------
  await page.getByRole("button", { name: "Save To My Library", exact: true }).click();
  await page.waitForTimeout(500);
  ok("Save shows saved state", await page.getByRole("button", { name: "Saved to My Library", exact: true }).isVisible());
  const lib = await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem("pincraft.library.v1") || "[]");
    const art = list.find((x) => x.type === "article");
    return { count: list.length, words: art?.wordCount, seo: art?.seoScore?.total };
  });
  ok(`Saved article in library (${lib.words} words, SEO ${lib.seo})`, lib.count >= 1 && lib.words >= 500);

  // ---------- auto publish ----------
  await page.getByRole("button", { name: "Auto Publish To Blog", exact: true }).click();
  await page.waitForTimeout(500);
  ok("Publish shows published state", await page.getByRole("button", { name: "Published To Blog", exact: true }).isVisible());
  ok("Publish confirmation note", await page.getByText(/queued for your blog/i).isVisible());
  const published = await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem("pincraft.library.v1") || "[]");
    return list.some((x) => x.type === "published");
  });
  ok("Published item stored", published);

  await page.screenshot({ path: `${OUT}/article-writer-desktop.png`, fullPage: true });

  // ---------- deep link from Pin Generator ----------
  await page.goto(
    `${BASE}/article-writer?title=${encodeURIComponent("5 Home Decor Ideas for Small Rooms")}&topic=Home%20Decor`,
    { waitUntil: "networkidle" }
  );
  const prefilled = await page.getByPlaceholder("10 Sad Quotes").inputValue();
  ok(`Title prefilled from URL ("${prefilled}")`, prefilled === "5 Home Decor Ideas for Small Rooms");
  await page.getByRole("button", { name: /Generate Article$/i }).click();
  await page.waitForTimeout(1700);
  const niche = await page.locator("article").getByText("Home Decor", { exact: true }).first().isVisible();
  ok("Niche-aware article for Home Decor", niche);

  // ---------- mobile ----------
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const m = await mctx.newPage();
  m.on("pageerror", (e) => errors.push("mobile PAGEERROR: " + e.message));
  await m.goto(`${BASE}/article-writer`, { waitUntil: "networkidle" });
  await m.getByPlaceholder("10 Sad Quotes That Will Make You Cry").fill("Easy 15 Minute Dinner Recipes");
  await m.getByRole("button", { name: /Generate Article$/i }).click();
  await m.waitForTimeout(1800);
  ok("Mobile: article renders", await m.locator("article h1").isVisible());
  const overflow = await m.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  ok(`Mobile: no horizontal overflow (${overflow}px)`, overflow <= 1);
  await m.screenshot({ path: `${OUT}/article-writer-mobile.png`, fullPage: true });

  await browser.close();

  const failed = steps.filter((s) => !s.pass);
  console.log("\n=== ARTICLE WRITER CHECKS ===");
  steps.forEach((s) => console.log(`${s.pass ? "PASS" : "FAIL"}  ${s.name}`));
  console.log(`\n${steps.length - failed.length}/${steps.length} passed`);
  console.log(errors.length ? "\nCONSOLE ERRORS:\n" + errors.join("\n") : "\nNo console errors ✅");
  process.exit(failed.length ? 1 : 0);
}

run().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
