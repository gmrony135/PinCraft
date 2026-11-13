// Opt-in ONLY: three small real provider requests, never part of CI/emulator
// tests. Uses existing provider quota; does not enable billing or buy credits.
import { mkdir, writeFile } from 'node:fs/promises';
import { generateText } from '../lib/ai/text.mjs';
import { textTask, aiInput } from '../lib/ai/tasks.mjs';
import { generateImage } from '../lib/ai/images.mjs';
import { textCandidates, imageSettings } from '../lib/ai/config.mjs';
import { requestJSON } from '../lib/automation/http.mjs';
import { randomUUID } from 'node:crypto';
if (process.env.PINCRAFT_ALLOW_LIVE_AI_SMOKE !== '1' || process.env.FIREBASE_EMULATORS === '1') throw new Error('Live provider smoke requires a separate explicit opt-in; never use the emulator environment or run this automatically.');
const results = [], candidates = textCandidates();
for (const [provider, task, fields] of [['gemini', 'pin', { topic: 'A thoughtful small balcony garden' }], ['groq', 'article', { title: 'A Small Balcony Garden That Fits Your Week', topic: 'Balcony gardening' }]]) {
  let upstream = null;
  const send = async (url, options) => { try { return await requestJSON(url, options); } catch (error) { upstream = { code: error.code, status: error.upstreamStatus }; throw error; } };
  try {
    const input = aiInput({ task, ...fields, requestKey: randomUUID(), consent: true });
    const result = await generateText({ ...textTask(input), candidates: candidates.filter(candidate => candidate.provider === provider).slice(0, 1), circuit: new Map(), send });
    results.push({ provider, task, passed: true, model: result.generation.model, attempts: result.generation.attempts, ...(task === 'pin' ? { titles: result.data.titles.length, hashtags: result.data.hashtags.length } : { words: result.data.wordCount, sections: result.data.sections.length }) });
  } catch (error) { results.push({ provider, task, passed: false, code: error.code, upstream }); }
  console.log(JSON.stringify(results.at(-1)));
}
try {
  const config = imageSettings(); if (!config) throw new Error('Missing server configuration');
  const result = await generateImage({ prompt: 'A quiet sunlit balcony with a leafy green houseplant and a terracotta pot, natural editorial photography.', useCase: 'featured' }, { config: { ...config, models: ['@cf/black-forest-labs/flux-2-klein-4b'] }, circuit: new Map() });
  const bytes = Buffer.from(result.data.dataUrl.split(',')[1], 'base64');
  await writeFile('.cache/cloudflare-flux2-inference-test.webp', bytes, { mode: 0o600 });
  results.push({ provider: 'cloudflare', task: 'featured-image', passed: true, model: result.generation.model, attempts: result.generation.attempts, width: result.data.width, height: result.data.height, bytes: bytes.length });
} catch (error) { results.push({ provider: 'cloudflare', task: 'featured-image', passed: false, code: error.code || 'configuration_or_network_error' }); }
console.log(JSON.stringify(results.at(-1)));
await mkdir('.shots', { recursive: true });
await writeFile('.shots/live-ai-provider-smoke.json', JSON.stringify({ checkedAt: new Date().toISOString(), mode: 'Three small real provider inference requests using supplied credentials. Direct adapter smoke only: no production Firebase session/Firestore, deployed rules, genuine Google consent or live publication is proven. Uses existing quota; no paid plan, upgrade or purchase was performed.', results }, null, 2));
if (results.some(result => !result.passed)) process.exitCode = 1;
