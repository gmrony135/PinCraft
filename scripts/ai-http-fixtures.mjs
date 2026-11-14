// Explicit LOCAL PROCESS PRELOAD. Never imported by application code; never
// enabled by an HTTP parameter. Requires the guarded demo Firebase project.
import './automation-http-fixtures.mjs';
import { Agent, getGlobalDispatcher } from 'undici';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { resultForPrompt } from './ai-fixtures.mjs';
if (process.env.GEMINI_API_KEY !== 'isolated-gemini-api-key-fixture' || process.env.GROQ_API_KEY !== 'isolated-groq-api-key-fixture' || process.env.CLOUDFLARE_API_TOKEN !== 'isolated-cloudflare-token-fixture') throw new Error('Refusing AI fixtures with non-synthetic credentials.');
const mock = getGlobalDispatcher();
mock.get('https://generativelanguage.googleapis.com').intercept({ path: /^\/v1beta\/models\/[^/]+:generateContent$/, method: 'POST' }).reply(options => {
  const prompt = JSON.parse(options.body).contents[0].parts[0].text;
  if (prompt.includes('quota fallback fixture')) return { statusCode: 429, data: { error: { status: 'RESOURCE_EXHAUSTED' } } };
  return { statusCode: 200, data: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(resultForPrompt(prompt)) }] } }] } };
}).persist();
mock.get('https://api.groq.com').intercept({ path: '/openai/v1/chat/completions', method: 'POST' }).reply(options => {
  const prompt = JSON.parse(options.body).messages[0].content;
  return { statusCode: 200, data: { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(resultForPrompt(prompt)) } }] } };
}).persist();
const png = await sharp({ create: { width: 512, height: 512, channels: 3, background: '#c9dbbf' } }).png().toBuffer();
mock.get('https://api.cloudflare.com').intercept({ path: /^\/client\/v4\/accounts\/a{32}\/ai\/run\/@cf\/black-forest-labs\/flux-/, method: 'POST' }).reply(200, { success: true, result: { image: png.toString('base64') } }).persist();
console.log('ISOLATED AI TEST SERVER: generation HTTP responses are explicit doubles; budgets, session verification and image decoding remain real.');

// The worker's public-HTTPS image preflight is an explicit image-service double.
// Its real signed Next image endpoint is exercised independently by UI tests.
const pinPng = await sharp({ create: { width: 1000, height: 1500, channels: 3, background: '#eadfd8' } }).png().toBuffer();
mock.get(new URL(process.env.APP_URL).origin).intercept({ path: /^\/api\/automation\/image\/[0-9a-f-]+\?sig=/, method: 'GET' }).reply(200, pinPng, { headers: { 'content-type': 'image/png' } }).persist();

// publicHost uses its own DNS-pinned Agent (correctly bypassing the global
// dispatcher). Double ONLY the canonical signed-image GET in this explicit
// guarded preload, without weakening the production URL/DNS implementation.
const require = createRequire(import.meta.url), agents = new Set([Agent]);
try { agents.add(require('../functions/node_modules/undici').Agent); } catch {}
for (const Type of agents) {
  const dispatch = Type.prototype.dispatch;
  Type.prototype.dispatch = function (options, handler) {
    if (String(options.origin) === new URL(process.env.APP_URL).origin && options.method === 'GET' && /^\/api\/automation\/image\/[0-9a-f-]+\?sig=/.test(options.path)) return mock.get(new URL(process.env.APP_URL).origin).dispatch(options, handler);
    return dispatch.call(this, options, handler);
  };
}
