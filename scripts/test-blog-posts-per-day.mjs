import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_BLOG_POSTS_PER_DAY,
  blogAutomationSettings,
  nextBlogSlot,
  suggestedTimes,
} from '../lib/publishing/blog-automation-policy.mjs';

const base = (dailyLimit, postingTimes = suggestedTimes(dailyLimit)) => ({
  bloggerConnectionId: 'blogger',
  websiteId: 'blogger_712906577548893642',
  categoryIds: ['home-decor'],
  topic: '',
  language: 'en',
  trendRegion: 'BD',
  timezone: 'Asia/Dhaka',
  dailyLimit,
  postingTimes,
});

const dayKey = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

test('the default posts per day is 2', () => {
  assert.equal(DEFAULT_BLOG_POSTS_PER_DAY, 2);
  assert.equal(suggestedTimes(DEFAULT_BLOG_POSTS_PER_DAY).length, 2);
});

test('every quantity from 1 to 6 is accepted with exactly that many posting times', () => {
  for (let n = 1; n <= 6; n++) {
    const settings = blogAutomationSettings(base(n));
    assert.equal(settings.dailyLimit, n);
    assert.equal(settings.postingTimes.length, n);
  }
});

test('zero, seven, decimals and strings are rejected', () => {
  for (const bad of [0, 7, 1.5, '2', NaN]) {
    assert.throws(() => blogAutomationSettings(base(bad, [])));
  }
});

test('a mismatch between posts per day and posting times is rejected', () => {
  assert.throws(() => blogAutomationSettings(base(2, ['11:00'])));
});

test('the schedule produces exactly N posts on every Asia/Dhaka day', () => {
  for (const n of [1, 2, 3, 6]) {
    const settings = blogAutomationSettings(base(n));
    let cursor = Date.parse('2026-11-14T00:00:00+06:00');
    const perDay = new Map();
    for (let i = 0; i < n * 5; i++) {
      const slot = nextBlogSlot(settings, cursor);
      const key = dayKey(slot);
      perDay.set(key, (perDay.get(key) || 0) + 1);
      cursor = slot;
    }
    // Five full days of slots: each day must hold exactly n posts.
    const days = [...perDay.keys()].slice(0, 5);
    for (const day of days) assert.equal(perDay.get(day), n, `${n}/day expected on ${day}`);
  }
});
