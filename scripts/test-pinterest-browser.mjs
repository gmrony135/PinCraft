import assert from 'node:assert/strict';
import test from 'node:test';
import {randomBytes} from 'node:crypto';
import {assertAllowedHandle,assertAllowedProfileURL,canPublishAnotherPin,PINTEREST_ACCOUNT,PINTEREST_MAX_PINS_PER_DAY} from '../lib/pinterest-browser/policy.mjs';
import {encryptSession,decryptSession} from '../lib/pinterest-browser/session-crypto.mjs';

test('only the SlimGlow Life account is allowed', () => {
  assert.equal(assertAllowedHandle('@SlimGlowLifex'), 'SlimGlowLifex');
  assert.equal(assertAllowedHandle('slimglowlifex'), 'SlimGlowLifex');
  assert.throws(() => assertAllowedHandle('someoneelse'));
});

test('Small Apartment Nest and VibeSpark are always blocked', () => {
  assert.throws(() => assertAllowedHandle('smallapartmentnestx'), /blocked by policy/);
  assert.throws(() => assertAllowedHandle('@SmallApartmentNestX'), /blocked by policy/);
  assert.throws(() => assertAllowedHandle('VibeSpark'), /blocked by policy/);
});

test('profile URLs must be https pinterest.com on the allowed handle', () => {
  assert.equal(assertAllowedProfileURL(PINTEREST_ACCOUNT.profileURL), PINTEREST_ACCOUNT.profileURL);
  assert.throws(() => assertAllowedProfileURL('https://www.pinterest.com/smallapartmentnestx/'));
  assert.throws(() => assertAllowedProfileURL('http://www.pinterest.com/SlimGlowLifex/'));
  assert.throws(() => assertAllowedProfileURL('https://evil.example.com/SlimGlowLifex/'));
});

test('daily ceiling is 6 pins and blocks the seventh', () => {
  assert.equal(PINTEREST_MAX_PINS_PER_DAY, 6);
  for (let n = 0; n < 6; n++) assert.equal(canPublishAnotherPin(n), true);
  assert.equal(canPublishAnotherPin(6), false);
  assert.equal(canPublishAnotherPin(-1), false);
  assert.equal(canPublishAnotherPin(1.5), false);
});

test('saved session round-trips, and tampering or a wrong key fails', () => {
  const key = randomBytes(32).toString('base64'), state = {cookies: [{name: 'x', value: 'y'}], origins: []};
  const envelope = encryptSession(state, key);
  assert.deepEqual(decryptSession(envelope, key), state);
  assert.ok(!envelope.includes('"cookies"'), 'plaintext must not appear in the envelope');
  assert.throws(() => decryptSession(envelope, randomBytes(32).toString('base64')));
  const parts = envelope.split(':'); parts[3] = Buffer.from('tampered').toString('base64');
  assert.throws(() => decryptSession(parts.join(':'), key));
  assert.throws(() => encryptSession(state, 'too-short'));
});

import {validateStorageState,validateJobInput,nextActionAllowed,dhakaDayStart,MIN_SPACING_MS} from '../lib/pinterest-browser/jobs.mjs';

const goodExport = {cookies: [{name: '_auth', value: 'v', domain: '.pinterest.com', path: '/'}], origins: []};

test('upload accepts only a Pinterest session export', () => {
  assert.deepEqual(validateStorageState(goodExport).cookies.length, 1);
  assert.throws(() => validateStorageState({...goodExport, password: 'hunter2'}), /fields a session export does not have/);
  assert.throws(() => validateStorageState({cookies: [{name: 'a', value: 'b', domain: '.example.com'}]}), /no Pinterest cookies/);
  assert.throws(() => validateStorageState('plain text password'), /JSON/);
  assert.throws(() => validateStorageState({cookies: []}), /no usable cookies/);
});

test('queued pin input requires https image and link', () => {
  const ok = validateJobInput({title: 'Cozy corner', description: 'Idea', boardName: 'Home', imageURL: 'https://img.example.com/a.jpg', link: 'https://example.com/post'});
  assert.equal(ok.title, 'Cozy corner');
  assert.throws(() => validateJobInput({title: 'x', boardName: 'b', imageURL: 'http://a.com/x.jpg', link: 'https://a.com'}), /Image URL must be https/);
  assert.throws(() => validateJobInput({title: 'x', boardName: 'b', imageURL: 'https://a.com/x.jpg', link: 'javascript:alert(1)'}), /link must be https/);
  assert.throws(() => validateJobInput({title: '', boardName: 'b', imageURL: 'https://a.com/x.jpg', link: 'https://a.com'}), /Title is required/);
});

test('pacing: at most six a day and at least two hours apart', () => {
  const now = Date.parse('2026-11-19T10:00:00Z');
  assert.equal(nextActionAllowed({postedToday: 0, lastPostAt: null, now}).allowed, true);
  assert.equal(nextActionAllowed({postedToday: 6, lastPostAt: null, now}).reason, 'daily_limit');
  const recent = nextActionAllowed({postedToday: 1, lastPostAt: now - MIN_SPACING_MS + 60000, now});
  assert.equal(recent.reason, 'spacing');
  assert.equal(nextActionAllowed({postedToday: 1, lastPostAt: now - MIN_SPACING_MS, now}).allowed, true);
});

test('the day resets at Asia/Dhaka midnight', () => {
  const start = dhakaDayStart(Date.parse('2026-11-18T19:30:00Z')); // 01:30 on Nov 19 in Dhaka
  assert.equal(start, Date.parse('2026-11-18T18:00:00Z'));
});
