// Browser smoke checks for the explicitly offline Article Writer mode.
// AI article length, FAQs, SEO fields and image requirements are covered by
// scripts/check-ai.mjs and the reviewed-publishing contract tests; no provider
// credentials, billable inference or publication is used here.
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const OUT = ".shots";

async function run() {
  const fs = require("node:fs");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const errors = [];
  const steps = [];
  page.on("console", message => message.type() === "error" && errors.push(message.text()));
  page.on("pageerror", error => errors.push("PAGEERROR: " + error.message));
  const ok = (name, condition) => steps.push({ name, pass: !!condition });
  const clip = () => page.evaluate(() => navigator.clipboard.readText());

  await page.goto(`${BASE}/article-writer`, { waitUntil: "networkidle" });
  const titleField = page.getByPlaceholder("Simple Balcony Garden Ideas for Small Spaces");
  ok("Article Writer heading", await page.getByRole("heading", { name: "Auto Article Writer", exact: true }).isVisible());
  ok("Updated article and image guidance", await page.getByText(/Create a practical draft with a 50–60-character H1/).isVisible());
  const modeControls = (await page.getByText("Content generation mode", { exact: true }).count())
    + (await page.getByRole("button", { name: "Offline template", exact: true }).count())
    + (await page.getByRole("button", { name: "Live AI + fallback", exact: true }).count());
  const modeNotice = await page.locator("main").innerText();
  const selectorDisclosure = "Verified sign-in required. Generating sends your text to an AI service and uses your daily allowance. Automatic recovery is included. Do not enter private or sensitive information.";
  ok("Guest sees no generation-mode selector or disclosure", modeControls === 0 && !modeNotice.includes(selectorDisclosure));
  ok("Generate button and title field", await titleField.isVisible() && await page.getByRole("button", { name: "Generate Article", exact: true }).isVisible());

  await page.getByRole("button", { name: "Generate Article", exact: true }).click();
  ok("Empty title is rejected", await page.getByRole("alert").filter({ hasText: /Enter a topic or title first/ }).isVisible());

  await titleField.fill("Easy Balcony Garden Ideas for Small Spaces");
  await page.getByRole("button", { name: "Generate Article", exact: true }).click();
  await page.locator("article h1").waitFor();
  ok("Offline result is explicitly not labeled AI", await page.getByText(/Offline template · not a live AI request/).isVisible());
  const bodyText = await page.locator("article").innerText();
  const bodyWords = bodyText.split(/\s+/u).filter(Boolean).length;
  ok(`Offline sample renders content (${bodyWords} visible page words)`, bodyWords >= 400);
  const toc = page.getByRole("navigation", { name: "Table of contents" });
  const tocTargets = await toc.locator("a").evaluateAll(nodes => nodes.map(node => node.getAttribute("href")));
  const tocTargetsExist = await page.evaluate(hrefs => hrefs.every(href => href && document.querySelector(href)), tocTargets);
  ok("The linked contents list includes tips and final thoughts with matching anchors", tocTargets.includes("#article-tips") && tocTargets.includes("#article-conclusion") && tocTargetsExist);
  ok("SEO fields are labeled as suggestions, not a ranking promise", await page.getByText("SEO Score", { exact: true }).isVisible() && await page.getByText("SEO fields · suggestions, not a ranking promise", { exact: true }).isVisible());
  ok("Offline template is blocked from publishing under the 1,000–1,600-word contract", await page.getByTestId("article-publishing-handoff").getByText(/outside 1,000–1,600/).isVisible() && await page.getByRole("button", { name: "Save & open publishing review" }).isDisabled());
  ok("Offline template discloses missing required AI illustrations", await page.getByTestId("article-publishing-handoff").getByText(/one or more required AI images are missing/i).isVisible());
  ok("No AI image set is falsely reported as complete", await page.locator('[data-testid="article-image-status"]').count() === 0);

  await page.getByRole("button", { name: /Copy Full Article to clipboard/i }).click();
  const copied = await clip();
  const copiedWords = copied.split(/\s+/u).filter(Boolean).length;
  ok("Copy Full Article preserves the complete offline draft", copied.includes("# Easy Balcony Garden Ideas") && copied.includes("## ") && copiedWords >= 400 && copiedWords < 1000);

  await page.getByRole("button", { name: "Save To My Library", exact: true }).click();
  await page.getByRole("button", { name: "Saved to My Library", exact: true }).waitFor();
  const saved = await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem("pincraft.library.v1") || "[]");
    const article = list.find(item => item.type === "article");
    return { count: list.length, words: article?.wordCount, generation: article?.generation?.kind };
  });
  ok("Offline article saves privately without AI or publication claims", saved.count >= 1 && saved.words >= 400 && !saved.generation);
  await page.screenshot({ path: `${OUT}/article-writer-offline-desktop.png`, fullPage: false, animations: "disabled", timeout: 15000 });

  await page.goto(`${BASE}/article-writer?title=${encodeURIComponent("5 Home Decor Ideas for Small Rooms")}&topic=Home%20Decor`, { waitUntil: "networkidle" });
  const prefilled = await titleField.inputValue();
  ok("Title is prefilled from the URL", prefilled === "5 Home Decor Ideas for Small Rooms");
  await page.getByRole("button", { name: "Generate Article", exact: true }).click();
  await page.locator("article h1").waitFor();
  ok("Topic-aware offline article renders", await page.locator("article").getByText("Home Decor", { exact: true }).first().isVisible());

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mobile = await mobileContext.newPage();
  mobile.on("pageerror", error => errors.push("mobile PAGEERROR: " + error.message));
  await mobile.goto(`${BASE}/article-writer`, { waitUntil: "networkidle" });
  await mobile.getByPlaceholder("Simple Balcony Garden Ideas for Small Spaces").fill("Easy Weeknight Dinner Planning for Busy Families");
  await mobile.getByRole("button", { name: "Generate Article", exact: true }).click();
  await mobile.locator("article h1").waitFor();
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`Mobile has no horizontal overflow (${overflow}px)`, overflow <= 1);
  ok("Mobile offline result remains publish-blocked", await mobile.getByRole("button", { name: "Save & open publishing review" }).isDisabled());
  await mobile.screenshot({ path: `${OUT}/article-writer-offline-mobile.png`, fullPage: false, animations: "disabled", timeout: 15000 });

  await browser.close();
  const failed = steps.filter(step => !step.pass);
  console.log("\n=== ARTICLE WRITER OFFLINE CHECKS ===");
  for (const step of steps) console.log(`${step.pass ? "PASS" : "FAIL"}  ${step.name}`);
  console.log(`\n${steps.length - failed.length}/${steps.length} passed`);
  console.log(errors.length ? "\nCONSOLE ERRORS:\n" + errors.join("\n") : "\nNo console errors ✅");
  if (failed.length) process.exitCode = 1;
}

run().catch(error => { console.error("CRASH:", error); process.exitCode = 1; });
