// Browser checks for the Telegram hard gate and the one-button popup. Session and showcase APIs are mocked,
// so no real Telegram account is used. Run against a built server: TEST_BASE_URL=http://127.0.0.1:3110
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3110';
const user = { id: 'gate-test-uid', name: 'Gate Test', displayName: 'Gate Test', email: 'gate@example.com', provider: 'google', plan: 'free' };
const browser = await chromium.launch({ headless: true });

// state: { joined, configured, statusFails, linkFails, recheck: 'ok'|'bot_not_admin'|'fail' }
async function open(width, state = {}, path = '/') {
  const s = { joined: false, configured: true, statusFails: false, linkFails: false, recheck: 'ok', statusDelayMs: 0, ...state };
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  const calls = { link: 0, recheck: 0 };
  await context.route('**/api/auth/session', r => r.fulfill({ json: { user } }));
  await context.route('**/api/showcase', r => {
    if (s.statusFails) return r.fulfill({ status: 500, json: { ok: false, code: 'server_error' } });
    const body = { telegramJoined: s.joined, youtubeSubscribed: false, telegram: { configured: s.configured, botUsername: 'pincraft_bot' } };
    return setTimeout(() => r.fulfill({ json: body }), s.statusDelayMs || 0);
  });
  await context.route('**/api/showcase/telegram/recheck', r => {
    calls.recheck += 1;
    if (s.recheck === 'fail') return r.fulfill({ status: 503, json: { ok: false, code: 'telegram_unavailable', linked: true, telegramJoined: s.joined } });
    if (s.recheck === 'bot_not_admin') return r.fulfill({ status: 503, json: { ok: false, code: 'telegram_bot_not_admin', linked: true, telegramJoined: s.joined } });
    if (s.joined) return r.fulfill({ json: { ok: true, linked: true, telegramJoined: true } });
    return r.fulfill({ json: { ok: true, linked: false, telegramJoined: false } });
  });
  await context.route('**/api/showcase/telegram/link', r => {
    calls.link += 1;
    if (s.linkFails) return r.fulfill({ status: 503, json: { ok: false, code: 'telegram_unavailable' } });
    // Do not actually leave the page: answer with a safe URL and stop navigation.
    return r.fulfill({ json: { ok: true, url: 'https://t.me/pincraft_bot?start=link_TESTTESTTESTTESTTESTTEST', expiresInSeconds: 600 } });
  });
  // Block the real Telegram navigation so the test stays on the site.
  await context.route('https://t.me/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>bot</body></html>' }));
  const page = await context.newPage();
  await page.goto(base + path, { waitUntil: 'domcontentloaded' });
  return { context, page, s, calls };
}

const dialog = p => p.getByRole('dialog');
const overlay = p => p.getByTestId('channel-showcase');

