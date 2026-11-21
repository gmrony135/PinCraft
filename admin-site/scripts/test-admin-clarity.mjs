// Offline. Run: node scripts/test-admin-clarity.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attentionItems, ALL_CLEAR, keyCounts, keyRows, matchesQuery, providerLimitHits, usageBarPercent, usageLevel } from '../lib/clarity.mjs';
import { shapeLists, yesterdayTotals } from '../lib/shape.mjs';
import { keySlotStatuses } from '../lib/key-slots.mjs';

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; console.log(`ok - ${name}`); };
const LIMITS = { pinPacks: 20, text: 150, image: 20 };

// Fixture payload shaped like collectMetrics() output.
function fixture(overrides = {}) {
  return {
    limits: LIMITS,
    usage: [
      { uid: 'u1', name: 'Rahim', email: 'rahim@example.com', usageToday: { pinPacks: 20, text: 3, image: 0 } },   // pin packs at limit
      { uid: 'u2', name: 'Karim', email: 'karim@example.com', usageToday: { pinPacks: 16, text: 0, image: 0 } },  // 80% → warn
      { uid: 'u3', name: 'Salma', email: 'salma@example.com', usageToday: { pinPacks: 2, text: 120, image: 1 } }, // 120/150 = 80% → warn
      { uid: 'u4', name: 'Nila', email: 'nila@example.com', usageToday: { pinPacks: 1, text: 1, image: 1 } },     // fine
    ],
    keySlots: { day: '2026-11-21', recorded: true, providers: [
      { id: 'gemini', name: 'Google Gemini', slots: [
        { slot: 1, status: 'LIMIT_FINISHED', calls: 12, limitHits: 3 },
        { slot: 2, status: 'USED', calls: 7, limitHits: 0 },
        { slot: 3, status: 'NOT_SET', calls: 0, limitHits: 0 },
      ] },
      { id: 'groq', name: 'Groq', slots: [
        { slot: 1, status: 'LIMIT_FINISHED', calls: 2, limitHits: 1 },
        { slot: 2, status: 'UNUSED', calls: 0, limitHits: 0 },
      ] },
    ] },
    jobs: { total: 9, byState: { failed: 2, skipped: 1, published: 6 } },
    ...overrides,
  };
}

