// Runs offline with a fake database. Run: node --conditions=react-server scripts/test-ai-provider-metrics.mjs
import assert from 'node:assert/strict';
import { FieldValue } from 'firebase-admin/firestore';
import { aiProviderForHost, recordAIProviderRequest } from '../lib/ai/provider-metrics.mjs';

function fakeDb({ fail = false } = {}) {
  const writes = [];
  return {
    writes,
    collection: name => ({ doc: id => ({ set: async (data, opts) => { if (fail) throw new Error('boom'); writes.push({ collection: name, id, data, opts }); } }) }),
  };
}

const results = [];
function test(name, fn) { try { fn(); results.push([true, name]); } catch (e) { results.push([false, name + ': ' + e.message]); } }
async function atest(name, fn) { try { await fn(); results.push([true, name]); } catch (e) { results.push([false, name + ': ' + e.message]); } }

test('maps only the three tracked provider hosts', () => {
  assert.equal(aiProviderForHost('generativelanguage.googleapis.com'), 'gemini');
  assert.equal(aiProviderForHost('api.groq.com'), 'groq');
  assert.equal(aiProviderForHost('api.cloudflare.com'), 'cloudflare');
  for (const host of ['api.pinterest.com', 'www.googleapis.com', 'constructor', '__proto__', 'toString', 'api.openai.com', '']) assert.equal(aiProviderForHost(host), null, host);
});


await atest('writes an increment for the day document, merged, with the provider field', async () => {
  const db = fakeDb();
  const now = Date.parse('2026-11-19T12:00:00Z'); // 18:00 in Dhaka, same Dhaka day
  assert.equal(await recordAIProviderRequest(db, 'api.groq.com', now), true);
  assert.equal(db.writes.length, 1);
  const w = db.writes[0];
  assert.equal(w.collection, 'pincraft_ai_metrics');
  assert.equal(w.id, '2026-11-19');
  assert.equal(w.opts.merge, true);
  assert.equal(w.data.day, '2026-11-19');
  assert.ok(w.data.groq.isEqual(FieldValue.increment(1)));
  assert.equal(w.data.gemini, undefined);
});

await atest('uses the Dhaka day boundary (23:30 UTC is the next Dhaka day)', async () => {
  const db = fakeDb();
  await recordAIProviderRequest(db, 'generativelanguage.googleapis.com', Date.parse('2026-11-19T23:30:00Z'));
  assert.equal(db.writes[0].id, '2026-11-20');
});

await atest('ignores non-AI hosts without writing', async () => {
  const db = fakeDb();
  assert.equal(await recordAIProviderRequest(db, 'api.pinterest.com'), false);
  assert.equal(db.writes.length, 0);
});

await atest('a failed metrics write returns false and never throws', async () => {
  const db = fakeDb({ fail: true });
  assert.equal(await recordAIProviderRequest(db, 'api.cloudflare.com'), false);
});

const failed = results.filter(([ok]) => !ok);
for (const [ok, name] of results) console.log((ok ? 'PASS ' : 'FAIL ') + name);
console.log(`\n${results.length - failed.length}/${results.length} AI provider metrics checks passed`);
if (failed.length) process.exitCode = 1;
