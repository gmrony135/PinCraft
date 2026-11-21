// Offline. Run: node scripts/test-key-slots.mjs
import assert from 'node:assert/strict';
import { keySlotStatuses, KEY_STATUS_LABEL, KEY_SLOT_COUNT } from '../lib/key-slots.mjs';
import { readFileSync } from 'node:fs';

const find = (rows, provider, slot) => rows.find(p => p.id === provider).slots.find(s => s.slot === slot);
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };

check('no record today: every slot is UNUSED and there are 10 slots per provider', () => {
  const rows = keySlotStatuses(null);
  assert.equal(rows.length, 3);
  for (const p of rows) { assert.equal(p.slots.length, KEY_SLOT_COUNT); assert.ok(p.slots.every(s => s.status === 'UNUSED')); }
});

check('recorded data renders all three statuses: LIMIT FINISHED, USED, UNUSED', () => {
  const day = {
    slots: {
      gemini_1: { calls: 12, limited: 3, lastLimitedAt: new Date('2026-11-20T10:15:00Z') },
      gemini_2: { calls: 7 },
      groq_6: { calls: 2, limited: 1, lastLimitedAt: new Date('2026-11-20T11:00:00Z') },
    },
    configured: { gemini: [1, 2, 3], groq: [6], cloudflare: [] },
  };
  const rows = keySlotStatuses(day);
  assert.deepEqual(find(rows, 'gemini', 1).status, 'LIMIT_FINISHED');
  assert.equal(find(rows, 'gemini', 1).limitHits, 3);
  assert.equal(find(rows, 'gemini', 1).lastLimitedAt, '2026-11-20T10:15:00.000Z');
  assert.equal(find(rows, 'gemini', 2).status, 'USED');
  assert.equal(find(rows, 'gemini', 2).calls, 7);
  assert.equal(find(rows, 'gemini', 3).status, 'UNUSED');
  assert.equal(find(rows, 'groq', 6).status, 'LIMIT_FINISHED');
  assert.equal(KEY_STATUS_LABEL.LIMIT_FINISHED, 'LIMIT FINISHED');
});

check('a slot known to be unconfigured reads NOT SET, not UNUSED', () => {
  const rows = keySlotStatuses({ configured: { gemini: [1] } });
  assert.equal(find(rows, 'gemini', 1).status, 'UNUSED');
  assert.equal(find(rows, 'gemini', 2).status, 'NOT_SET');
});

check('admin view shows no key values: output holds only slot numbers and counts', () => {
  const rows = keySlotStatuses({ slots: { gemini_1: { calls: 1 } }, configured: { gemini: [1] } });
  const text = JSON.stringify(rows);
  assert.doesNotMatch(text, /AIza|gsk_|api[_-]?key|token|account/i);
});

check('admin page renders the per-key section with the status labels', () => {
  const src = readFileSync(new URL('../app/AdminApp.js', import.meta.url), 'utf8');
  assert.ok(src.includes('Per-key AI usage today'));
  assert.ok(src.includes('KEY_STATUS_LABEL'));
});

console.log(`test-key-slots: ${passed} checks passed`);
