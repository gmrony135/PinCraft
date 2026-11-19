import assert from 'node:assert/strict';
import { validatePin, dayKey, addPin, markPosted, removePin, listQueue, DAILY_POST_LIMIT, PINTEREST_PIN_CREATOR_URL } from '../lib/pin-queue/queue.mjs';

// Minimal in-memory Firestore stand-in: collection/doc/subcollection, where(==), orderBy, limit, get, set, update, delete, runTransaction.
function fakeDb() {
  const store = new Map();
  const snap = (path, data) => ({ exists: data !== undefined, id: path.split('/').pop(), data: () => (data === undefined ? undefined : structuredClone(data)) });
  const query = (prefix, filters = [], order = null, max = null) => ({
    where: (field, op, value) => query(prefix, [...filters, { field, value }], order, max),
    orderBy: (field) => query(prefix, filters, field, max),
    limit: (n) => query(prefix, filters, order, n),
    get: async () => {
      let docs = [...store.entries()].filter(([k]) => k.startsWith(prefix + '/') && !k.slice(prefix.length + 1).includes('/'))
        .map(([k, v]) => ({ id: k.split('/').pop(), data: () => structuredClone(v), ref: k }));
      for (const f of filters) docs = docs.filter(d => store.get(d.ref)[f.field] === f.value);
      if (order) docs.sort((a, b) => (store.get(b.ref)[order] ?? 0) - (store.get(a.ref)[order] ?? 0));
      if (max) docs = docs.slice(0, max);
      return { size: docs.length, docs };
    },
  });
  const ref = (path) => ({
    get: async () => snap(path, store.has(path) ? structuredClone(store.get(path)) : undefined),
    set: async (data) => { store.set(path, structuredClone(data)); },
    update: async (data) => { store.set(path, { ...store.get(path), ...structuredClone(data) }); },
    delete: async () => { store.delete(path); },
  });
  const collection = (path) => ({
    doc: (id) => { const p = `${path}/${id}`; return { ...ref(p), collection: (sub) => collection(`${p}/${sub}`) }; },
    where: (f, o, v) => query(path).where(f, o, v),
    orderBy: (f) => query(path).orderBy(f),
    limit: (n) => query(path).limit(n),
    get: () => query(path).get(),
  });
  const db = {
    store,
    collection,
    runTransaction: async (fn) => fn({
      get: (q) => (q.get ? q.get() : ref(q.path ?? '').get()),
      update: (r, d) => r.update(d),
      set: (r, d) => r.set(d),
    }),
  };
  return db;
}

// Validation
assert.throws(() => validatePin({ title: '', link: 'https://a.com', imageUrl: 'https://a.com/x.jpg' }));
assert.throws(() => validatePin({ title: 'x', link: 'http://a.com', imageUrl: 'https://a.com/x.jpg' }), /https/);
assert.throws(() => validatePin({ title: 'x', link: 'javascript:alert(1)', imageUrl: 'https://a.com/x.jpg' }));
assert.throws(() => validatePin({ title: 'x', link: 'https://a.com', imageUrl: 'ftp://a.com/x.jpg' }));
assert.throws(() => validatePin({ title: 'x'.repeat(101), link: 'https://a.com', imageUrl: 'https://a.com/x.jpg' }));
const ok = validatePin({ title: ' Hi ', description: '', link: 'https://a.com/p', imageUrl: 'https://img.a.com/x.jpg' });
assert.equal(ok.title, 'Hi'); assert.equal(ok.description, '');

// Dhaka day key (UTC 2026-11-13 18:30 is 2026-11-14 00:30 in Dhaka)
assert.equal(dayKey(new Date('2026-11-13T18:30:00Z')), '2026-11-14');
assert.equal(dayKey(new Date('2026-11-13T17:59:00Z')), '2026-11-13');

const day = new Date('2026-11-14T06:00:00Z');
const db = fakeDb();
const ids = [];
for (let i = 0; i < 8; i++) ids.push((await addPin(db, 'uid-a', { title: 'T' + i, link: 'https://a.com', imageUrl: 'https://a.com/i.jpg' }, day)).id);
assert.equal(ids.length, 8);

// Cap: 6 per day per user
for (let i = 0; i < DAILY_POST_LIMIT; i++) await markPosted(db, 'uid-a', ids[i], day);
await assert.rejects(markPosted(db, 'uid-a', ids[6], day), err => err.code === 'daily_limit' && err.status === 429);
// Marking an already-posted pin again is a no-op and does not count twice
await markPosted(db, 'uid-a', ids[0], day);
let list = await listQueue(db, 'uid-a', day);
assert.equal(list.postedToday, 6); assert.equal(list.remaining, 0); assert.equal(list.dailyLimit, 6);
assert.equal(list.pinterestCreatorUrl, PINTEREST_PIN_CREATOR_URL);

// Next Dhaka day resets the count
const nextDay = new Date('2026-11-14T20:00:00Z');
await markPosted(db, 'uid-a', ids[6], nextDay);
list = await listQueue(db, 'uid-a', nextDay);
assert.equal(list.postedToday, 1); assert.equal(list.remaining, 5);

// Per-user isolation: uid-b's queue and count are independent
await addPin(db, 'uid-b', { title: 'B', link: 'https://b.com', imageUrl: 'https://b.com/i.jpg' }, day);
const b = await listQueue(db, 'uid-b', day);
assert.equal(b.items.length, 1); assert.equal(b.postedToday, 0);
await assert.rejects(markPosted(db, 'uid-b', ids[1], day), err => err.code === 'not_found');

// Removal is scoped to the owner
await removePin(db, 'uid-a', ids[7]);
assert.equal((await listQueue(db, 'uid-a', day)).items.length, 7);
await assert.rejects(markPosted(db, 'uid-a', 'not-a-uuid', day), err => err.status === 404);

console.log('test-pin-queue: all checks passed');
