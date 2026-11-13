// Explicit LOCAL PROCESS PRELOAD. Never imported by application code; never
// enabled by an HTTP parameter. Requires the guarded demo Firebase project.
import './automation-http-fixtures.mjs';
import { getGlobalDispatcher } from 'undici';
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