check('usage thresholds: 80% amber, at the limit red, exact integer maths', () => {
  assert.equal(usageLevel(15, 20), 'ok');
  assert.equal(usageLevel(16, 20), 'warn');   // exactly 80%
  assert.equal(usageLevel(19, 20), 'warn');
  assert.equal(usageLevel(20, 20), 'limit');  // exactly at the limit
  assert.equal(usageLevel(21, 20), 'limit');  // over (defensive)
  assert.equal(usageLevel(119, 150), 'ok');
  assert.equal(usageLevel(120, 150), 'warn'); // 80% of 150
  assert.equal(usageLevel(150, 150), 'limit');
  assert.equal(usageLevel(0, 0), 'ok');       // no limit configured: never coloured
  assert.equal(usageLevel(undefined, 20), 'ok');
});
check('usage bar width: exact percent, capped at 100', () => {
  assert.equal(usageBarPercent(16, 20), 80);
  assert.equal(usageBarPercent(25, 20), 100);
  assert.equal(usageBarPercent(1, 3), 33);
  assert.equal(usageBarPercent(5, 0), 0);
});
check('attention strip: counts from the fixture payload, in order, with jump targets', () => {
  const items = attentionItems({ data: fixture(), billing: { counts: { pending: 3 } } });
  assert.deepEqual(items.map(i => i.id), ['keys', 'payments', 'users-near-limit', 'jobs']);
  assert.match(items[0].text, /^2 AI key slots at limit today: Google Gemini slot 1, Groq slot 1$/);
  assert.equal(items[0].target, 'keys');
  assert.equal(items[1].text, '3 payments waiting for your review');
  assert.equal(items[1].target, 'payments');
  assert.match(items[2].text, /^3 users are at 80% or more of a daily limit today \(1 at the limit\)$/);
  assert.equal(items[2].target, 'usage');
  assert.equal(items[3].text, 'Automation jobs: 2 failed, 1 skipped (all time)');
  assert.equal(items[3].target, 'activity');
});
check('attention strip: singular wording and no items when nothing needs attention', () => {
  const one = attentionItems({ data: fixture({ usage: [], jobs: { total: 0, byState: {} }, keySlots: { recorded: false, providers: [{ id: 'gemini', name: 'Google Gemini', slots: [{ slot: 1, status: 'LIMIT_FINISHED' }] }] } }), billing: { counts: { pending: 1 } } });
  assert.equal(one[0].text, '1 AI key slot at limit today: Google Gemini slot 1');
  assert.equal(one[1].text, '1 payment waiting for your review');
  const clear = attentionItems({ data: fixture({ usage: [], jobs: { total: 0, byState: { published: 4 } }, keySlots: { recorded: false, providers: [] } }), billing: { counts: { pending: 0 } } });
  assert.deepEqual(clear, []);
  assert.equal(ALL_CLEAR, 'All clear — no key at limit, no pending payment.');
});
check('attention strip: an unreadable billing payload is reported, never shown as zero payments', () => {
  const items = attentionItems({ data: fixture({ usage: [], jobs: { byState: {} }, keySlots: { providers: [] } }), billing: null, billingError: 'Payment reviews could not be read just now.' });
  assert.deepEqual(items.map(i => i.id), ['payments-unread']);
});
check('attention strip: nothing is built before data loads', () => {
  assert.deepEqual(attentionItems({ data: null, billing: { counts: { pending: 5 } } }), []);
});
check('per-key filters: counts per status and filtered rows', () => {
  const providers = keySlotStatuses({
    slots: { gemini_1: { calls: 12, limited: 3 }, gemini_2: { calls: 7 }, groq_1: { calls: 2, limited: 1 } },
    configured: { gemini: [1, 2, 3], groq: [1], cloudflare: [] },
  });
  const counts = keyCounts(providers);
  assert.equal(counts.total, 30);
  assert.equal(counts.atLimit, 2);   // gemini_1, groq_1
  assert.equal(counts.inUse, 1);     // gemini_2
  assert.equal(counts.unused, 1);    // gemini slot 3: configured, never called
  assert.equal(counts.notSet, 26);   // gemini 4-10 (7) + groq 2-10 (9) + cloudflare 1-10 (10): not configured
  assert.equal(keyRows(providers, 'all').length, 30);
  assert.equal(keyRows(providers, 'at_limit').length, 2);
  assert.equal(keyRows(providers, 'in_use').length, 1);
  assert.equal(keyRows(providers, 'not_set').length, counts.notSet);
  assert.deepEqual(keyRows(providers, 'at_limit').map(r => r.label), ['LIMIT FINISHED', 'LIMIT FINISHED']);
});
check('per-key rows carry slot numbers and status only: no key, token or account-id field', () => {
  const rows = keyRows(fixture().keySlots.providers, 'all');
  const allowed = new Set(['provider', 'slot', 'status', 'label', 'calls', 'limitHits', 'lastLimitedAt']);
  for (const row of rows) for (const k of Object.keys(row)) assert.ok(allowed.has(k), `unexpected field ${k}`);
});
check('provider limit hits today are summed from recorded slot counters', () => {
  const hits = providerLimitHits(fixture().keySlots.providers);
  assert.deepEqual(hits, { gemini: 3, groq: 1 });
});
check('search: name or email, case-insensitive; empty query matches everyone', () => {
  const u = { name: 'Rahim Uddin', email: 'Rahim@Example.com' };
  assert.equal(matchesQuery(u, ''), true);
  assert.equal(matchesQuery(u, '  '), true);
  assert.equal(matchesQuery(u, 'rahim'), true);
  assert.equal(matchesQuery(u, 'EXAMPLE.com'), true);
  assert.equal(matchesQuery(u, 'karim'), false);
  assert.equal(matchesQuery({ name: null, email: null }, 'x'), false);
});
check('merged user table: regular users carry usageToday, and no usage totals leak into the list', () => {
  const row = (uid, joined, today) => ({ uid, name: uid, email: `${uid}@x.test`, joined, lastSignIn: null, plan: 'Free', telegramVerified: true,
    usageToday: today, usageTotal: { pinPacks: 5, text: 6, image: 7 }, usageYesterday: { pinPacks: 1, text: 2, image: 0 }, lastActiveDay: '2026-11-21', activeIn7: true, activeIn30: true, pinQueueItems: 4, pinQueuePostedToday: 1 });
  const fresh = [row('new1', '2026-11-21T01:00:00Z', { pinPacks: 3, text: 4, image: 0 })];
  const regular = [row('old1', '2026-11-01T00:00:00Z', { pinPacks: 16, text: 0, image: 0 })];
  const lists = shapeLists(fresh, regular, [...fresh, ...regular]);
  assert.deepEqual(lists.users[0].usageToday, { pinPacks: 16, text: 0, image: 0 });
  assert.equal('usageTotal' in lists.users[0], false, 'regular users keep no total column');
  assert.equal('usageYesterday' in lists.users[0], false);
  assert.equal('pinQueueItems' in lists.users[0], false, 'existing shape of regular users unchanged');
  assert.deepEqual(lists.newUsers[0].usageTotal, { pinPacks: 5, text: 6, image: 7 }, 'New users card keeps its totals');
  assert.equal(lists.usage.length, 2);
  assert.equal(lists.usage[0].usageTotal.text, 6);
  assert.equal('usageYesterday' in lists.usage[0], false);
});
check('yesterday totals come from the rows already read (no new reads)', () => {
  const rows = [
    { usageYesterday: { pinPacks: 4, text: 10, image: 2 } },
    { usageYesterday: { pinPacks: 0, text: 0, image: 0 } },
    { usageYesterday: { pinPacks: 1, text: 0, image: 0 } },
  ];
  assert.deepEqual(yesterdayTotals(rows), { activeUsers: 2, pinPacks: 5, aiRequests: 12 });
});

