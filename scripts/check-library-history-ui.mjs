// Chromium guest/device-history smoke test against an explicitly local Next server.
// It uses the offline template modes and never calls AI or external publishers.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { chromium } from 'playwright';
import { firebaseIdentity, isolatedFirebase } from './automation-fixtures.mjs';
import { createSession, verifyFirebaseCredential } from '../lib/auth-server.js';
import { getDatabase } from '../lib/automation/db.mjs';
import { defaultJob, readAccount, writeAccount, writeJob } from '../lib/automation/firestore.mjs';
import { archiveDraft, draftInput } from '../lib/automation/drafts.mjs';
import { validateContent } from '../lib/automation/content.mjs';
import { rawArticle } from './article-fixtures.mjs';
import { storeLibraryImage } from '../lib/ai/library-images.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100';
const origin = new URL(BASE).origin;
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) throw new Error('Only an isolated localhost test website may run this check.');
isolatedFirebase();
const db = getDatabase();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [], aiRequests = [], results = [];
let expectedPinTitle = '';
page.on('pageerror', issue => errors.push(issue.message));
page.on('request', request => { if (/\/api\/(?:ai|trend-finder\/ideas)/.test(new URL(request.url()).pathname)) aiRequests.push(request.url()); });
async function test(name, fn) {
  try { const details = await fn(); results.push({ name, pass: true, ...(details ? { details } : {}) }); console.log(`PASS ${name}`); }
  catch (issue) { results.push({ name, pass: false, error: issue.message }); console.error(`FAIL ${name}: ${issue.message}`); }
}
async function seedPublication(uid, values) {
  const job = defaultJob(uid, { kind: 'generated', state: 'draft', topic: 'Synthetic publication fixture', content: { title: 'Synthetic publication fixture' }, ...values });
  await db.runTransaction(async tx => {
    const account = await readAccount(tx, db, uid);
    writeJob(tx, db, account, null, job); writeAccount(tx, db, account);
  });
  return job;
}
try {
  await page.goto(`${BASE}/pin-generator`, { waitUntil: 'networkidle' });
  await test('Guest Pin Generator automatically stores its offline template on this device', async () => {
    await page.getByRole('textbox', { name: 'Enter your topic', exact: true }).fill('Small balcony garden ideas');
    await page.getByRole('button', { name: 'Pin ideas', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'automatically saved to My Library on this device' }).waitFor();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pincraft.library.v1') || '[]'));
    assert.equal(stored.length, 1); assert.equal(stored[0].type, 'pin'); assert.equal(stored[0].topic, 'Small Balcony Garden Ideas');
    expectedPinTitle = stored[0].titles[0]; assert(expectedPinTitle.length > 5);
  });

  await test('Device My Library still shows the Pin after navigating away from its generator', async () => {
    await page.goto(`${BASE}/library`, { waitUntil: 'networkidle' });
    await page.getByTestId('library-pin-card').first().waitFor();
    assert(await page.getByRole('heading', { name: expectedPinTitle, exact: true }).isVisible());
    await page.getByRole('tab', { name: /Saved Articles/ }).click();
    await page.getByText('No saved articles yet', { exact: true }).waitFor();
  });

  await test('Guest Article Writer automatically stores its offline text draft before leaving the page', async () => {
    await page.goto(`${BASE}/article-writer?title=Simple%20Balcony%20Garden%20Ideas%20for%20Small%20Spaces`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Generate Article', exact: true }).click();
    await page.getByRole('button', { name: 'Saved to My Library', exact: true }).waitFor();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pincraft.library.v1') || '[]'));
    assert.equal(stored.length, 2); assert.equal(stored.filter(item => item.type === 'article').length, 1);
    assert(stored.find(item => item.type === 'article').plainText.length > 100);
  });

  await test('Saved offline article survives navigation and is readable in device My Library', async () => {
    await page.goto(`${BASE}/library`, { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: /Saved Articles/ }).click();
    await page.getByTestId('library-article-card').first().waitFor();
    await page.getByRole('heading', { name: /Simple Balcony Garden Ideas for Small Spaces|balcony/i }).first().waitFor();
    assert.equal(await page.getByTestId('library-article-card').count(), 1);
  });

  await test('Device saves survive remounting the Library component and no AI or publisher request is sent', async () => {
    await page.reload({ waitUntil: 'networkidle' });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pincraft.library.v1') || '[]'));
    assert.equal(stored.length, 2); assert.deepEqual(aiRequests, []); assert.deepEqual(errors, []);
  });

  await test('Authenticated Cloud Library opens saved Pin artwork, generates Post Info from its asset ID, and archives it privately', async () => {
    const identity = await firebaseIdentity(`library-history-ui-${randomUUID()}`), verified = await verifyFirebaseCredential(identity.idToken);
    assert.equal(verified.id, identity.id);
    const session = await createSession(verified), imageRequest = randomUUID();
    const bytes = await sharp({ create: { width: 1000, height: 1500, channels: 4, background: '#78a86a' } }).webp({ quality: 82 }).toBuffer();
    const data = { dataUrl: `data:image/webp;base64,${bytes.toString('base64')}`, mimeType: 'image/webp', width: 1000, height: 1500 };
    const asset = await storeLibraryImage(db, verified.id, { requestKey: imageRequest, fingerprint: 'a'.repeat(64), useCase: 'pin', generated: { data } });
    const art = draftInput({ action: 'archive', kind: 'history', requestKey: randomUUID(), content: {
      historyType: 'pin_artwork', title: 'Saved artwork — Balcony garden', topic: 'Balcony garden', category: 'Pinterest artwork', language: 'en',
      imageAssetId: asset.assetId, useCase: 'pin', prompt: 'A vertical balcony garden with a few green plants, warm daylight and no text.', width: 1000, height: 1500,
    } });
    await archiveDraft(db, verified.id, art);
    const publicationFixtures = [];
    for (const values of [
      { kind: 'queued_pin', state: 'queued', topic: 'Queued Pin UI fixture', content: { title: 'Queued Pin UI fixture' }, scheduled_at: new Date(Date.now() + 2 * 3600000) },
      { kind: 'generated', state: 'success', topic: 'Published UI fixture', content: { title: 'Published UI fixture' }, blog_url: 'https://example.com/ui-article', pin_url: 'https://www.pinterest.com/pin/123456789/', completed_at: new Date() },
      { kind: 'generated', state: 'retry', topic: 'Retry UI fixture', content: { title: 'Retry UI fixture' }, error_code: 'fixture_retry', error_message: 'A temporary synthetic issue; no external action was attempted.', retry_at: new Date(Date.now() + 3600000) },
      { kind: 'generated', state: 'attention', topic: 'Interrupted UI fixture', content: { title: 'Interrupted UI fixture' }, error_code: 'fixture_uncertain', error_message: 'The remote result could not be confirmed. Check the destination before trying again; automatic reposting is blocked.', uncertain_step: 'pin' },
      { kind: 'generated', state: 'failed', topic: 'Sanitized error UI fixture', content: { title: 'Sanitized error UI fixture' }, error_code: 'fixture_private_error', error_message: 'A Cloudflare worker internal exception.' },
    ]) publicationFixtures.push(await seedPublication(verified.id, values));
    const authenticatedContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    try {
      await authenticatedContext.addCookies([{ name: 'pincraft.session.v2', value: session, url: origin, httpOnly: true, sameSite: 'Lax' }]);
      const authenticatedPage = await authenticatedContext.newPage(); authenticatedPage.setDefaultTimeout(15000);
      authenticatedPage.on('pageerror', issue => errors.push(issue.message));
      let submitted, archived, artworkResponseHeaders;
      authenticatedPage.on('response', response => { if (response.url() === `${BASE}/api/library/image-assets/${asset.assetId}`) artworkResponseHeaders = response.headers(); });
      authenticatedPage.on('request', request => {
        if (request.url() === `${BASE}/api/library` && request.method() === 'POST') { try { archived = JSON.parse(request.postData() || 'null'); } catch {} }
      });
      await authenticatedPage.route('**/api/ai/pin-post-info', async route => {
        submitted = route.request().postDataJSON();
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          task: 'pin_info', requestKey: submitted.requestKey,
          result: { title: 'A Simple Balcony Garden', description: 'Arrange a few manageable containers, observe the available light and keep the walkway clear while planning a small balcony garden.', hashtags: ['#BalconyGarden', '#SmallSpacePlants', '#ContainerGarden', '#GardenPlanning'] },
          generation: { kind: 'ai', fallbackUsed: false, generatedAt: new Date().toISOString() }, library: { saved: false },
        }) });
      });
      await authenticatedPage.goto(`${BASE}/library`, { waitUntil: 'networkidle' });
      const library = authenticatedPage.getByTestId('cloud-library');
      await library.getByRole('heading', { name: 'Saved artwork — Balcony garden', exact: true }).waitFor();
      const artworkImage = library.locator(`img[src="/api/library/image-assets/${asset.assetId}"]`);
      await artworkImage.waitFor({ state: 'visible' });
      await authenticatedPage.waitForFunction(assetId => { const image = [...document.images].find(item => new URL(item.src).pathname === `/api/library/image-assets/${assetId}`); return Boolean(image?.complete && image.naturalWidth > 0); }, asset.assetId);
      assert.equal(artworkResponseHeaders?.['cache-control'], 'private, no-store');
      const card = title => library.locator('article').filter({ hasText: title });
      const queuedCard = card('Queued Pin UI fixture'), publishedCard = card('Published UI fixture'), retryCard = card('Retry UI fixture');
      const interruptedCard = card('Interrupted UI fixture'), errorCard = card('Sanitized error UI fixture');
      await queuedCard.getByText('Queued', { exact: true }).waitFor();
      await queuedCard.getByText(/Scheduled/).waitFor();
      await publishedCard.getByText('Published · article + Pin', { exact: true }).waitFor();
      assert.equal(await publishedCard.getByRole('link', { name: 'View live article' }).getAttribute('href'), 'https://example.com/ui-article');
      assert.equal(await publishedCard.getByRole('link', { name: 'View live Pin' }).getAttribute('href'), 'https://www.pinterest.com/pin/123456789/');
      await retryCard.getByText('Retry scheduled', { exact: true }).waitFor();
      await retryCard.getByText(/Automatic retry scheduled for/).waitFor();
      await interruptedCard.getByText('Needs review', { exact: true }).waitFor();
      await interruptedCard.getByText(/Pinterest result may have completed/).waitFor();
      await errorCard.getByText('This service is temporarily unavailable. Please try again later.', { exact: true }).waitFor();
      await library.getByRole('button', { name: 'Generate Pinterest Post Info', exact: true }).click();
      await library.getByRole('button', { name: 'Generate Post Info', exact: true }).click();
      await library.getByRole('status').filter({ hasText: 'Post Info is saved privately in My Library' }).waitFor();
      await library.getByRole('heading', { name: 'A Simple Balcony Garden', exact: true }).waitFor();
      assert.equal(submitted.task, 'pin_info'); assert.equal(submitted.imageAssetId, asset.assetId); assert.equal(submitted.consent, true); assert(!Object.hasOwn(submitted, 'imageDataUrl'));
      assert.equal(archived.action, 'archive'); assert.equal(archived.kind, 'history'); assert.equal(archived.requestKey, submitted.requestKey);
      assert.equal(archived.content.historyType, 'pin_info'); assert.equal(archived.content.imageAssetId, asset.assetId);
      assert.equal(await library.getByText('Draft · private history', { exact: true }).count(), 2);
      await test('The authenticated Library API accepts a full article archive above the old 24 KB request cap without queuing it', async () => {
        const article = validateContent(rawArticle, 'Gardening');
        article.plainText += ` ${'Synthetic article storage-size verification. '.repeat(160)}`;
        const content = { ...article, generation: { kind: 'ai', fallbackUsed: false, generatedAt: new Date().toISOString() }, images: [], imageStatus: 'incomplete', imageError: 'Synthetic size-limit fixture.' };
        const payload = { action: 'archive', kind: 'article', requestKey: randomUUID(), content };
        assert(Buffer.byteLength(JSON.stringify(payload)) > 24_000);
        const response = await authenticatedPage.evaluate(async body => {
          const result = await fetch('/api/library', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          return { status: result.status, data: await result.json() };
        }, payload);
        assert.equal(response.status, 200, response.data?.error || 'Article archive request failed.');
        assert.equal(response.data.saved, true);
        const saved = (await db.doc(`pincraft_jobs/${response.data.id}`).get()).data();
        assert.equal(saved.state, 'draft'); assert.equal(saved.content.plainText, content.plainText.trim());
        assert.equal(saved.scheduled_at, null); assert.equal(saved.blog_url, null); assert.equal(saved.pin_url, null);
      });
      assert.deepEqual(errors, []);
    } finally { await authenticatedContext.close(); }
  });
} finally {
  await browser.close(); await db.terminate();
  await mkdir('.shots', { recursive: true });
  await writeFile('.shots/library-history-ui-verification.json', JSON.stringify({ checkedAt: new Date().toISOString(), mode: 'Chromium with a local Next production build, real Firebase Auth/Firestore emulators, synthetic publication fixtures and a synthetic Post Info response. Guest Pin/article templates persisted in browser localStorage; owner-scoped artwork fetch was verified. No AI inference or external publication was called.', results, browserErrors: errors, aiRequests }, null, 2) + '\n');
}
console.log(`\n${results.filter(row => row.pass).length}/${results.length} Library guest/cloud UI checks passed`);
if (results.some(row => !row.pass)) process.exitCode = 1;
