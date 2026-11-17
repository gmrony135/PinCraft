// Isolated Firestore-emulator coverage for private creation history and publication states.
// Uses only demo Firebase Auth/Firestore and synthetic content; no AI or publisher is called.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { getDatabase } from '../lib/automation/db.mjs';
import { accountRef, data, defaultJob, jobRef, readAccount, writeAccount, writeJob } from '../lib/automation/firestore.mjs';
import { listLibrary } from '../lib/automation/repository.mjs';
import { archiveDraft, draftInput, saveDraft } from '../lib/automation/drafts.mjs';
import { storeLibraryImage, readLibraryImage } from '../lib/ai/library-images.mjs';
import { storeArticleImage } from '../lib/publishing/article-images.mjs';
import { validateContent } from '../lib/automation/content.mjs';
import { rawArticle } from './article-fixtures.mjs';
import { getLibrary, saveToLibrary } from '../lib/library.js';
import { partitionLibrary } from '../lib/library-content.js';
import { firebaseIdentity, isolatedFirebase, resetFirebase } from './automation-fixtures.mjs';

isolatedFirebase();
const db = getDatabase(), results = [];
const aiGeneration = { kind: 'ai', fallbackUsed: false, generatedAt: new Date().toISOString() };
const check = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, pass: false, error: error.message }); console.error(`FAIL ${name}: ${error.stack || error.message}`); }
};
const webp = async (width, height) => {
  const bytes = await sharp({ create: { width, height, channels: 4, background: '#78a86a' } }).webp({ quality: 82 }).toBuffer();
  return { dataUrl: `data:image/webp;base64,${bytes.toString('base64')}`, mimeType: 'image/webp', width, height };
};
const seedPublication = async (uid, values) => {
  const job = defaultJob(uid, { kind: 'generated', state: 'draft', topic: 'Local history fixture', content: { title: 'Local publication fixture' }, ...values });
  await db.runTransaction(async tx => {
    const account = await readAccount(tx, db, uid);
    writeJob(tx, db, account, null, job); writeAccount(tx, db, account);
  });
  return job;
};