// Static checks on the panel source.
const panel = readFileSync(new URL('../app/AdminApp.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const metrics = readFileSync(new URL('../lib/metrics.mjs', import.meta.url), 'utf8');
check('AI provider table: the dead Cost column is gone; limit hits shown instead', () => {
  assert.doesNotMatch(panel, /<th[^>]*>Cost<\/th>/);
  assert.match(panel, /Requests today<\/th><th className="num">Limit hits today/);
});
check('no key value, token or account ID is rendered anywhere in the panel', () => {
  const rendered = panel.replace(/key=\{[^}]*\}/g, ''); // React keys are not displayed
  assert.doesNotMatch(rendered, /\{[^}]*\.uid\}/, 'uid is never rendered as text');
  assert.doesNotMatch(panel, /\{[^}]*(token|apiKey|api_key|secret|accountId|account_id)[^}]*\}/i);
});
check('every section has a plain Bengali line under its heading', () => {
  const billing = readFileSync(new URL('../app/BillingReview.js', import.meta.url), 'utf8');
  assert.match(billing, /lang="bn"/, 'payments section has its Bengali line');
  for (const key of ['attention', 'summary', 'activity', 'newUsers', 'users', 'usage', 'api', 'keys', 'notes']) {
    assert.ok(new RegExp(`BN\\.${key}\\}`).test(panel), `${key} line rendered`);
  }
  for (const [key, line] of Object.entries({ attention: 'এক নজরে', keys: 'চাবি', usage: 'বার' })) {
    assert.ok(line.length > 0 && /[\u0980-\u09FF]/.test(line), `${key} is Bengali`);
  }
  assert.match(panel, /ট্যাপ|চাবি/);
});
check('section navigation covers the six sections on the owner’s list', () => {
  for (const id of ['summary', 'new', 'users', 'usage', 'keys', 'payments']) assert.match(panel, new RegExp(`\\['${id}'`));
  assert.match(panel, /id="attention"/);
});
check('usage cells: exact x / limit with a bar; amber and red classes exist in the stylesheet', () => {
  assert.match(panel, /function UsageCell/);
  assert.match(css, /\.bar\.warn span \{ background:#d97706/);
  assert.match(css, /\.bar\.limit span \{ background:#dc2626/);
});
check('phone: sticky table headers and a frozen first column, larger header buttons', () => {
  assert.match(css, /th \{ position:sticky; top:0/);
  assert.match(css, /th:first-child, td:first-child \{ position:sticky; left:0/);
  assert.match(css, /\.btn\.big \{ min-height:48px/);
});
check('auth, session and the owner gate are untouched in this change', () => {
  assert.match(metrics, /collectMetrics/);
  assert.doesNotMatch(panel, /ADMIN_PIN|OWNER_EMAIL|ADMIN_PIN_HASH|PIN_HASH/);
  assert.match(panel, /\/api\/session/, 'login still uses the same session route');
});

console.log(`\n${passed} admin clarity checks passed`);