try {
  // 1. Not joined: full gate, one button, no escape.
  {
    const { context, page } = await open(390, { joined: false });
    await dialog(page).waitFor({ timeout: 15000 });
    const text = await dialog(page).innerText();
    assert.match(text, /Join & Verify|Join &amp; Verify/);
    assert.equal(await page.getByRole('button', { name: 'Join & Verify' }).count(), 1, 'exactly one Telegram button');
    assert.equal(await page.getByRole('button', { name: /Skip|Close|Verify in Telegram|Join channel|Subscribe/i }).count(), 0, 'no skip, close, or extra buttons');
    assert.doesNotMatch(text, /youtube|subscri|PinCraftOfficial/i, 'no YouTube in popup');
    assert.match(await overlay(page).evaluate(el => getComputedStyle(el).position), /fixed/);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.equal(await dialog(page).count(), 1, 'Escape does not dismiss the gate');
    // Clicking a corner of the page lands on the gate, not on the site behind it.
    const hit = await page.evaluate(() => { const el = document.elementFromPoint(5, 5); return !!el?.closest('[data-testid="channel-showcase"]'); });
    assert.equal(hit, true, 'site behind the gate is covered');
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden', 'page scroll is locked');
    await context.close();
    console.log('PASS gate blocks signed-in, unverified user; one button; no escape; no YouTube');
  }

  // 2. Tap Join & Verify: link fetched, error-free path, waiting copy shown.
  {
    const { context, page, calls } = await open(390, { joined: false });
    await page.getByRole('button', { name: 'Join & Verify' }).click().catch(() => {});
    await page.waitForTimeout(800);
    assert.equal(calls.link, 1, 'one link request');
    await context.close();
    console.log('PASS Join & Verify requests a single-use bot link');
  }

  // 3. Server error on the link: clear message, retry, gate still shown.
  {
    const { context, page } = await open(390, { joined: false, linkFails: true });
    await page.getByRole('button', { name: 'Join & Verify' }).click();
    await page.getByText('Telegram could not be checked right now. Try again in a moment.').waitFor({ timeout: 10000 });
    assert.equal(await dialog(page).count(), 1, 'gate still shown after a service error');
    assert.equal(await page.getByRole('button', { name: 'Join & Verify' }).count(), 1, 'retry is available');
    await context.close();
    console.log('PASS link service error shows a clear message and keeps the gate with a retry');
  }

  // 4. Status endpoint fails: not a blank screen, shows message and Try again.
  {
    const { context, page } = await open(390, { statusFails: true });
    await dialog(page).waitFor({ timeout: 15000 });
    await page.getByText('Telegram could not be checked right now. Try again.', { exact: true }).waitFor({ timeout: 10000 });
    assert.equal(await page.getByRole('button', { name: 'Try again' }).count(), 1);
    assert.equal(await page.getByRole('button', { name: /Join & Verify/ }).count(), 0);
    await context.close();
    console.log('PASS status failure shows message and Try again, no blank screen');
  }

  // 5. Telegram not configured on the server: message and Try again.
  {
    const { context, page } = await open(390, { joined: false, configured: false });
    await page.getByText('The Telegram check is not available right now.', { exact: false }).waitFor({ timeout: 15000 });
    assert.equal(await page.getByRole('button', { name: 'Try again' }).count(), 1);
    await context.close();
    console.log('PASS not-configured shows message and Try again');
  }

  // 6. Bot not admin during recheck: error text shown, gate stays.
  {
    const { context, page } = await open(390, { joined: false, recheck: 'bot_not_admin' });
    await page.getByText('The Telegram check is temporarily unavailable.', { exact: false }).waitFor({ timeout: 15000 });
    assert.equal(await dialog(page).count(), 1);
    await context.close();
    console.log('PASS bot-not-admin service error is shown, gate stays');
  }

  // 7. Already verified: no popup at all.
  {
    const { context, page } = await open(390, { joined: true });
    await page.waitForTimeout(2000);
    assert.equal(await dialog(page).count(), 0, 'no gate once verified');
    assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
    await context.close();
    console.log('PASS verified user sees no gate');
  }

  // 8. Phone widths: no horizontal overflow, card inside the viewport.
  for (const width of [360, 390, 430]) {
    const { context, page } = await open(width, { joined: false });
    await page.getByRole('button', { name: 'Join & Verify' }).waitFor({ timeout: 15000 });
    const m = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]').getBoundingClientRect();
      const b = document.querySelector('[role="dialog"] button').getBoundingClientRect();
      return { docW: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth, left: d.left, right: d.right, btnH: b.height, btnRight: b.right };
    });
    assert.ok(m.docW <= m.vw, `no horizontal overflow at ${width}px (${m.docW} > ${m.vw})`);
    assert.ok(m.left >= 0 && m.right <= width, `dialog fits at ${width}px`);
    assert.ok(m.btnRight <= width && m.btnH >= 44, `button fits and is tappable at ${width}px`);
    await page.screenshot({ path: `/home/user/gate-${width}.png`, fullPage: false });
    await context.close();
    console.log(`PASS ${width}px: no overflow, dialog fits, button 44px+`);
  }

  // 9. Verification completes while the popup is open: Verified state then Continue releases the site.
  {
    const { context, page, s } = await open(390, { joined: false });
    await dialog(page).waitFor({ timeout: 15000 });
    s.joined = true;
    await page.getByText('Telegram membership verified', { exact: false }).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(300);
    assert.equal(await dialog(page).count(), 0, 'Continue releases the site after verification');
    await context.close();
    console.log('PASS verification while open shows Verified, Continue releases the site');
  }

  // 10. Verified member: a slow check never shows the dialog (only a plain cover after 1.2s, and it is not
  //     the popup). Verified members see nothing once the check finishes.
  {
    const { context, page } = await open(390, { joined: true, statusDelayMs: 2500 });
    await page.waitForTimeout(600);
    assert.equal(await dialog(page).count(), 0, 'no dialog while checking a verified member');
    await page.waitForTimeout(2600);
    assert.equal(await dialog(page).count(), 0, 'no dialog after the check for a verified member');
    assert.equal(await page.getByTestId('channel-showcase').count(), 0, 'no cover after the check');
    await context.close();
    console.log('PASS verified member: no dialog during a slow check or after it');
  }

  // 11. Verified member, Telegram re-check fails: stored flag holds, no dialog and no error screen.
  {
    const { context, page } = await open(390, { joined: true, recheck: 'fail' });
    await page.waitForTimeout(2000);
    assert.equal(await dialog(page).count(), 0, 'verified member is not gated by a Telegram outage');
    await context.close();
    console.log('PASS verified member: Telegram outage does not bring the popup back');
  }

  // 12. A member who left: the gate returns on the next visit (page load), not only after a button press.
  {
    const { context, page, s } = await open(390, { joined: true });
    await page.waitForTimeout(1500);
    assert.equal(await dialog(page).count(), 0, 'member sees no gate');
    s.joined = false;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await dialog(page).waitFor({ timeout: 15000 });
    assert.equal(await page.getByRole('button', { name: 'Join & Verify' }).count(), 1, 'leaver is asked to join again');
    await context.close();
    console.log('PASS member who left: gate returns on the next visit');
  }
} finally {
  await browser.close();
}
console.log('showcase-gate: all checks passed');
