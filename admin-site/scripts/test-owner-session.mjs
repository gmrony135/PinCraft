// Owner-only session checks. Run: node scripts/test-owner-session.mjs
import assert from 'node:assert/strict';
process.env.ADMIN_SESSION_SECRET = 'x'.repeat(40);
const { signSession, readSession } = await import('../lib/session.mjs');
const { OWNER_EMAIL } = await import('../lib/config.mjs');
const now = Date.now();

assert.equal(OWNER_EMAIL, 'gmrony135@gmail.com');
// Owner session is accepted.
assert.equal(readSession(signSession(OWNER_EMAIL, now), now)?.email, OWNER_EMAIL, 'owner accepted');
// Any other account is rejected, even with a valid signature from this server.
assert.equal(readSession(signSession('someone.else@gmail.com', now), now), null, 'other signed-in user denied');
// Tampered payload is rejected.
const good = signSession(OWNER_EMAIL, now);
const [payload, sig] = good.split('.');
const forged = Buffer.from(JSON.stringify({ email: 'attacker@gmail.com', exp: now + 1e9 })).toString('base64url');
assert.equal(readSession(`${forged}.${sig}`, now), null, 'forged payload rejected');
assert.equal(readSession(`${payload}.AAAA`, now), null, 'bad signature rejected');
// Expired session is rejected (8 hour life).
assert.equal(readSession(signSession(OWNER_EMAIL, now - 9 * 3600e3), now), null, 'expired rejected');
assert.equal(readSession(undefined, now), null, 'no cookie rejected');
assert.equal(readSession('not-a-session', now), null, 'garbage rejected');
// Short secret is refused.
process.env.ADMIN_SESSION_SECRET = 'short';
assert.throws(() => signSession(OWNER_EMAIL, now), /too short/);
console.log('test-owner-session: all checks passed');
