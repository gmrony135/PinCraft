import assert from 'node:assert/strict';
import test from 'node:test';
import { aiArticleFailures } from '../lib/publishing/ai-article-rules.mjs';
import { publishingReadiness } from '../lib/publishing/composer-state.mjs';

const images = [
  { assetId: 'a1b2c3d4-0000-4000-8000-000000000001', role: 'cover', sectionIndex: null, altText: 'Tiny home entry cover' },
  { assetId: 'a1b2c3d4-0000-4000-8000-000000000002', role: 'section', sectionIndex: 0, altText: 'Shoe storage' },
  { assetId: 'a1b2c3d4-0000-4000-8000-000000000003', role: 'section', sectionIndex: 2, altText: 'Wall hooks' },
];
// The owner's draft: saved as 1,420 words; one word ("a") removed in the editor -> 1,419 reviewed.
const source = { wordCount: 1420, imageStatus: 'complete', images };
const ok = { reviewedWordCount: 1419, reviewedImages: images, sourceDraftId: 'draft-745beb49', source };

test('owner case: an edited draft whose reviewed count differs by one word from the stored count is NOT blocked', () => {
  assert.deepEqual(aiArticleFailures(ok), []);
});

test('reviewed word count outside 1,000–1,600 names the word count', () => {
  const f = aiArticleFailures({ ...ok, reviewedWordCount: 1700 });
  assert.equal(f.length, 1);
  assert.match(f[0], /1700 words; it must be 1,000–1,600/);
});

test('source draft with incomplete illustrations names the image status', () => {
  const f = aiArticleFailures({ ...ok, source: { ...source, imageStatus: 'incomplete' } });
  assert.equal(f.length, 1);
  assert.match(f[0], /illustrations are incomplete/);
});

test('reviewed images that differ from the saved source name the mismatch', () => {
  const swapped = [{ ...images[0], assetId: 'a1b2c3d4-0000-4000-8000-000000000009' }, images[1], images[2]];
  const f = aiArticleFailures({ ...ok, reviewedImages: swapped });
  assert.equal(f.length, 1);
  assert.match(f[0], /do not match the saved source draft/);
});

test('fewer than three reviewed images names the count', () => {
  const f = aiArticleFailures({ ...ok, reviewedImages: images.slice(0, 2) });
  assert.equal(f.length, 1);
  assert.match(f[0], /2 saved illustrations; it needs exactly 3/);
});

test('missing source link names the Library step', () => {
  const f = aiArticleFailures({ ...ok, sourceDraftId: '' });
  assert.equal(f.length, 1);
  assert.match(f[0], /Reopen the complete AI draft from your Library/);
});

test('client readiness: owner case shows the illustrations step ready', () => {
  const data = {
    profiles: [{ id: 'c1', provider: 'blogger', connected: true }],
    websites: [{ id: 'blogger_1', connectionId: 'c1', connected: true }],
    providers: { blogger: { configured: true } },
  };
  const base = { data, connectionId: 'c1', websiteId: 'blogger_1', title: 'Test: Small Apartment Entryway Ideas for Tiny Homes', html: '<p>x</p>', imageReviewed: true, reviewed: true, requireIllustrations: true, imagesComplete: true, aiArticle: source, reviewedImages: images, sourceDraftId: 'draft-745beb49' };
  const item = (list, id) => list.find(x => x.id === id);
  const ready = publishingReadiness({ ...base, wordCount: 1419 });
  assert.equal(item(ready, 'illustrations').ready, true);
  const blocked = publishingReadiness({ ...base, wordCount: 1700 });
  assert.equal(item(blocked, 'illustrations').ready, false);
  assert.match(item(blocked, 'illustrations').message, /1700 words/);
});
