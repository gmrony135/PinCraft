// Unit checks for trigger-based Vignette counters (owner order 2026-11-21).
// Run: node tests/vignette-frequency.mjs
import assert from 'node:assert/strict';
import {
  VIGNETTE_STATE_KEY, VIGNETTE_DAILY_CAP, VIGNETTE_GENERATIONS_TRIGGER, VIGNETTE_PAGE_VIEWS_TRIGGER,
  dhakaDay, readVignetteState, writeVignetteState, countGeneration, countPageView, consumeQueuedShow,
  recordGenerationCompleted, recordMarketingPageView,
} from '../lib/ads/vignette-frequency.mjs';

const memoryStorage = (seed = {}) => {
  const data = new Map(Object.entries(seed));
  return { getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), _data: data };
};
// 2026-11-21 10:00 Dhaka (04:00 UTC) and the following Dhaka midnight.
const DAY1 = Date.parse('2026-11-21T04:00:00Z');
const SAME_DAY_LATER = Date.parse('2026-11-21T14:00:00Z');
const NEXT_DAY = Date.parse('2026-11-21T18:00:01Z'); // 00:00:01 Dhaka on 2026-11-22
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };

check('constants match the owner order', () => {
  assert.equal(VIGNETTE_GENERATIONS_TRIGGER, 2);
  assert.equal(VIGNETTE_PAGE_VIEWS_TRIGGER, 3);
  assert.equal(VIGNETTE_DAILY_CAP, 3);
  assert.equal(dhakaDay(DAY1), '2026-11-21');
  assert.equal(dhakaDay(NEXT_DAY), '2026-11-22');
});

// (a) counters reach the threshold only after 2 generations, then reset.
check('(a) first generation does not trigger, second does, counter resets', () => {
  let state = readVignetteState(memoryStorage(), DAY1);
  let step = countGeneration(state);
  assert.equal(step.queued, null, 'first completion must not show');
  assert.equal(step.state.generations, 1);
  step = countGeneration(step.state);
  assert.equal(step.queued, 'generation', 'second completion queues one show');
  assert.equal(step.state.generations, 0, 'counter resets after the trigger');
  assert.equal(step.state.shows, 1);
});
check('(a) a pin pack and an article count together and trigger once per pair', () => {
  const storage = memoryStorage();
  assert.equal(recordGenerationCompleted(storage, DAY1), null, 'pin pack 1');
  assert.equal(recordGenerationCompleted(storage, SAME_DAY_LATER), 'generation', 'article 1 is the 2nd completion');
  assert.equal(readVignetteState(storage, SAME_DAY_LATER).generations, 0);
});
check('(a) a queued show is consumed once and third generation does not trigger', () => {
  let state = countGeneration(countGeneration(readVignetteState(memoryStorage(), DAY1)).state).state;
  const consumed = consumeQueuedShow(state);
  assert.equal(consumed.show, true);
  assert.equal(consumed.state.queued, null);
  assert.equal(consumeQueuedShow(consumed.state).show, false, 'consumed only once');
  assert.equal(countGeneration(consumed.state).queued, null, 'one generation after the show does not trigger');
});
check('(a) daily cap: no more than three shows per Dhaka day', () => {
  let state = readVignetteState(memoryStorage(), DAY1);
  const fired = [];
  for (let n = 0; n < 12; n++) {
    const step = countGeneration(state);
    state = consumeQueuedShow(step.state).state;
    if (step.queued) fired.push(step.queued);
  }
  assert.equal(fired.length, VIGNETTE_DAILY_CAP, 'twelve completions give exactly the cap');
  assert.equal(state.shows, VIGNETTE_DAILY_CAP);
});
check('(a) counters reset at Dhaka midnight', () => {
  const storage = memoryStorage();
  recordGenerationCompleted(storage, DAY1);
  assert.equal(readVignetteState(storage, SAME_DAY_LATER).generations, 1, 'same Dhaka day keeps the count');
  assert.equal(readVignetteState(storage, NEXT_DAY).generations, 0, 'next Dhaka day starts at zero');
  assert.equal(readVignetteState(storage, NEXT_DAY).shows, 0);
});
check('(a) unreadable or tampered storage starts a fresh state instead of breaking the page', () => {
  assert.equal(readVignetteState(memoryStorage({ [VIGNETTE_STATE_KEY]: '{not json' }), DAY1).generations, 0);
  assert.equal(readVignetteState(memoryStorage({ [VIGNETTE_STATE_KEY]: JSON.stringify({ day: '2026-11-21', generations: -4 }) }), DAY1).generations, 0);
  assert.equal(readVignetteState({ getItem() { throw new Error('denied'); } }, DAY1).shows, 0);
  const broken = { getItem: () => null, setItem() { throw new Error('quota'); } };
  assert.equal(writeVignetteState(broken, readVignetteState(broken, DAY1)), false);
});

// (b) page-view trigger fires once per day after 3 views and not again the same day.
check('(b) page trigger fires on the third marketing view only', () => {
  const storage = memoryStorage();
  const shows = [];
  for (let view = 1; view <= 4; view++) shows.push(recordMarketingPageView(storage, DAY1 + view * 60_000).show);
  assert.deepEqual(shows, [false, false, true, false], 'views 1 and 2 do not show; view 3 shows; view 4 does not');
});
check('(b) page trigger does not fire again the same day, even after more views', () => {
  const storage = memoryStorage();
  for (let view = 1; view <= 3; view++) recordMarketingPageView(storage, DAY1 + view * 60_000);
  for (let view = 4; view <= 10; view++) assert.equal(recordMarketingPageView(storage, DAY1 + view * 60_000).show, false);
});
check('(b) page trigger fires again the next Dhaka day after three new views', () => {
  const storage = memoryStorage();
  for (let view = 1; view <= 3; view++) recordMarketingPageView(storage, DAY1 + view * 60_000);
  assert.equal(recordMarketingPageView(storage, NEXT_DAY).show, false, 'view 1 of the next day');
  assert.equal(recordMarketingPageView(storage, NEXT_DAY + 60_000).show, false, 'view 2 of the next day');
  assert.equal(recordMarketingPageView(storage, NEXT_DAY + 120_000).show, true, 'view 3 of the next day');
});
check('(b) page and generation triggers share the daily cap', () => {
  const storage = memoryStorage();
  for (let n = 0; n < 2; n++) recordGenerationCompleted(storage, DAY1); // shows: 1 queued
  let shown = recordMarketingPageView(storage, DAY1 + 60_000).show; // consumes generation show
  assert.equal(shown, true);
  for (let view = 2; view <= 3; view++) recordMarketingPageView(storage, DAY1 + view * 60_000); // page show: 2
  assert.equal(readVignetteState(storage, DAY1).shows, 2);
  for (let n = 0; n < 2; n++) recordGenerationCompleted(storage, DAY1 + 3 * 60_000); // show: 3
  assert.equal(recordMarketingPageView(storage, DAY1 + 4 * 60_000).show, true);
  for (let n = 0; n < 2; n++) recordGenerationCompleted(storage, DAY1 + 5 * 60_000); // capped
  assert.equal(readVignetteState(storage, DAY1).shows, VIGNETTE_DAILY_CAP);
  assert.equal(recordMarketingPageView(storage, DAY1 + 6 * 60_000).show, false);
});

console.log(`\n${passed} unit checks passed`);
