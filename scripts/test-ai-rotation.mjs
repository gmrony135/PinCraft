// Offline key-rotation checks. No provider is called and no real key is used: every key here is a fake value
// that exists only in this process. Run: node --conditions=react-server scripts/test-ai-rotation.mjs
import assert from 'node:assert/strict';
import { AutomationError } from '../lib/automation/errors.mjs';
import { textCandidates, configuredKeySlots } from '../lib/ai/config.mjs';
import { generateText } from '../lib/ai/text.mjs';
import { generateVisionPostInfo } from '../lib/ai/pin-post-info.mjs';
import { recordAIProviderRequest, recordAISlotLimit } from '../lib/ai/provider-metrics.mjs';

const fakeKey = (provider, n) => `fake-${provider}-key-${n}-0000000000`;
const fakeAccount = n => n.toString(16).padStart(32, '0');
const ok = { ok: true };
const PREFIXES = ['GEMINI_', 'GROQ_', 'CLOUDFLARE_', 'AI_'];
const saved = { ...process.env };

function setEnv({ gemini = 0, groq = 0, cloudflare = 0 } = {}) {
  for (const name of Object.keys(process.env)) if (PREFIXES.some(p => name.startsWith(p))) delete process.env[name];
  for (let n = 1; n <= gemini; n++) process.env[n === 1 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${n}`] = fakeKey('gemini', n);
  for (let n = 1; n <= groq; n++) process.env[n === 1 ? 'GROQ_API_KEY' : `GROQ_API_KEY_${n}`] = fakeKey('groq', n);
  for (let n = 1; n <= cloudflare; n++) {
    process.env[n === 1 ? 'CLOUDFLARE_TEXT_API_TOKEN' : `CLOUDFLARE_TEXT_API_TOKEN_${n}`] = fakeKey('cloudflare', n);
    process.env[n === 1 ? 'CLOUDFLARE_TEXT_ACCOUNT_ID' : `CLOUDFLARE_TEXT_ACCOUNT_ID_${n}`] = fakeAccount(n);
  }
}
const keyOf = (provider, opts) => provider === 'gemini' ? opts.headers['x-goog-api-key'] : opts.headers.Authorization.replace('Bearer ', '');
const providerOf = url => url.includes('generativelanguage') ? 'gemini' : url.includes('api.groq.com') ? 'groq' : 'cloudflare';

// A fake transport. `failing` keys answer with HTTP 429 (quota). Everything else answers with a valid JSON result.
function fakeSend(failing = new Set()) {
  const calls = [];
  const send = async (url, opts) => {
    const provider = providerOf(url), key = keyOf(provider, opts);
    calls.push({ provider, key });
    if (failing.has(key)) throw new AutomationError('provider_request', 'quota', { status: 422, upstreamStatus: 429 });
    if (provider === 'gemini') return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(ok) }] } }] };
    if (provider === 'groq') return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(ok) } }] };
    return { success: true, result: { response: JSON.stringify(ok) } };
  };
  return { send, calls };
}
const failing = (provider, from, to) => new Set(Array.from({ length: to - from + 1 }, (_, i) => fakeKey(provider, from + i)));
const sentKeys = calls => new Set(calls.map(c => c.key));

const results = [];
async function test(name, fn) {
  try { await fn(); results.push([true, name]); }
  catch (error) { results.push([false, `${name}: ${error.message}`]); }
}

await test('(c) key slots 6 to 10 are read for every provider', async () => {
  setEnv({ gemini: 10, groq: 10, cloudflare: 10 });
  const rows = textCandidates();
  const gemini = rows.filter(r => r.provider === 'gemini');
  const groq = rows.filter(r => r.provider === 'groq' && r.model === 'openai/gpt-oss-120b');
  const cloudflare = rows.filter(r => r.provider === 'cloudflare');
  assert.equal(gemini.length, 10);
  assert.equal(groq.length, 10);
  assert.equal(cloudflare.length, 10);
  for (const slot of [6, 7, 8, 9, 10]) {
    assert.ok(gemini.some(r => r.key === fakeKey('gemini', slot)), `gemini slot ${slot}`);
    assert.ok(groq.some(r => r.key === fakeKey('groq', slot)), `groq slot ${slot}`);
    assert.ok(cloudflare.some(r => r.key === fakeKey('cloudflare', slot) && r.accountId === fakeAccount(slot)), `cloudflare slot ${slot}`);
  }
  assert.deepEqual(configuredKeySlots(), { gemini: [1,2,3,4,5,6,7,8,9,10], groq: [1,2,3,4,5,6,7,8,9,10], cloudflare: [1,2,3,4,5,6,7,8,9,10] });
});

await test('(c) an 11th key is never read: the limit is ten slots per provider', async () => {
  setEnv({ gemini: 11 });
  assert.equal(textCandidates().filter(r => r.provider === 'gemini').length, 10);
});

await test('(a) when keys 1 to 9 return 429, the 10th Gemini key is tried and succeeds (every rotation position)', async () => {
  setEnv({ gemini: 10 });
  const maxCalls = [];
  // The rotation offset moves each call, so the one working key sits in every position across ten runs.
  for (let run = 0; run < 10; run++) {
    const { send, calls } = fakeSend(failing('gemini', 1, 9));
    const out = await generateText({ prompt: 'p', candidates: textCandidates(), send, circuit: new Map(), now: () => 1_000 });
    assert.equal(out.generation.provider, 'gemini');
    assert.equal(out.generation.fallbackUsed, calls.length > 1, 'fallback is reported exactly when an earlier key failed');
    assert.equal(calls.at(-1).key, fakeKey('gemini', 10), 'the working key answered last');
    assert.equal(sentKeys(calls).size, calls.length, 'no key is attempted twice');
    maxCalls.push(calls.length);
  }
  assert.ok(Math.max(...maxCalls) > 6, `a working key past the old six-attempt cap was reached (max ${Math.max(...maxCalls)})`);
});

await test('(a) with 7 of 8 keys failing, the one working key is always reached', async () => {
  setEnv({ gemini: 8 });
  for (let run = 0; run < 8; run++) {
    const { send } = fakeSend(failing('gemini', 1, 7));
    const out = await generateText({ prompt: 'p', candidates: textCandidates(), send, circuit: new Map(), now: () => 1_000 });
    assert.equal(out.data.ok, true);
  }
});

await test('(b) when every Gemini key fails, Groq is tried and succeeds', async () => {
  setEnv({ gemini: 10, groq: 2 });
  const { send, calls } = fakeSend(failing('gemini', 1, 10));
  const out = await generateText({ prompt: 'p', candidates: textCandidates(), send, circuit: new Map(), now: () => 1_000 });
  assert.equal(out.generation.provider, 'groq');
  assert.ok(calls.some(c => c.provider === 'groq'));
});

await test('(b) when Gemini and Groq both fail, Cloudflare is tried and succeeds', async () => {
  setEnv({ gemini: 3, groq: 3, cloudflare: 2 });
  const failSet = new Set([...failing('gemini', 1, 3), ...failing('groq', 1, 3)]);
  const { send } = fakeSend(failSet);
  const out = await generateText({ prompt: 'p', candidates: textCandidates(), send, circuit: new Map(), now: () => 1_000 });
  assert.equal(out.generation.provider, 'cloudflare');
});

await test('when every key of every provider fails, the error says so and no offline template is substituted', async () => {
  setEnv({ gemini: 2, groq: 2, cloudflare: 2 });
  const failSet = new Set([...failing('gemini', 1, 2), ...failing('groq', 1, 2)]);
  const cf = new Set([fakeKey('cloudflare', 1), fakeKey('cloudflare', 2)]);
  const { send } = fakeSend(new Set([...failSet, ...cf]));
  await assert.rejects(generateText({ prompt: 'p', candidates: textCandidates(), send, circuit: new Map(), now: () => 1_000 }), e => e.code === 'ai_rate_limited');
});

// Explicit candidate order, so the cooled keys are really reached first.
const geminiRows = n => Array.from({ length: n }, (_, i) => ({ provider: 'gemini', model: 'gemini-3.1-flash-lite', key: fakeKey('gemini', i + 1), slot: i + 1, timeout: 18000 }));

await test('a key in cooldown is skipped without an attempt, so fresh keys are reached', async () => {
  const circuit = new Map();
  const rows = geminiRows(6);
  const first = fakeSend(failing('gemini', 1, 5));
  const firstOut = await generateText({ prompt: 'p', candidates: rows, send: first.send, circuit, now: () => 1_000 });
  assert.equal(firstOut.generation.provider, 'gemini');
  assert.equal(first.calls.length, 6, 'keys 1 to 5 failed, key 6 answered');
  const second = fakeSend(new Set());
  const out = await generateText({ prompt: 'p', candidates: rows, send: second.send, circuit, now: () => 1_000 });
  assert.equal(out.data.ok, true);
  assert.deepEqual([...sentKeys(second.calls)], [fakeKey('gemini', 6)], 'only the fresh key was called');
});

await test('image analysis (Post Info) moves to the next Gemini key after a quota error', async () => {
  const { send, calls } = fakeSend(failing('gemini', 1, 1));
  await assert.rejects(generateVisionPostInfo({
    prompt: 'p', topic: 't', language: 'en', imageBytes: Buffer.from('x'), trend: null, variation: 'v',
    send, candidates: geminiRows(3), now: 1_000,
  }), e => e.code === 'invalid_content');
  assert.deepEqual([...sentKeys(calls)].sort(), [fakeKey('gemini', 1), fakeKey('gemini', 2), fakeKey('gemini', 3)].sort(), 'every Gemini key was attempted');
});

await test('per-key metrics record calls, limit hits and last-hit time, and never store a key value', async () => {
  const writes = [];
  const db = { collection: () => ({ doc: () => ({ set: async (data) => { writes.push(data); } }) }) };
  const slot = { id: 'gemini_4', provider: 'gemini', slot: 4, configured: [1, 2, 3, 4] };
  assert.equal(await recordAIProviderRequest(db, 'generativelanguage.googleapis.com', 1_000, slot), true);
  assert.equal(await recordAISlotLimit(db, slot, 1_000), true);
  assert.ok(writes[0].slots.gemini_4.calls, 'call counter for slot 4');
  assert.deepEqual(writes[0].configured, { gemini: [1, 2, 3, 4] });
  assert.ok(writes[1].slots.gemini_4.limited, 'limit counter for slot 4');
  assert.ok(writes[1].slots.gemini_4.lastLimitedAt instanceof Date);
  assert.doesNotMatch(JSON.stringify(writes), /fake-gemini-key|x-goog|Bearer/);
  assert.equal(await recordAISlotLimit(db, { id: 'gemini_11', provider: 'gemini' }, 1_000), false, 'slot 11 is refused');
});

Object.assign(process.env, saved);
for (const name of Object.keys(process.env)) if (!(name in saved)) delete process.env[name];

let failedCount = 0;
for (const [ok2, name] of results) { if (ok2) console.log(`ok - ${name}`); else { failedCount++; console.log(`not ok - ${name}`); } }
if (failedCount) { console.log(`test-ai-rotation: ${failedCount} failed`); process.exit(1); }
console.log(`test-ai-rotation: ${results.length} checks passed`);
