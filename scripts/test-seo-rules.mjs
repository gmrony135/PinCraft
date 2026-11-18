import test from 'node:test';
import assert from 'node:assert/strict';
import {seoFailures} from '../lib/publishing/seo-rules.mjs';
import {publishingReadiness} from '../lib/publishing/composer-state.mjs';

const good = {
  title: 'Smart Small Apartment Entryway Ideas for Tiny Homes', // 51 chars, contains focus keyword
  metaDescription: 'a'.repeat(150),
  focusKeyword: 'small apartment entryway ideas',
  secondaryKeywords: ['tiny home entry', 'shoe storage', 'wall hooks', 'slim console', 'small hallway'],
  slug: 'small-apartment-entryway-ideas',
  html: '<h1>Smart Small Apartment Entryway Ideas for Tiny Homes</h1><p>Use wall hooks and shoe storage. A slim console helps. This tiny home entry stays clear. Small hallway tips follow.</p>',
};

test('a draft that meets every rule has no failures', () => {
  assert.deepEqual(seoFailures(good), []);
});

test('a secondary keyword that appears only in the H1 does not count as article body usage', () => {
  const failures = seoFailures({...good, secondaryKeywords: ['tiny home entry', 'shoe storage', 'wall hooks', 'slim console', 'Tiny Homes'], html: '<h2>Notes</h2><p>Use wall hooks and shoe storage.</p>'});
  assert.equal(failures.length, 1);
  assert.match(failures[0], /Only 2 secondary keywords appear in the article body/);
  assert.match(failures[0], /Not in the body yet: tiny home entry, slim console, Tiny Homes\./);
});

test('each failing clause produces its own specific message', () => {
  assert.match(seoFailures({...good, title: 'Too short H1'})[0], /The H1 is 12 characters; it must be 50–60\./);
  assert.match(seoFailures({...good, metaDescription: 'short'}).join(' '), /The meta description is 5 characters; it must be 140–160\./);
  assert.match(seoFailures({...good, secondaryKeywords: ['one', 'two']}).join(' '), /You have 2 secondary keywords; use 5–10\./);
  assert.match(seoFailures({...good, slug: ''}).join(' '), /Add a clean keyword-focused slug\./);
  assert.match(seoFailures({...good, slug: 'entryway-guide'}).join(' '), /The slug must include at least 2 focus-keyword words/);
});

test('the client readiness panel shows the same specific failure the server would reject with', () => {
  const state = publishingReadiness({
    data: {providers: {blogger: {configured: true}, articleImages: {configured: true}}, profiles: [{id: 'c1', provider: 'blogger', connected: true}], websites: [{id: 'w1', connectionId: 'c1', blogId: '123', url: 'https://example.com/', status: 'verified'}]},
    connectionId: 'c1', websiteId: 'w1', title: good.title, html: '<h1>Title</h1><p>Body text with no keywords.</p>', metaDescription: good.metaDescription,
    focusKeyword: good.focusKeyword, secondaryKeywords: good.secondaryKeywords, slug: good.slug, requireSeo: true, wordCount: 1200,
    relatedArticles: [{id: '1'}, {id: '2'}], relatedLoaded: true, reviewed: true, imageReviewed: true,
  });
  const seo = state.find(item => item.id === 'seo');
  assert.equal(seo.ready, false, 'a draft the server would reject must not be ready on the client');
  assert.equal(seo.message, seoFailures({...good, html: '<h1>Title</h1><p>Body text with no keywords.</p>'}).join(' '));
  assert.match(seo.message, /Only 0 secondary keywords appear/);
});

test('a draft with no SEO requirement does not show an SEO failure', () => {
  const state = publishingReadiness({title: 'Plain title', html: '<p>Body</p>', requireSeo: false});
  assert.equal(state.find(item => item.id === 'seo').ready, true);
});

import {reviewedInput} from '../lib/publishing/content.mjs';
import {countArticleWordsFromHTML} from '../lib/publishing/review-content.mjs';

const longBody = `<h2>Plan</h2><p>${'Entry planning notes for a small home. '.repeat(180)}</p><h2>Storage</h2><p>Use wall hooks, shoe storage, a slim console and a tiny home entry; small hallway space works too.</p><h3>Details</h3><p>More detail.</p><h2>Finish</h2><p>Final tips.</p>`;
const rawFor = (overrides = {}) => {
  const html = longBody;
  return {
    requestId: '6f1d2c3a-4b5e-4c7d-8e9f-0a1b2c3d4e5f', bloggerConnectionId: 'blogger', websiteId: 'blogger_123456789', blogPublishAtUTC: 'now', timezone: 'Asia/Dhaka', reviewed: true, externalSourcesVerified: true,
    article: {title: good.title, html, wordCount: countArticleWordsFromHTML(html), images: [], relatedArticles: [{id: '1001', title: 'Tiny Hall Storage', url: 'https://pincraft-test-blog.blogspot.com/2026/01/tiny-hall-storage.html'}, {id: '1002', title: 'Narrow Console Tables', url: 'https://pincraft-test-blog.blogspot.com/2026/01/narrow-console-tables.html'}], metaDescription: good.metaDescription, focusKeyword: good.focusKeyword, secondaryKeywords: good.secondaryKeywords, slug: good.slug, ...overrides},
  };
};

test('the server parser accepts a draft that meets every SEO rule (control for the failure cases)', () => {
  const direct = seoFailures({title: good.title, html: longBody, metaDescription: good.metaDescription, focusKeyword: good.focusKeyword, secondaryKeywords: good.secondaryKeywords, slug: good.slug});
  assert.deepEqual(direct, [], 'fixture must be genuinely valid before the failure tests mean anything');
});

test('the server 422 names the exact failing SEO clause instead of a generic hint', () => {
  let error = null;
  try { reviewedInput(rawFor({slug: 'entryway-guide'})); } catch (issue) { error = issue; }
  assert.ok(error, 'draft with a weak slug must be rejected');
  assert.equal(error.code, 'invalid_seo');
  assert.equal(error.status, 422);
  assert.match(error.message, /^Publishing blocked by SEO: The slug must include at least 2 focus-keyword words/);
});
