import { chromium } from 'playwright';
import assert from 'node:assert/strict';
// Owner decision 2026-11-19: In-Page Push and Vignette load for every eligible visitor, Accept or Reject.
// Classic Push (browser notifications) stays separate and is never requested automatically.
const browser = await chromium.launch({ headless: true });
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3101';
async function setup(path = '/', user = null) {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.__permissionCalls = 0; let permission = 'default';
    Object.defineProperty(window, 'Notification', { value: { get permission() { return permission; }, requestPermission() { window.__permissionCalls++; permission = 'granted'; return Promise.resolve('granted'); } } });
  });
  await context.route('**/api/auth/session', r => r.fulfill({ json: { user } }));
  await context.route(/https:\/\/(nap5k\.com|5gvci\.com|n6wxm\.com)\//, r => r.fulfill({ contentType: 'application/javascript', body: '/* vendor stub: gating test only */' }));
  const page = await context.newPage();
  await page.goto(base + path, { waitUntil: 'networkidle' });
  return { context, page };
}
const zones = p => p.locator('script[data-monetag-zone]').evaluateAll(ss => ss.map(s => s.dataset.monetagZone).sort());
try {
  // 1. Fresh guest on the homepage: tags load before any choice is made.
  let { context, page } = await setup('/');
  await page.waitForFunction(() => document.querySelectorAll('script[data-monetag-zone]').length === 2, null, { timeout: 15000 });
  assert.deepEqual(await zones(page), ['12287927', '12290345']);
  assert.equal(await page.evaluate(() => window.__permissionCalls), 0);
  await context.close();
  console.log('PASS: fresh guest, tags load before any choice');

  // 2. Reject: tags still load, no reload, banner still reachable, no automatic push permission.
  ({ context, page } = await setup('/'));
  await page.getByRole('button', { name: 'Reject ad cookies', exact: true }).waitFor({ timeout: 15000 });
  await page.evaluate(() => { window.__marker = 'same-document'; });
  await page.getByRole('button', { name: 'Reject ad cookies', exact: true }).click();
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => window.__marker), 'same-document', 'Reject must not reload the page');
  assert.deepEqual(await zones(page), ['12287927', '12290345']);
  assert.equal(await page.evaluate(() => window.__permissionCalls), 0);
  assert.equal(await page.getByRole('button', { name: 'Enable ad notifications', exact: true }).count(), 0);
  await context.close();
  console.log('PASS: Reject keeps In-Page Push and Vignette loaded, no reload, no push prompt');

  // 3. Allow: same result.
  ({ context, page } = await setup('/'));
  await page.getByRole('button', { name: 'Allow ad cookies', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('script[data-monetag-zone]').length === 2, null, { timeout: 15000 });
  assert.deepEqual(await zones(page), ['12287927', '12290345']);
  await context.close();
  console.log('PASS: Allow loads the same tags');

  // 4. About page: In-Page Push only (no Vignette), regardless of choice.
  ({ context, page } = await setup('/about'));
  await page.waitForFunction(() => document.querySelectorAll('script[data-monetag-zone]').length === 1, null, { timeout: 15000 });
  assert.deepEqual(await zones(page), ['12287927']);
  await context.close();
  console.log('PASS: /about loads In-Page Push only');

  // 5. Excluded policy route: no ads and no banner.
  ({ context, page } = await setup('/privacy'));
  await page.waitForTimeout(1500);
  assert.deepEqual(await zones(page), []);
  assert.equal(await page.getByRole('button', { name: 'Reject ad cookies', exact: true }).count(), 0);
  await context.close();
  console.log('PASS: excluded policy route loads no ads');
} finally {
  await browser.close();
}
