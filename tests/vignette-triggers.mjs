// Browser checks for trigger-based Vignette (owner order 2026-11-21). Vendor scripts are stubbed.
// Run against a built server: TEST_BASE_URL=http://127.0.0.1:3101 node tests/vignette-triggers.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3101';
const VIGNETTE = '12290345';
const STATE_KEY = 'pincraft.vignette-frequency.v1';
const browser = await chromium.launch({ headless: true });
const requests = [];

async function newPage(seed = null) {
  const context = await browser.newContext();
  await context.addInitScript(seed => {
    if (seed && !sessionStorage.getItem('seeded')) { localStorage.setItem('pincraft.vignette-frequency.v1', seed); sessionStorage.setItem('seeded', '1'); }
  }, seed);
  await context.route('**/api/auth/session', r => r.fulfill({ json: { user: null } }));
  await context.route(/https:\/\/(nap5k\.com|5gvci\.com|n6wxm\.com)\//, r => { requests.push(r.request().url()); r.fulfill({ contentType: 'application/javascript', body: '/* vendor stub: trigger test only */' }); });
  const page = await context.newPage();
  return { context, page };
}
const vignetteCount = p => p.locator(`script[data-monetag-zone="${VIGNETTE}"]`).count();
const readState = p => p.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), STATE_KEY);
const today = () => new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10); // Dhaka date for the seed
const seed = (fields) => JSON.stringify({ day: today(), generations: 0, pageViews: 0, pageTriggerUsed: false, queued: null, shows: 0, ...fields });

try {
  // (a) Real generator flow as a guest: first pin pack gives no Vignette, second queues one and the tag stays off the generator.
  let { context, page } = await newPage();
  await page.goto(base + '/pin-generator', { waitUntil: 'networkidle' });
  await page.locator('#topic').fill('Balcony gardening for small apartments');
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForFunction(() => document.body.innerText.length > 0);
  await page.waitForTimeout(800);
  let state = await readState(page);
  assert.equal(state.generations, 1, 'first completion counted');
  assert.equal(state.queued, null, 'first completion does not queue a Vignette');
  assert.equal(await vignetteCount(page), 0, 'no Vignette tag on generator page');
  await page.locator('#topic').fill('Simple weeknight dinner ideas');
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForTimeout(800);
  state = await readState(page);
  assert.equal(state.queued, 'generation', 'second completion queues one show');
  assert.equal(state.generations, 0, 'counter reset at trigger');
  assert.equal(await vignetteCount(page), 0, 'queued show does NOT append ad code on the generator (excluded route)');
  console.log('PASS (a): 1st completion no show; 2nd completion queues one; counter reset; no ad code on generator');

  // (c) Queued show is consumed on the next marketing page via a full navigation, not inside the editor.
  await page.evaluate(() => { window.__marker = 'before-nav'; });
  await page.goto(base + '/about', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('script[data-monetag-zone]').length >= 1, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  assert.equal(await vignetteCount(page), 1, 'Vignette appended on next marketing page after the trigger');
  state = await readState(page);
  assert.equal(state.queued, null, 'queued show consumed');
  assert.equal(state.shows, 1, 'one show counted for the day');
  await context.close();
  console.log('PASS (c): trigger appends Vignette on the next marketing page, once');

  // (c) Excluded routes never load Vignette unless a trigger is queued and consumed there, and never without one.
  ({ context, page } = await newPage(seed({ generations: 0, queued: 'page', shows: 1, pageViews: 3, pageTriggerUsed: true })));
  await page.goto(base + '/privacy', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  assert.equal(await vignetteCount(page), 0, 'excluded policy route: no Vignette even with a queued show');
  await page.goto(base + '/pin-generator', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  assert.equal(await vignetteCount(page), 0, 'generator route: no Vignette even with a queued show');
  assert.equal((await readState(page)).queued, 'page', 'excluded routes do not consume the queued show');
  await context.close();
  console.log('PASS (c): excluded routes never load or consume a queued Vignette show');

  // (d) Boundary-link rule: a cross-profile link click from a marketing page is a full navigation.
  ({ context, page } = await newPage());
  await page.goto(base + '/about', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('script[data-monetag-zone]').length >= 1, null, { timeout: 15000 });
  await page.evaluate(() => {
    window.__marker = 'same-document';
    const link = document.createElement('a'); link.href = '/pin-generator'; link.id = 'boundary-probe'; link.textContent = 'probe';
    document.body.appendChild(link);
  });
  await page.locator('#boundary-probe').click();
  await page.waitForURL(/\/pin-generator$/, { timeout: 15000 });
  assert.equal(await page.evaluate(() => window.__marker), undefined, 'cross-profile click must do a full navigation (marker gone)');
  await context.close();
  console.log('PASS (d): boundary link from a marketing page to an excluded route does a full navigation');

  // (b) Page trigger: views 1 and 2 show nothing, view 3 appends once, view 4 does not add another.
  ({ context, page } = await newPage());
  const counts = [];
  for (let view = 1; view <= 4; view++) {
    await page.goto(base + '/about', { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    counts.push(await vignetteCount(page));
  }
  // Each goto is a fresh page load: the 4th load must not append the tag again the same day.
  assert.deepEqual(counts, [0, 0, 1, 0], `page-view trigger counts ${JSON.stringify(counts)}`);
  state = await readState(page);
  assert.equal(state.pageViews, 4);
  assert.equal(state.pageTriggerUsed, true);
  assert.equal(state.shows, 1, 'page trigger used once for the day');
  await context.close();
  console.log('PASS (b): 3rd marketing page view shows once; 4th does not repeat the same day');
} finally {
  await browser.close();
}
console.log(`Vignette tag requests observed (vendor stubs): ${requests.filter(u => u.includes('n6wxm.com')).length}`);
