// Homepage smoke test: message hierarchy, hero animation, primary navigation,
// reduced-motion support and mobile overflow. Requires a running Next.js server
// and an installed Playwright Chromium browser.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';

async function run() {
  const browser = await chromium.launch();
  const checks = [];
  const errors = [];
  const ok = (name, passed) => checks.push({ name, passed: Boolean(passed) });

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  desktop.on('console', message => message.type() === 'error' && errors.push(`desktop console: ${message.text()}`));
  desktop.on('pageerror', error => errors.push(`desktop page: ${error.message}`));
  await desktop.goto(BASE, { waitUntil: 'networkidle' });

  ok('Homepage has the new article-focused H1', await desktop.getByRole('heading', { level: 1, name: /Turn your ideas into well-made articles/i }).isVisible());
  ok('Blogger connection CTA is visible', await desktop.getByRole('link', { name: /Connect Blogger/i }).isVisible());
  ok('Article-writing CTA is visible', await desktop.getByRole('link', { name: /Create an article/i }).isVisible());
  ok('Hero contains the animated workflow illustration', await desktop.getByTestId('home-hero-motion').isVisible());
  ok('Hero animation is clearly marked as a preview', await desktop.getByText(/preview only, not live account activity/i).isVisible());
  ok('The preview uses a looping CSS animation', await desktop.locator('.home-motion-window').evaluate(node => getComputedStyle(node).animationName.includes('home-window-float')));
  ok('The CSS/SVG scene includes gentle leaf sway and an image-sheen pass', await desktop.locator('.home-motion-leaf--one').evaluate(node => getComputedStyle(node).animationName.includes('home-leaf-sway')) && await desktop.locator('.home-motion-art').evaluate(node => getComputedStyle(node, '::after').animationName.includes('home-image-sheen')));
  ok('Workspace section is present', await desktop.getByRole('heading', { name: /Everything has its own place/i }).isVisible());
  for (const href of ['/connector', '/jobs', '/content-studio', '/library']) {
    ok(`Workspace navigation includes ${href}`, await desktop.locator(`a[href="${href}"]`).count() > 0);
  }
  ok('Review, article length, and manual-Pinterest boundaries are explicit', await desktop.getByText(/1,000–1,600 words/i).isVisible() && await desktop.getByText(/Pinterest uploads are never automatic/i).isVisible());

  const reduced = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  reduced.on('console', message => message.type() === 'error' && errors.push(`reduced-motion console: ${message.text()}`));
  reduced.on('pageerror', error => errors.push(`reduced-motion page: ${error.message}`));
  await reduced.goto(BASE, { waitUntil: 'networkidle' });
  const duration = await reduced.locator('.home-motion-window').evaluate(node => {
    const value = getComputedStyle(node).animationDuration.split(',')[0].trim();
    return Number.parseFloat(value) * (value.endsWith('ms') ? 0.001 : 1);
  });
  ok('Reduced-motion preference reduces animation to a near-instant', duration <= 0.001);

  for (const width of [390, 320]) {
    const mobile = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    mobile.on('console', message => message.type() === 'error' && errors.push(`mobile ${width} console: ${message.text()}`));
    mobile.on('pageerror', error => errors.push(`mobile ${width} page: ${error.message}`));
    await mobile.goto(BASE, { waitUntil: 'networkidle' });
    const metrics = await mobile.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      stageVisible: Boolean(document.querySelector('[data-testid="home-hero-motion"]')?.getBoundingClientRect().width),
      minHeight: getComputedStyle(document.querySelector('.home-motion-stage')).minHeight,
    }));
    ok(`Mobile ${width}px hero is visible`, metrics.stageVisible);
    ok(`Mobile ${width}px layout has no horizontal overflow (${metrics.overflow}px)`, metrics.overflow <= 1);
    ok(`Mobile ${width}px uses the compact animation stage`, Number.parseFloat(metrics.minHeight) <= 430);
    await mobile.close();
  }

  await browser.close();
  for (const check of checks) console.log(`${check.passed ? 'PASS' : 'FAIL'} ${check.name}`);
  if (errors.length) console.error(`Browser errors:\n${errors.join('\n')}`);
  const failed = checks.filter(check => !check.passed);
  console.log(`\n${checks.length - failed.length}/${checks.length} homepage checks passed`);
  assert.equal(failed.length, 0, 'One or more homepage checks failed');
  assert.equal(errors.length, 0, 'The homepage emitted browser errors');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
