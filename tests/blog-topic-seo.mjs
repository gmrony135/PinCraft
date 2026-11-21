// Pure checks (no Firebase, no network): ad/date headline rejection, cluster rule,
// SEO-field repair gate, and top-candidate fall-through. Run with --conditions=react-server.
import assert from 'node:assert/strict';
import {
  parseCategoryNews,
  parseCategorySearchTrends,
  rankCategorySignals,
  selectCategoryTrend,
  guideTopicRejection,
  trendGuideTitle,
  topicTokens,
} from '../lib/publishing/category-trends.mjs';
import { validateAutomaticArticle, seoFieldFailures } from '../lib/publishing/automation-editorial.mjs';
import { textTask } from '../lib/ai/tasks.mjs';
import { automaticArticle } from '../scripts/blog-automation-fixtures.mjs';

const NOW = Date.UTC(2026, 10, 21, 10, 0, 0);
const SETTINGS = { trendRegion: 'US', categoryIds: ['home-decor'], topic: '', language: 'en' };
const FAILING_HEADLINE = 'FRIDAY, NOVEMBER 20, 2026 Ad - Saxony House Furniture';
const GENUINE_HEADLINE = 'Small Living Room Storage Ideas That Make a Space Feel Bigger';

let passed = 0;
const queue = [];
const check = (name, fn) => queue.push(async () => { await fn(); passed++; console.log(`ok - ${name}`); });

let linkCounter = 0;
const rss = items => `<rss><channel>${items.map(({ title, publisher, ageHours = 2 }) => `<item><title>${title} - ${publisher}</title><pubDate>${new Date(NOW - ageHours * 3600000).toUTCString()}</pubDate><link>https://news.google.com/rss/articles/blog-topic-fixture-${++linkCounter}</link><source url="https://example.com/">${publisher}</source></item>`).join('')}</channel></rss>`;
const EMPTY_TRENDS = '<rss><channel></channel></rss>';

check('(a) the exact failing ad headline is rejected by parseCategoryNews, with a logged reason', () => {
  const rejected = [];
  const items = parseCategoryNews(rss([{ title: FAILING_HEADLINE, publisher: 'Tribune-Review' }]), SETTINGS, NOW, rejected);
  assert.equal(items.length, 0);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].title, FAILING_HEADLINE);
  assert.match(rejected[0].reason, /advertisement marker "Ad"/);
});

check('(a) the failing headline is also excluded from the search-trend news items', () => {
  const xml = `<rss xmlns:ht="https://trends.google.com/trending/rss"><channel><item><title>living room storage</title><pubDate>${new Date(NOW - 3600000).toUTCString()}</pubDate><ht:news_item><ht:news_item_title>Sponsored: Small living room storage ideas</ht:news_item_title><ht:news_item_url>https://example.com/ad-fixture</ht:news_item_url><ht:news_item_source>Example Publisher</ht:news_item_source></ht:news_item></item></channel></rss>`;
  const rejected = [];
  assert.deepEqual(parseCategorySearchTrends(xml, SETTINGS, NOW, rejected), []);
  assert.match(rejected[0].reason, /advertisement marker "Sponsored"/);
});

check('(a) a cluster that shares no category term is not a candidate, and the rejection is logged', () => {
  const news = [
    { title: 'Saxony House weekly report', publisher: 'Alpha Daily', url: 'https://example.com/a', publishedAt: new Date(NOW - 3600000).toISOString(), tokens: topicTokens('Saxony House weekly report'), relevance: 1 },
    { title: 'Saxony House weekly update', publisher: 'Beta Post', url: 'https://example.com/b', publishedAt: new Date(NOW - 3600000).toISOString(), tokens: topicTokens('Saxony House weekly update'), relevance: 1 },
  ];
  const rejected = [];
  assert.equal(rankCategorySignals({ news, settings: SETTINGS, now: NOW, rejected }).length, 0);
  assert.match(rejected[0].reason, /shares no category term/);
});

