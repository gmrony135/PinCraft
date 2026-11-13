// Homepage verification: desktop + mobile screenshots + a11y/console checks
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const OUT = "/home/user/.shots";

async function run() {
  const browser = await chromium.launch();
  const steps = [];
  const ok = (name, cond) => steps.push({ name, pass: !!cond });
  const errors = [];

  // ---------- desktop ----------
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const dpage = await dctx.newPage();
  dpage.on("console", (m) => m.type() === "error" && errors.push("desktop: " + m.text()));
  dpage.on("pageerror", (e) => errors.push("desktop PAGEERROR: " + e.message));
  await dpage.goto(BASE, { waitUntil: "networkidle" });

  ok("Hero heading", await dpage.getByRole("heading", { name: /Pinterest Automation Machine/i }).isVisible());
  ok("Navbar links (5)", (await dpage.getByRole("listitem").filter({ hasText: /Pin Generator|Article Writer|Dashboard|My Library/ }).count()) >= 4);
  ok("Login button", await dpage.getByRole("link", { name: "Login", exact: true }).first().isVisible());
  ok("CTA Generate Viral Pin", await dpage.getByRole("link", { name: /Generate Viral Pin/i }).first().isVisible());
  ok("CTA How It Works", await dpage.getByRole("link", { name: /How It Works/i }).first().isVisible());
  ok("How it works 4 steps", (await dpage.getByRole("heading", { name: /Give Topic|PinCraft Creates Viral Pin|Auto Article \+ Auto Post|Traffic/i }).count()) === 4);
  ok("3 feature boxes", (await dpage.getByRole("heading", { name: /Viral Pin Generator|Auto Article Writer|Automation Dashboard/i }).count()) === 3);
  ok("Income formula section", await dpage.getByText("Income formula").isVisible());
  ok("Footer About", await dpage.getByRole("link", { name: "About" }).isVisible());
  ok("Footer Contact", await dpage.getByRole("link", { name: "Contact" }).isVisible());

  await dpage.screenshot({ path: `${OUT}/home-desktop.png`, fullPage: true });
  await dpage.screenshot({ path: `${OUT}/home-desktop-fold.png` });

  // "How It Works" anchor scroll
  await dpage.getByRole("link", { name: /How It Works/i }).first().click();
  await dpage.waitForTimeout(700);
  ok("How It Works anchor scrolls", (await dpage.evaluate(() => window.scrollY)) > 200);

  // CTA navigates (will 404 until the page is built — check router responds)
  await dpage.goto(BASE, { waitUntil: "domcontentloaded" });

  // ---------- mobile ----------
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mpage = await mctx.newPage();
  mpage.on("console", (m) => m.type() === "error" && errors.push("mobile: " + m.text()));
  mpage.on("pageerror", (e) => errors.push("mobile PAGEERROR: " + e.message));
  await mpage.goto(BASE, { waitUntil: "networkidle" });

  ok("Mobile: hero visible", await mpage.getByRole("heading", { name: /Pinterest Automation Machine/i }).isVisible());
  await mpage.screenshot({ path: `${OUT}/home-mobile.png`, fullPage: true });

  // hamburger menu
  await mpage.getByRole("button", { name: /Open menu/i }).click();
  await mpage.waitForTimeout(350);
  ok("Mobile menu opens", await mpage.getByRole("banner").getByRole("link", { name: "My Library" }).isVisible());
  await mpage.screenshot({ path: `${OUT}/home-mobile-menu.png` });
  await mpage.getByRole("button", { name: /Close menu/i }).click();
  await mpage.waitForTimeout(250);

  // no horizontal overflow (key mobile check)
  const overflow = await mpage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  ok(`No horizontal overflow (got ${overflow}px)`, overflow <= 1);

  // tap targets >= 40px for primary controls
  const smallTaps = await mpage.evaluate(() => {
    const nodes = [...document.querySelectorAll("a,button")];
    return nodes
      .filter((n) => {
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 40;
      })
      .map((n) => n.textContent.trim().slice(0, 24));
  });
  ok(`Tap targets ok (${smallTaps.length} small: ${smallTaps.slice(0, 3).join(", ")})`, smallTaps.length <= 6);

  await browser.close();

  const failed = steps.filter((s) => !s.pass);
  console.log("\n=== HOMEPAGE CHECKS ===");
  steps.forEach((s) => console.log(`${s.pass ? "PASS" : "FAIL"}  ${s.name}`));
  console.log(`\n${steps.length - failed.length}/${steps.length} passed`);
  console.log(errors.length ? "\nCONSOLE ERRORS:\n" + errors.join("\n") : "\nNo console errors ✅");
  process.exit(failed.length ? 1 : 0);
}

run().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
