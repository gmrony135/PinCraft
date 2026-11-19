import assert from 'node:assert/strict';
import { splitNewUsers, isNewUser, NEW_USER_WINDOW_MS } from '../lib/new-users.mjs';

const now = Date.parse('2026-11-19T18:00:00Z');
const h = n => new Date(now - n * 3600000).toISOString();
const rows = [
  { uid: 'a', joined: h(1) },
  { uid: 'b', joined: h(23.9) },
  { uid: 'c', joined: h(24.5) },   // older than 24h: regular
  { uid: 'd', joined: h(72) },     // regular
  { uid: 'e', joined: null },      // createdAt missing: regular, never new
  { uid: 'f', joined: 'not-a-date' },
  { uid: 'g', joined: new Date(now + 3600000).toISOString() }, // future timestamp: not new
];
const { fresh, regular } = splitNewUsers(rows, now);
assert.deepEqual(fresh.map(r => r.uid), ['a', 'b']);            // newest first
assert.deepEqual(regular.map(r => r.uid), ['c', 'd', 'e', 'f', 'g']);
assert.equal(fresh.length + regular.length, rows.length);       // no duplicates, nothing lost
assert.equal(isNewUser(h(23.99), now), true);
assert.equal(isNewUser(h(24.01), now), false);
assert.equal(isNewUser(undefined, now), false);
assert.equal(NEW_USER_WINDOW_MS, 86400000);
assert.deepEqual(splitNewUsers([], now), { fresh: [], regular: [] });
console.log('test-new-users: 7 checks passed');