check('control: the same two-publisher cluster on a real category term still ranks', () => {
  const news = [
    { title: 'Living room storage ideas for small homes', publisher: 'Alpha Daily', url: 'https://example.com/a', publishedAt: new Date(NOW - 3600000).toISOString(), tokens: topicTokens('Living room storage ideas for small homes'), relevance: 1 },
    { title: 'Living room storage ideas for compact homes', publisher: 'Beta Post', url: 'https://example.com/b', publishedAt: new Date(NOW - 3600000).toISOString(), tokens: topicTokens('Living room storage ideas for compact homes'), relevance: 1 },
  ];
  assert.ok(rankCategorySignals({ news, settings: SETTINGS, now: NOW }).length >= 1);
});

check('(b) a genuine guide headline still passes the filter and the parser', () => {
  assert.equal(guideTopicRejection(GENUINE_HEADLINE), null);
  const rejected = [];
  const items = parseCategoryNews(rss([{ title: GENUINE_HEADLINE, publisher: 'Home Journal' }]), SETTINGS, NOW, rejected);
  assert.equal(items.length, 1);
  assert.equal(rejected.length, 0);
});

check('ad markers and date prefixes are matched as standalone tokens, not inside other words', () => {
  assert.match(guideTopicRejection('Nov 20, 2026 — Best Sofa Deals'), /date or weekday prefix/);
  assert.match(guideTopicRejection('Sponsored: Modern Bedroom Furniture'), /"Sponsored"/);
  assert.match(guideTopicRejection('Promoted content: Balcony garden tips'), /"Promoted"/);
  assert.equal(guideTopicRejection('Ad-free living room ideas'), null, 'hyphenated word is not an ad marker');
  assert.equal(guideTopicRejection('May 5 ways to style a bedroom'), null, 'a month word without a year is not a date prefix');
});

check('safety net: trendGuideTitle strips a leading date and Ad marker, keeps a genuine title intact', () => {
  assert.equal(trendGuideTitle({ topic: FAILING_HEADLINE }, 'en'), 'Practical guide: Saxony House Furniture');
  assert.equal(trendGuideTitle({ topic: GENUINE_HEADLINE }, 'en'), 'Practical guide: ' + GENUINE_HEADLINE);
});

check('(d) with an ad headline at the top of the feed, the next valid guide topic is selected', async () => {
  const feed = rss([
    { title: FAILING_HEADLINE, publisher: 'Tribune-Review' },
    { title: GENUINE_HEADLINE, publisher: 'Home Journal' },
    { title: 'Living Room Storage Ideas for Small Apartments', publisher: 'Design Weekly' },
  ]);
  const send = async url => (String(url).includes('news.google.com') ? feed : EMPTY_TRENDS);
  const rejections = [];
  const selected = await selectCategoryTrend(SETTINGS, [], { send, now: NOW, rejections });
  assert.notEqual(selected.topic, FAILING_HEADLINE);
  assert.doesNotMatch(selected.topic, /Ad -|FRIDAY/);
  assert.match(selected.topic, /Living Room Storage/);
  assert.ok(rejections.some(r => r.title === FAILING_HEADLINE && /advertisement marker/.test(r.reason)), 'ad rejection logged');
});

check('(d) when only ad headlines exist, the slot waits with category_trends_unavailable and carries the logged rejections', async () => {
  const feed = rss([{ title: FAILING_HEADLINE, publisher: 'Tribune-Review' }]);
  const send = async url => (String(url).includes('news.google.com') ? feed : EMPTY_TRENDS);
  await assert.rejects(selectCategoryTrend(SETTINGS, [], { send, now: NOW }), error => {
    assert.equal(error.code, 'category_trends_unavailable');
    assert.equal(error.rejections.length, 1);
    return true;
  });
});

const ASHLEY_EVENT = "Tennessee's largest Ashley Furniture store opens near West Town Mall";
const EVENT_HEADLINES = [
  ASHLEY_EVENT,
  'Practical guide: ' + ASHLEY_EVENT,
  "Bob's Discount Furniture shown for third Jacksonville location",
  'Detroit Furniture Announces Availability of $2,999 Whole House Furniture Package in Metro Detroit',
  'CB2 rolls out new retail concept in Flatiron showroom',
  'West Town Knoxville Wholesale Furniture makes way for largest Ashley Furniture in Tennessee',
  'Retired couple opens business selling clothing, furniture, antiques and more',
  'Mortgage lender Rate launches DTC home furnishings brand',
  'Blue Mountain Seniors Tour Ashley Furniture in Ripley',
];
const HOME_DECOR_GUIDES = [
  'Living Room Storage Ideas for Small Apartments',
  'Renter-Friendly Lighting Ideas for a Calm Bedroom',
  'Entryway Organization Tips for Small Homes',
  'Styling Open Shelves: A Beginner Guide',
  'How to Choose a Rug for Your Living Room',
];

