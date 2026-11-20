// Owner-only session and hardening checks (offline). Run: node scripts/test-owner-session.mjs
import assert from 'node:assert/strict';
process.env.ADMIN_SESSION_SECRET = 'x'.repeat(40);
const { signSession, readSession, COOKIE, SESSION_SECONDS, cookieOptions } = await import('../lib/session.mjs');
const { OWNER_EMAIL } = await import('../lib/config.mjs');
const now = Date.now();
const UID = 'owner-uid-123';

assert.equal(OWNER_EMAIL, 'gmrony135@gmail.com');
assert.equal(COOKIE, '__Host-pcadmin');
assert.equal(SESSION_SECONDS, 2 * 60 * 60, 'session lives 2 hours');
assert.deepEqual(cookieOptions(60), { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 60 });

assert.equal(readSession(signSession(OWNER_EMAIL, UID, now), now)?.email, OWNER_EMAIL, 'owner accepted');
assert.equal(readSession(signSession('someone.else@gmail.com', UID, now), now), null, 'other account denied');
const good = signSession(OWNER_EMAIL, UID, now);
const [payload, sig] = good.split('.');
const forged = Buffer.from(JSON.stringify({ email: 'attacker@gmail.com', uid: UID, exp: now + 1e9 })).toString('base64url');
assert.equal(readSession(`${forged}.${sig}`, now), null, 'forged payload rejected');
assert.equal(readSession(`${payload}.AAAA`, now), null, 'bad signature rejected');
assert.equal(readSession(`${good}.extra`, now), null, 'extra segment rejected');
assert.equal(readSession(signSession(OWNER_EMAIL, UID, now - 3 * 3600e3), now), null, 'expired after 2 hours');
assert.equal(readSession(signSession(OWNER_EMAIL, '', now), now), null, 'session without uid rejected');
assert.equal(readSession(undefined, now), null, 'no cookie rejected');
assert.equal(readSession('not-a-session', now), null, 'garbage rejected');
process.env.ADMIN_SESSION_SECRET = 'short';
assert.throws(() => signSession(OWNER_EMAIL, UID, now), /too short/);
process.env.ADMIN_SESSION_SECRET = 'x'.repeat(40);

// Headers: noindex everywhere, strict framing, no caching. No Firebase sign-in proxy any more.
const cfg = (await import('../next.config.mjs')).default;
const headerSet = (await cfg.headers())[0];
const h = Object.fromEntries(headerSet.headers.map(x => [x.key, x.value]));
assert.equal(headerSet.source, '/:path*', 'headers apply to every path');
assert.match(h['X-Robots-Tag'], /noindex/);
assert.equal(h['X-Frame-Options'], 'DENY');
assert.match(h['Content-Security-Policy'], /frame-ancestors 'none'/);
assert.match(h['Content-Security-Policy'], /default-src 'self'/);
assert.match(h['Cache-Control'], /no-store/);
assert.equal(cfg.rewrites, undefined, 'no Firebase sign-in proxy');
assert.doesNotMatch(h['Content-Security-Policy'], /google|firebase/i, 'CSP allows no Google or Firebase origins');
assert.equal(h['Cross-Origin-Opener-Policy'], 'same-origin');

console.log('test-owner-session: all checks passed');
