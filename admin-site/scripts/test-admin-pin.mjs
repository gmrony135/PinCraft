// Admin Gmail + PIN check (offline). Run: node scripts/test-admin-pin.mjs
// The PIN used here is random and exists only in memory for this run. No PIN is stored or printed.
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
const { checkAdminLogin, adminPinHash } = await import('../lib/admin-pin.mjs');
const OWNER = 'gmrony135@gmail.com';

const pin = String(randomInt(0, 10000)).padStart(4, '0');
const wrong = pin === '9999' ? '0000' : '9999';
const env = { ADMIN_PIN_HASH: await bcrypt.hash(pin, 10) };

assert.equal(await checkAdminLogin({ email: OWNER, pin }, env), true, 'owner + correct PIN accepted');
assert.equal(await checkAdminLogin({ email: ' GMRONY135@gmail.com ', pin }, env), true, 'email is case/space tolerant');
assert.equal(await checkAdminLogin({ email: OWNER, pin: wrong }, env), false, 'wrong PIN refused');
assert.equal(await checkAdminLogin({ email: 'someone.else@gmail.com', pin }, env), false, 'other email refused even with correct PIN');
assert.equal(await checkAdminLogin({ email: 'gmrony135@gmail.co', pin }, env), false, 'lookalike email refused');
assert.equal(await checkAdminLogin({ email: OWNER, pin: pin.slice(0, 3) }, env), false, 'short PIN refused');
assert.equal(await checkAdminLogin({ email: OWNER, pin: `${pin}5` }, env), false, 'long PIN refused');
assert.equal(await checkAdminLogin({ email: OWNER, pin: 'abcd' }, env), false, 'non-numeric PIN refused');
assert.equal(await checkAdminLogin({ email: OWNER, pin: undefined }, env), false, 'missing PIN refused');
assert.equal(await checkAdminLogin({ email: undefined, pin }, env), false, 'missing email refused');
assert.equal(await checkAdminLogin({ email: OWNER, pin }, {}), false, 'no ADMIN_PIN_HASH: fail closed');
assert.equal(await checkAdminLogin({ email: OWNER, pin }, { ADMIN_PIN_HASH: 'plain-text-pin-' }), false, 'non-bcrypt value refused');
assert.equal(adminPinHash({ ADMIN_PIN_HASH: '' }), '', 'empty hash is unset');
assert.equal(adminPinHash({ ADMIN_PIN_HASH: env.ADMIN_PIN_HASH }), env.ADMIN_PIN_HASH, 'valid bcrypt hash accepted');

console.log('test-admin-pin: all checks passed');