check('(e) the Ashley Furniture store-opening headline is rejected by the filter, with a reason naming the event wording', () => {
  assert.match(guideTopicRejection(ASHLEY_EVENT), /news-event wording "opens"/);
  assert.match(guideTopicRejection('Practical guide: ' + ASHLEY_EVENT), /news-event wording "opens"/);
});

check('(e) every dated store, launch, announcement or local-news headline in the set is rejected', () => {
  for (const title of EVENT_HEADLINES) assert.notEqual(guideTopicRejection(title), null, `should be rejected: ${title}`);
});

check('(f) at least 3 genuine Home Decor guide topics pass the filter (here: 5)', () => {
  const passing = HOME_DECOR_GUIDES.filter(title => guideTopicRejection(title) === null);
  assert.ok(passing.length >= 3, `only ${passing.length} passed`);
  assert.equal(passing.length, HOME_DECOR_GUIDES.length);
});

check('(f) the Ashley event is rejected by the feed parser; the guide next to it is kept', () => {
  const rejected = [];
  const items = parseCategoryNews(rss([{ title: ASHLEY_EVENT, publisher: 'Knox News' }, { title: HOME_DECOR_GUIDES[0], publisher: 'Home Journal' }]), SETTINGS, NOW, rejected);
  assert.deepEqual(items.map(i => i.title), [HOME_DECOR_GUIDES[0]]);
  assert.match(rejected[0].reason, /news-event wording/);
});

check('(e) a feed with only the Ashley event selects nothing and the slot waits', async () => {
  const feed = rss([{ title: ASHLEY_EVENT, publisher: 'Knox News' }, { title: 'Furniture store opens new showroom', publisher: 'Local Post' }]);
  const send = async url => (String(url).includes('news.google.com') ? feed : EMPTY_TRENDS);
  await assert.rejects(selectCategoryTrend(SETTINGS, [], { send, now: NOW }), error => error.code === 'category_trends_unavailable');
});

check('(e) with the Ashley event ranked first by two publishers, the guide topic is still the one selected', async () => {
  const feed = rss([
    { title: ASHLEY_EVENT, publisher: 'Knox News' },
    { title: ASHLEY_EVENT.replace('tennessee', 'Tennessee'), publisher: 'Tribune Local' },
    { title: HOME_DECOR_GUIDES[0], publisher: 'Home Journal' },
    { title: HOME_DECOR_GUIDES[0].replace('Small Apartments', 'Compact Homes'), publisher: 'Design Weekly' },
  ]);
  const send = async url => (String(url).includes('news.google.com') ? feed : EMPTY_TRENDS);
  const selected = await selectCategoryTrend(SETTINGS, [], { send, now: NOW });
  assert.doesNotMatch(selected.topic, /Ashley|store|opens/);
  assert.match(selected.topic, /Living Room Storage Ideas/);
});

check('(e) the topic worker path (chooseTopic) never selects a rejected headline', async () => {
  const { chooseTopic } = await import('../lib/automation/trends.mjs');
  const xml = `<rss><channel>`
    + [ASHLEY_EVENT, HOME_DECOR_GUIDES[0]].map(title => `<item><title>${title}</title><pubDate>${new Date(Date.now() - 3600000).toUTCString()}</pubDate></item>`).join('')
    + `</channel></rss>`;
  const emptyQuery = { where() { return this; }, orderBy() { return this; }, limit() { return this; }, async get() { return { docs: [] }; } };
  const database = { collection: () => emptyQuery };
  const send = async () => xml;
  const account = { topic_source: 'google_trends', trend_region: 'US', user_id: 'test-user' };
  const selected = await chooseTopic(account, { id: 'job-1', topic: '' }, database, send);
  assert.equal(selected.topic, HOME_DECOR_GUIDES[0]);
});

