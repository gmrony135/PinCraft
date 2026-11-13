// E2E smoke test for all PinCraft screens & flows (mobile viewport)
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const shots = "/home/user/.shots";

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

  const steps = [];
  const ok = (name, cond) => steps.push({ name, pass: !!cond });

  await page.goto(BASE, { waitUntil: "networkidle" });
  ok("Landing headline", await page.getByText("Automation in").first().isVisible());
  ok("Get Started button", await page.getByRole("button", { name: /Get Started Free/i }).first().isVisible());
  await page.screenshot({ path: `${shots}/01-landing.png`, fullPage: true });

  // Login link from hero
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.waitForTimeout(400);
  ok("Login page", await page.getByText("Welcome back").first().isVisible());
  await page.screenshot({ path: `${shots}/02-login.png`, fullPage: true });

  // Back → signup
  await page.getByLabel("Go back").click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Get Started Free/i }).first().click();
  await page.waitForTimeout(400);
  ok("Signup page", await page.getByText("Create account").first().isVisible());

  // Validation: submit empty
  await page.getByRole("button", { name: /Create Free Account/i }).click();
  await page.waitForTimeout(300);
  ok("Signup validation", await page.getByText("Please enter your full name").isVisible());
  await page.screenshot({ path: `${shots}/03-signup-errors.png`, fullPage: true });

  // Fill form
  await page.getByPlaceholder("e.g. Rony Ahmed").fill("Rony Ahmed");
  await page.getByPlaceholder("you@example.com").fill("rony@example.com");
  await page.getByPlaceholder("Create a password").fill("secret123");
  await page.getByRole("button", { name: /^Yes/ }).click();
  await page.locator("select").selectOption("quotes");
  await page.screenshot({ path: `${shots}/04-signup-filled.png`, fullPage: true });
  await page.getByRole("button", { name: /Create Free Account/i }).click();
  await page.waitForTimeout(700);

  ok("Dashboard after signup", await page.getByText("Welcome back,").isVisible());
  ok("Plan badge", await page.getByText("Plan: Free").isVisible());
  await page.screenshot({ path: `${shots}/05-dashboard.png`, fullPage: true });

  // Category select
  await page.getByRole("button", { name: /Quotes/ }).first().click();
  await page.waitForTimeout(400);
  ok("Category selected toast", await page.getByText("Category updated").isVisible());

  // Connect Pinterest
  await page.getByRole("button", { name: /Connect Pinterest Account/i }).click();
  await page.waitForTimeout(500);
  ok("Pinterest page", await page.getByText("Connect your Pinterest").isVisible());
  await page.getByPlaceholder("https://pinterest.com/yourname").fill("https://pinterest.com/rony");
  await page.getByRole("button", { name: /Connect Pinterest Account/i }).click();
  await page.waitForTimeout(1800);
  ok("Pinterest connected", await page.getByText("Pinterest is connected").isVisible());
  await page.screenshot({ path: `${shots}/06-pinterest.png`, fullPage: true });
  await page.getByLabel("Go back").click();
  await page.waitForTimeout(500);

  // Content page
  await page.getByRole("navigation").getByRole("button", { name: "Create" }).click();
  await page.waitForTimeout(500);
  ok("Content page", await page.getByText("Create content").first().isVisible());
  await page.getByPlaceholder(/Sad Quotes for Broken Heart/).fill("Sad Quotes for Broken Heart");
  await page.getByRole("button", { name: /Generate with AI/i }).click();
  await page.waitForTimeout(2200);
  ok("Results: titles", await page.getByText("Pin Titles").first().isVisible());
  ok("Results: blog", await page.getByText("Blog Post").first().isVisible());
  await page.screenshot({ path: `${shots}/07-content-result.png`, fullPage: true });

  // expand blog
  await page.getByRole("button", { name: /Blog Post/ }).click();
  await page.waitForTimeout(400);
  const blogWords = await page.getByText(/Keywords:/).first().isVisible();
  ok("Blog keywords visible", blogWords);
  await page.screenshot({ path: `${shots}/08-content-blog.png`, fullPage: true });

  // post buttons
  await page.getByRole("button", { name: /^Post to Pinterest$/ }).click();
  await page.waitForTimeout(400);
  ok("Posted to Pinterest state", await page.getByText("Posted to Pinterest").isVisible());
  await page.getByRole("button", { name: /Post to Blog/ }).click();
  await page.waitForTimeout(400);
  ok("Blog published state", await page.getByText("Blog published").isVisible());
  await page.screenshot({ path: `${shots}/09-content-posted.png`, fullPage: true });

  // Schedule
  await page.getByRole("navigation").getByRole("button", { name: "Schedule" }).click();
  await page.waitForTimeout(500);
  ok("Schedule page", await page.getByText("How many Pins per day?").isVisible());
  await page.getByRole("button", { name: /^10/ }).click();
  await page.getByRole("button", { name: /9 PM/ }).click();
  await page.screenshot({ path: `${shots}/10-schedule.png`, fullPage: true });
  await page.getByRole("button", { name: /Save & Start Automation/i }).click();
  await page.waitForTimeout(700);
  ok("Automation active", await page.getByText("Automation active").isVisible());

  // Settings
  await page.getByRole("navigation").getByRole("button", { name: "Settings" }).click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder("https://myblog.com").fill("https://myblog.com");
  await page.getByPlaceholder("https://pinterest.com/yourname").fill("https://pinterest.com/rony");
  await page.getByPlaceholder("wp_xxxxxxxxxxxxxxxx").fill("wp_1234567890abcdef");
  await page.getByPlaceholder("pinterest_app_secret").fill("pin_secret_abcdef123");
  await page.screenshot({ path: `${shots}/11-settings.png`, fullPage: true });
  await page.getByRole("button", { name: /Save Settings/i }).click();
  await page.waitForTimeout(600);
  ok("Settings saved", await page.getByText("Settings saved").isVisible());

  // Persistence check: reload
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  ok("Session persists after reload", await page.getByText("Welcome back,").isVisible());
  await page.screenshot({ path: `${shots}/12-after-reload.png`, fullPage: true });

  // Logout
  await page.getByRole("navigation").getByRole("button", { name: "Settings" }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Log out/i }).click();
  await page.waitForTimeout(700);
  ok("Logged out -> landing", await page.getByRole("button", { name: /Get Started Free/i }).first().isVisible());

  await browser.close();

  const failed = steps.filter((s) => !s.pass);
  console.log("\n=== RESULTS ===");
  steps.forEach((s) => console.log(`${s.pass ? "PASS" : "FAIL"}  ${s.name}`));
  console.log(`\n${steps.length - failed.length}/${steps.length} passed`);
  if (errors.length) {
    console.log("\n=== CONSOLE ERRORS ===");
    errors.slice(0, 15).forEach((e) => console.log("•", e));
  } else {
    console.log("\nNo console errors ✅");
  }
  process.exit(failed.length ? 1 : 0);
}

run().catch((e) => {
  console.error("TEST CRASH:", e);
  process.exit(1);
});