try {
  await check('Guest-generated Pin and article records persist across page navigation in device Library storage', async () => {
    const previousWindow = globalThis.window, storage = new Map(), createWindow = () => ({ localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) }, dispatchEvent: () => true });
    try {
      globalThis.window = createWindow();
      const pin = { type: 'pin', id: `pin_${randomUUID()}`, topic: 'Small balcony gardens', title: 'A small balcony garden', titles: ['A small balcony garden', 'Choose compact pots'], description: 'A practical offline Pin template for a small balcony garden.', hashtags: ['#GardenIdeas', '#SmallSpace'], keywords: ['balcony garden'], imageIdea: { prompt: 'A calm compact balcony with a few containers.' } };
      const article = { type: 'article', id: `art_${randomUUID()}`, title: 'A practical offline balcony article', intro: 'This device-only article remains a private draft after leaving its creation page.', plainText: 'A private article template stored in this browser.', sections: [{ heading: 'A useful first step', paragraphs: ['Measure the balcony and leave a clear walkway.'] }], imageStatus: 'incomplete' };
      saveToLibrary(pin); saveToLibrary(article); saveToLibrary(pin);
      assert.equal(getLibrary().length, 2);
      globalThis.window = createWindow(); // Simulate leaving the generator and mounting My Library.
      const visible = partitionLibrary(getLibrary());
      assert.equal(visible.pins.length, 1); assert.equal(visible.pins[0].titles.length, 2);
      assert.equal(visible.articles.length, 1); assert.equal(visible.articles[0].imageStatus, 'incomplete');
    } finally { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; }
  });
  await resetFirebase();
  const primary = await firebaseIdentity('library-history-primary'), other = await firebaseIdentity('library-history-other');
  const owner = primary.id, stranger = other.id;
  const pin = draftInput({ action: 'archive', kind: 'pin', requestKey: randomUUID(), content: {
    id: `pin_${randomUUID()}`, topic: 'Small balcony gardens', category: 'Gardening',
    titles: ['Plan a Small Balcony Garden', 'Choose Containers for a Balcony', 'Arrange a Compact Garden', 'Observe Balcony Light', 'Build a Garden Routine'],
    description: 'A practical guide to measuring the balcony, choosing manageable containers and planning a useful garden.',
    hashtags: ['#GardenIdeas', '#BalconyPlants', '#SmallSpace', '#ContainerGarden'], keywords: ['balcony garden', 'small containers', 'plant layout'],
    imageIdea: { headline: 'A small garden plan', palette: 'soft green', layout: 'vertical 2:3', style: 'editorial photo', prompt: 'A compact balcony garden with open space and simple containers.' }, generation: aiGeneration,
  } });
  let pinId;
  await check('Automatically archived Pin output remains a private, unqueued draft and can be safely updated', async () => {
    pinId = await archiveDraft(db, owner, pin);
    const row = await jobRef(db, pinId).get(), account = data(await accountRef(db, owner).get());
    assert.equal(row.data().state, 'draft'); assert.equal(row.data().kind, 'pin_draft');
    assert.equal(row.data().scheduled_at, null); assert.equal(row.data().pin_url, null); assert.equal(row.data().blog_url, null);
    assert.equal(account.queue_count, 0); assert.equal(account.total_success, 0);
    assert.equal(await archiveDraft(db, owner, pin), pinId);
    const updated = draftInput({ action: 'archive', kind: 'pin', requestKey: pin.requestKey, content: { ...pin.content, description: 'Updated private Pin draft history.' } });
    assert.equal(await archiveDraft(db, owner, updated), pinId);
    assert.equal((await jobRef(db, pinId).get()).data().content.description, 'Updated private Pin draft history.');
  });

  const articleTemplate = validateContent(rawArticle, 'Gardening');
  const incompleteArticle = draftInput({ action: 'archive', kind: 'article', requestKey: randomUUID(), content: {
    ...articleTemplate, generation: aiGeneration, images: [], imageStatus: 'incomplete', imageError: 'One image has not been generated yet.',
  } });
  let incompleteId;
  await check('Incomplete generated article and its full text persist as a private draft', async () => {
    incompleteId = await archiveDraft(db, owner, incompleteArticle);
    const row = (await jobRef(db, incompleteId).get()).data();
    assert.equal(row.kind, 'article_draft'); assert.equal(row.state, 'draft');
    assert.equal(row.content.imageStatus, 'incomplete'); assert.equal(row.content.images.length, 0);
    assert.equal(row.content.plainText, articleTemplate.plainText); assert.equal(row.content.sections.length, 4);
  });

  await check('Recurring-automation generated drafts keep their source metadata but never enter the publishing queue', async () => {
    const slotId = '20261113T120000000Z';
    const draft = draftInput({ action: 'save', kind: 'article', requestKey: randomUUID(), content: { ...articleTemplate, generation: aiGeneration, imageStatus: 'pending', images: [] } });
    const id = await saveDraft(db, owner, draft, { automationSlotId: slotId });
    const row = (await jobRef(db, id).get()).data(), account = data(await accountRef(db, owner).get());
    assert.equal(row.state, 'draft'); assert.equal(row.topic_metadata.source, 'recurring_automation'); assert.equal(row.topic_metadata.slotId, slotId);
    assert.equal(row.scheduled_at, null); assert.equal(row.pin_url, null); assert.equal(row.blog_url, null);
    assert.equal(account.queue_count, 0); assert.equal(account.total_success, 0);
  });

  let pinImageId, featuredImageId;
  await check('Private Pin and featured artwork bytes are retained with owner-scoped retrieval', async () => {
    const pinRequest = randomUUID(), featuredRequest = randomUUID();
    const pinImage = await storeLibraryImage(db, owner, { requestKey: pinRequest, fingerprint: 'a'.repeat(64), useCase: 'pin', generated: { data: await webp(1000, 1500) } });
    const featuredImage = await storeLibraryImage(db, owner, { requestKey: featuredRequest, fingerprint: 'b'.repeat(64), useCase: 'featured', generated: { data: await webp(1200, 630) } });
    pinImageId = pinImage.assetId; featuredImageId = featuredImage.assetId;
    assert.equal((await readLibraryImage(db, pinImageId, { uid: owner }))?.useCase, 'pin');
    assert.equal(await readLibraryImage(db, pinImageId, { uid: stranger }), null);
    assert.equal((await readLibraryImage(db, featuredImageId, { uid: owner }))?.width, 1200);
  });

  let completeId;
  await check('Complete illustrated article is archived only with three owned, role-matched image assets', async () => {
    const specs = [['article-cover', 'cover', null], ['article-section', 'section', 0], ['article-section', 'section', 2]], images = [];
    for (let i = 0; i < specs.length; i++) {
      const [useCase, role, sectionIndex] = specs[i], requestKey = randomUUID();
      const asset = await storeArticleImage(db, owner, { requestKey, fingerprint: (String(i + 1)).repeat(64), useCase, generated: { data: await webp(1200, 630) } });
      images.push({ assetId: asset.assetId, role, sectionIndex, altText: role === 'cover' ? 'A compact balcony garden with clear walking space.' : `A balcony gardening scene for article section ${i}.` });
    }
    const draft = draftInput({ action: 'archive', kind: 'article', requestKey: randomUUID(), content: { ...articleTemplate, generation: aiGeneration, images, imageStatus: 'complete', imageError: '' } });
    completeId = await archiveDraft(db, owner, draft);
    const row = (await jobRef(db, completeId).get()).data();
    assert.equal(row.content.imageStatus, 'complete'); assert.equal(row.content.images.length, 3);
    const stolen = draftInput({ action: 'archive', kind: 'article', requestKey: randomUUID(), content: { ...articleTemplate, generation: aiGeneration, images: draft.content.images.map((image, index) => ({ ...image, assetId: ['f', 'e', 'd'][index].repeat(64) })), imageStatus: 'complete' } });
    await assert.rejects(() => archiveDraft(db, stranger, stolen));
  });

  let artworkHistoryId;
  await check('Artwork and matching Post Info both appear in private Pin history', async () => {
    const artRequest = randomUUID(), artwork = draftInput({ action: 'archive', kind: 'history', requestKey: artRequest, content: {
      historyType: 'pin_artwork', title: 'Pin artwork — Balcony garden', topic: 'Balcony garden', category: 'Pinterest artwork', language: 'en',
      imageAssetId: pinImageId, useCase: 'pin', prompt: 'An original vertical balcony garden illustration with no text.', width: 1000, height: 1500, generation: aiGeneration,
    } });
    artworkHistoryId = await archiveDraft(db, owner, artwork);
    const postInfo = draftInput({ action: 'archive', kind: 'history', requestKey: randomUUID(), content: {
      historyType: 'pin_info', title: 'A Simple Balcony Garden Plan', topic: 'Balcony garden', category: 'Pinterest Post Info', language: 'en',
      imageAssetId: pinImageId, useCase: 'pin', prompt: 'An original vertical balcony garden illustration with no text.',
      description: 'Measure the open space, observe the light and start with a few manageable containers that suit your daily routine.',
      hashtags: ['#BalconyGarden', '#SmallSpaceGarden', '#ContainerPlants', '#GardenPlanning'], generation: aiGeneration,
    } });
    const postInfoId = await archiveDraft(db, owner, postInfo);
    assert.equal((await jobRef(db, artworkHistoryId).get()).data().content.imageAssetId, pinImageId);
    assert.equal((await jobRef(db, postInfoId).get()).data().content.imageAssetId, pinImageId);
    assert.equal((await jobRef(db, postInfoId).get()).data().state, 'draft');
    await assert.rejects(() => archiveDraft(db, stranger, artwork));
  });

  await check('Featured artwork, keywords, content plan, editorial review and Trend Finder ideas validate and archive', async () => {
    const records = [];
    const history = (historyType, title, result, extra = {}) => draftInput({ action: 'archive', kind: 'history', requestKey: randomUUID(), content: { historyType, title, topic: title, category: historyType, language: 'en', result, ...extra } });
    records.push(history('featured_image', 'Featured image — Balcony garden', null, { imageAssetId: featuredImageId, useCase: 'featured', prompt: 'A realistic wide balcony garden scene with open walking space.', width: 1200, height: 630 }));
    records.push(history('keywords', 'SEO keywords for Balcony gardens', { groups: [1, 2, 3].map(i => ({ name: `Group ${i}`, intent: 'informational', keywords: [`balcony garden ${i}`, `small garden ${i}`, `container planting ${i}`] })), hashtags: Array.from({ length: 10 }, (_, i) => `#GardenIdea${i + 1}`), note: 'AI suggestions; no search volume was measured.' }));
    records.push(history('plan', '7-day content plan for Balcony gardens', { days: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, topic: `Balcony garden topic ${i + 1}`, pinTitle: `Practical balcony garden tip ${i + 1}`, articleTitle: `How to plan a balcony garden step ${i + 1}`, keywords: ['balcony garden', 'small-space plants'], hashtags: ['#GardenIdea', '#BalconyPlant'] })), note: 'Draft plan only.' }));
    records.push(history('quality', 'Editorial review: Balcony gardens', { score: 82, summary: 'A useful draft with a few areas to review.', checks: [1, 2, 3, 4].map(i => ({ label: `Check ${i}`, status: i === 4 ? 'review' : 'pass', detail: 'Check this point against a reliable source before use.' })), improvedTitle: 'A Practical Balcony Garden Plan', improvedDescription: 'Plan a manageable balcony garden.', hashtags: Array.from({ length: 10 }, (_, i) => `#ReviewGarden${i + 1}`), note: 'Editorial review only.' }));
    const strategy = { format: 'Step-by-step pin', hook: 'Begin with one useful change', visualDirection: 'Show a calm compact balcony with containers', coreTakeaway: 'A modest plan can fit a small space', callToAction: 'Save the idea for later' };
    records.push(history('trend_ideas', 'Balcony garden Pin ideas', { trend: 'Balcony gardens', region: 'United States', language: 'en', ideas: [1, 2, 3].map(i => ({ pinTitle: `Balcony garden concept ${i}`, concept: 'A practical visual guide that helps a beginner plan a compact balcony garden step by step.', likelyAudience: 'People looking for practical ideas for a compact home balcony.', contentStrategy: strategy, keywordSuggestions: ['balcony garden', 'small garden', `garden plan ${i}`] })), note: 'AI brainstorming only; no Pinterest demand was measured.' }, { region: 'United States', trendId: 'c'.repeat(64) }));
    const ids = [];
    for (const record of records) ids.push(await archiveDraft(db, owner, record));
    assert.equal(new Set(ids).size, records.length);
    assert(records.every(record => record.kind === 'history_draft'));
  });

  await check('History listing is private to the verified Auth UID and paginates without dropping records', async () => {
    const extraIds = [];
    for (let i = 0; i < 22; i++) {
      const record = draftInput({ action: 'archive', kind: 'history', requestKey: randomUUID(), content: {
        historyType: 'keywords', title: `Pagination fixture ${i}`, topic: `Pagination fixture ${i}`, category: 'Test history', language: 'en',
        result: { groups: [1, 2, 3].map(n => ({ name: `Cluster ${n}`, intent: 'informational', keywords: [`fixture ${n} one`, `fixture ${n} two`, `fixture ${n} three`] })), hashtags: Array.from({ length: 10 }, (_, n) => `#Page${i}Tag${n + 1}`), note: 'Synthetic local pagination fixture.' },
      } });
      extraIds.push(await archiveDraft(db, owner, record));
    }
    const first = await listLibrary(db, owner), second = await listLibrary(db, owner, first.nextCursor), foreign = await listLibrary(db, stranger);
    assert.equal(first.items.length, 20); assert(first.nextCursor); assert(second.items.length > 0); assert.equal(second.nextCursor, null);
    assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, first.items.length + second.items.length);
    assert.equal(foreign.items.length, 0);
    assert([...first.items, ...second.items].some(item => item.id === pinId));
    assert([...first.items, ...second.items].some(item => item.id === incompleteId));
    assert([...first.items, ...second.items].some(item => item.id === completeId));
    assert([...first.items, ...second.items].some(item => item.id === artworkHistoryId));
    assert.equal((await readLibraryImage(db, pinImageId, { uid: stranger })), null);
    assert(extraIds.length === 22);
  });

  await check('Publication history lists queued, published, and error states separately from private drafts', async () => {
    const queued = await seedPublication(owner, { kind: 'queued_pin', state: 'queued', topic: 'Queued pin', content: { title: 'Queued pin', description: 'A queued synthetic test item.' } });
    const published = await seedPublication(owner, { state: 'success', topic: 'Published test', content: { title: 'Published test' }, blog_url: 'https://example.com/test-article', pin_url: 'https://www.pinterest.com/pin/123456789/' });
    const failed = await seedPublication(owner, { state: 'failed', topic: 'Failed test', content: { title: 'Failed test' }, error_code: 'fixture_error', error_message: 'Synthetic isolated publication failure.' });
    const items = (await listLibrary(db, owner)).items;
    assert.equal(items.find(item => item.id === queued.id)?.state, 'queued');
    assert.equal(items.find(item => item.id === published.id)?.pin_url, 'https://www.pinterest.com/pin/123456789/');
    assert.equal(items.find(item => item.id === published.id)?.blog_url, 'https://example.com/test-article');
    assert.equal(items.find(item => item.id === failed.id)?.state, 'failed');
    assert.equal(items.find(item => item.id === failed.id)?.error_message, 'Synthetic isolated publication failure.');
    assert.equal((await jobRef(db, pinId).get()).data().state, 'draft');
  });

  await check('Auto-archive refuses to overwrite an already published history record', async () => {
    await jobRef(db, artworkHistoryId).update({ state: 'success', pin_id: 'synthetic-only', pin_url: 'https://www.pinterest.com/pin/123456789/' });
    const row = await jobRef(db, artworkHistoryId).get();
    const requestKey = row.data().request_key;
    const updated = draftInput({ action: 'archive', kind: 'history', requestKey, content: {
      historyType: 'pin_artwork', title: 'Changed published artwork', topic: 'Changed', category: 'Pinterest artwork', language: 'en',
      imageAssetId: pinImageId, useCase: 'pin', prompt: 'An updated prompt for the same saved art.', width: 1000, height: 1500,
    } });
    await assert.rejects(() => archiveDraft(db, owner, updated), error => error.code === 'history_locked' && error.status === 409);
    assert.equal((await jobRef(db, artworkHistoryId).get()).data().content.title, 'Pin artwork — Balcony garden');
  });
} finally {
  await db.terminate();
}

await import('node:fs/promises').then(({ mkdir, writeFile }) => mkdir(new URL('../.shots/', import.meta.url), { recursive: true }).then(() => writeFile(new URL('../.shots/library-history-verification.json', import.meta.url), JSON.stringify({ date: new Date().toISOString().slice(0, 10), mode: 'Synthetic content, real local Firebase Auth/Firestore emulators and image bytes. No AI provider, Pinterest, Blogger, or publication service was called.', results }, null, 2))));
console.log(`\n${results.filter(result => result.pass).length}/${results.length} library history checks passed`);
if (results.some(result => !result.pass)) process.exitCode = 1;
