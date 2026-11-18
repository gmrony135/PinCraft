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
