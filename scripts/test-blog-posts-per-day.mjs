import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BLOG_COUNTRIES,
  DEFAULT_BLOG_COUNTRY,
  DEFAULT_BLOG_POSTS_PER_DAY,
  bestPostingTimes,
  blogAutomationSettings,
  nextBlogSlot,
} from '../lib/publishing/blog-automation-policy.mjs';
import {cronSecretIdentity,TICK_BUCKET_MS} from '../lib/publishing/blog-tick-secret.mjs';

const base = (overrides = {}) => {
  const trendRegion = overrides.trendRegion ?? DEFAULT_BLOG_COUNTRY;
  const dailyLimit = overrides.dailyLimit ?? DEFAULT_BLOG_POSTS_PER_DAY;
  return {
    bloggerConnectionId: 'blogger',
    websiteId: 'blogger_712906577548893642',
    categoryIds: ['home-decor'],
    topic: '',
    language: 'en',
    trendRegion,
    timezone: BLOG_COUNTRIES[trendRegion].timezone,
    dailyLimit,
    postingTimes: bestPostingTimes(trendRegion, dailyLimit),
    ...overrides,
  };
};

const dayKey = (ms, timezone) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

test('defaults: 2 posts per day and the USA with Eastern times 10:00 and 20:00', () => {
  assert.equal(DEFAULT_BLOG_POSTS_PER_DAY, 2);
  assert.equal(DEFAULT_BLOG_COUNTRY, 'US');
  assert.equal(BLOG_COUNTRIES.US.timezone, 'America/New_York');
  assert.deepEqual(bestPostingTimes('US', 2), ['10:00', '20:00']);
});

test('USA six-post pattern matches the owner example 10, 12, 2, 4, 8, 9pm', () => {
  assert.deepEqual(bestPostingTimes('US', 6), ['10:00', '12:00', '14:00', '16:00', '20:00', '21:00']);
});

test('every country and every quantity 1 to 6 validates with exactly that many slots', () => {
  for (const country of Object.keys(BLOG_COUNTRIES)) {
    for (let n = 1; n <= 6; n++) {
      const settings = blogAutomationSettings(base({ trendRegion: country, dailyLimit: n }));
      assert.equal(settings.dailyLimit, n);
      assert.equal(settings.postingTimes.length, n);
      assert.equal(settings.timezone, BLOG_COUNTRIES[country].timezone);
    }
  }
});

test('zero, seven, decimals and strings are rejected', () => {
  for (const bad of [0, 7, 1.5, '2', NaN]) {
    assert.throws(() => blogAutomationSettings(base({ dailyLimit: bad, postingTimes: [] })));
  }
});

test('changing country changes the timezone and the absolute posting instants', () => {
  const us = blogAutomationSettings(base({ trendRegion: 'US' }));
  const bd = blogAutomationSettings(base({ trendRegion: 'BD', postingTimes: bestPostingTimes('BD', 2), timezone: 'Asia/Dhaka' }));
  assert.notEqual(us.timezone, bd.timezone);
  const after = Date.parse('2026-11-14T00:00:00Z');
  assert.notEqual(nextBlogSlot(us, after).getTime(), nextBlogSlot(bd, after).getTime());
});

test('exactly one niche: zero and two categories are rejected', () => {
  assert.throws(() => blogAutomationSettings(base({ categoryIds: [] })), /exactly one content category/);
  assert.throws(() => blogAutomationSettings(base({ categoryIds: ['home-decor', 'fashion-style'] })), /exactly one content category/);
  assert.deepEqual(blogAutomationSettings(base({ categoryIds: ['fashion-style'] })).categoryIds, ['fashion-style']);
});

test('the schedule produces exactly N posts on every local day', () => {
  for (const n of [1, 2, 3, 6]) {
    const settings = blogAutomationSettings(base({ dailyLimit: n }));
    let cursor = Date.parse('2026-11-14T00:00:00-05:00');
    const perDay = new Map();
    for (let i = 0; i < n * 5; i++) {
      const slot = nextBlogSlot(settings, cursor).getTime();
      const key = dayKey(slot, settings.timezone);
      perDay.set(key, (perDay.get(key) || 0) + 1);
      cursor = slot;
    }
    for (const day of [...perDay.keys()].slice(0, 5)) assert.equal(perDay.get(day), n, `${n}/day expected on ${day}`);
  }
});

test('external cron secret: missing header returns null, wrong secret returns null', () => {
  const secret = 'a'.repeat(64);
  assert.equal(cronSecretIdentity({ authorization: null, secret }), null);
  assert.equal(cronSecretIdentity({ authorization: 'Bearer ' + 'b'.repeat(64), secret }), null);
  assert.equal(cronSecretIdentity({ authorization: 'Bearer short', secret }), null);
});

test('external cron secret: a weak configured secret is refused', () => {
  assert.throws(() => cronSecretIdentity({ authorization: 'Bearer x', secret: 'short' }));
});

test('external cron secret: one identity per 10-minute bucket, so a replay in the same bucket is detectable', () => {
  const secret = 'c'.repeat(64);
  const auth = 'Bearer ' + secret;
  const t = 1795027438000;
  const first = cronSecretIdentity({ authorization: auth, secret, now: t });
  const again = cronSecretIdentity({ authorization: auth, secret, now: t + 60000 });
  const next = cronSecretIdentity({ authorization: auth, secret, now: t + TICK_BUCKET_MS });
  assert.ok(first && first.deliveryKey);
  assert.equal(first.deliveryKey, again.deliveryKey, 'same bucket must share a key');
  assert.notEqual(first.deliveryKey, next.deliveryKey, 'next bucket must get a new key');
});