check('(g) ordinary news with no guide cue is rejected by the feed parser, with a logged reason', () => {
  const rejected = [];
  const items = parseCategoryNews(rss([{ title: 'Windsor girl with genetic disability gifted new bedroom', publisher: 'WIVT' }, { title: 'Warm, dry fall could leave some garden plants stressed', publisher: 'WWMT' }]), { ...SETTINGS, categoryIds: ['home-decor', 'gardening-outdoor'] }, NOW, rejected);
  assert.equal(items.length, 0);
  assert.equal(rejected.length, 2);
  assert.match(rejected[0].reason, /no guide cue/);
});

check('(g) a news-style "ahead of" or "shares" tip story is rejected as an event, not selected as a guide', () => {
  assert.notEqual(guideTopicRejection('Red Cross shares cooking safety tips ahead of Thanksgiving'), null);
  assert.match(guideTopicRejection('Red Cross shares cooking safety tips ahead of Thanksgiving'), /news-event wording/);
});

check('(g) a genuine how-to with a cue still passes the parser (the live Thanksgiving how-to)', () => {
  const rejected = [];
  const title = 'Thanksgiving food safety: How to avoid food poisoning while preparing your holiday meal';
  const items = parseCategoryNews(rss([{ title, publisher: '13WMAZ' }]), { ...SETTINGS, categoryIds: ['food-recipes'] }, NOW, rejected);
  assert.equal(items.length, 1);
  assert.equal(rejected.length, 0);
});

// (c) SEO-field repair gate. Built through the real generator normalizer, as the existing suite does.
const sourceTitle = 'Practical guide: Balcony garden container planting for compact homes';
const evidence = { topicTokens: topicTokens('balcony garden container planting for compact homes'), categoryIds: ['gardening-outdoor'] };
const gate = { requireImages: false, requireLinks: false };
const good = textTask({ task: 'article', title: sourceTitle, topic: 'Balcony garden container planting for compact homes', language: 'en' }).validate(automaticArticle(sourceTitle));

check('(c) a valid normalized article has no SEO failures and passes the gate', () => {
  assert.deepEqual(seoFieldFailures(good), []);
  assert.ok(validateAutomaticArticle(good, sourceTitle, evidence, gate).title);
});

check('(c) an article with unused secondary keywords fails only the SEO group, with an exact message', () => {
  const bad = { ...good, secondaryKeywords: ['vertical herb wall', 'drip tray', 'patio shade cloth', 'railing planter', 'window box'] };
  const failures = seoFieldFailures(bad);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /at least 3 secondaryKeywords must appear word-for-word in the article body; only 0 did/);
  assert.throws(() => validateAutomaticArticle(bad, sourceTitle, evidence, gate), { code: 'automation_quality_gate' });
  assert.doesNotThrow(() => validateAutomaticArticle(bad, sourceTitle, evidence, { ...gate, skipSeo: true }));
});

check('(c) a short metaDescription and an invalid slug are reported exactly and gate the article', () => {
  const short = { ...good, metaDescription: 'Too short to be useful.' };
  assert.ok(seoFieldFailures(short).some(m => /metaDescription must be 140–160 characters/.test(m)));
  const slug = { ...good, slug: 'Balcony_Garden_Plan' };
  assert.ok(seoFieldFailures(slug).some(m => /slug must use only lowercase/.test(m)));
  assert.throws(() => validateAutomaticArticle(short, sourceTitle, evidence, gate), { code: 'automation_quality_gate' });
});

check('(c) a repaired article (SEO fields fixed) passes the same gate', () => {
  const repaired = { ...good, secondaryKeywords: ['balcony containers', 'garden care routine', 'building rules', 'small balcony', 'walking route'] };
  assert.deepEqual(seoFieldFailures(repaired), []);
  assert.doesNotThrow(() => validateAutomaticArticle(repaired, sourceTitle, evidence, gate));
});

check('(c) a non-SEO hard gate still rejects even when the SEO group is the only other problem', () => {
  const badBoth = { ...good, secondaryKeywords: ['vertical herb wall', 'drip tray', 'patio shade cloth', 'railing planter', 'window box'], plainText: good.plainText + ' TODO' };
  assert.throws(() => validateAutomaticArticle(badBoth, sourceTitle, evidence, { ...gate, skipSeo: true }), { code: 'automation_quality_gate' });
});

for (const run of queue) await run();
console.log(`\nblog-topic-seo: ${passed} checks passed`);
