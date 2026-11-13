import 'server-only';
import { AutomationError } from '../automation/errors.mjs';
import { requestJSON, aiSafetyError } from '../automation/http.mjs';
import { textCandidates } from './config.mjs';

const circuits = new Map();
const blocked = () => new AutomationError('content_blocked', 'The AI provider declined this content. Rephrase the request; safety refusals are not sent to another provider.', { status: 422 });
const incomplete = () => new AutomationError('invalid_content', 'The AI did not return a complete, valid response.', { retryable: true, status: 502 });
export function parseAIJSON(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 120000) throw incomplete();
  let value;
  try { value = JSON.parse(text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1')); } catch { throw incomplete(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw incomplete();
  if (['content_blocked', 'unsafe_topic'].includes(value.error)) throw blocked();
  return value;
}
async function requestCandidate(candidate, prompt, maxTokens, send) {
  const { provider, key, model, timeout } = candidate;
  if (!['gemini', 'groq', 'openai'].includes(provider) || !/^[A-Za-z0-9._:/-]{1,100}$/.test(model) || typeof key !== 'string') throw incomplete();
  const common = { provider: provider === 'gemini' ? 'Gemini' : provider === 'groq' ? 'Groq' : 'OpenAI', ai: true, method: 'POST', timeout: Math.min(timeout || 18000, 22000), maxBytes: 180000 };
  if (provider === 'gemini') {
    const data = await send(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.replace(/^models\//, ''))}:generateContent`, {
      ...common, headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: maxTokens, temperature: 0.65, ...(model.startsWith('gemini-2.5-flash') ? { thinkingConfig: { thinkingBudget: 0 } } : {}) } }),
    });
    if (data.promptFeedback?.blockReason || data.candidates?.some(item => ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY'].includes(item.finishReason)) || aiSafetyError(data)) throw blocked();
    const candidateResult = data.candidates?.[0];
    if (candidateResult?.finishReason !== 'STOP') throw incomplete();
    return candidateResult.content?.parts?.filter(part => !part.thought).map(part => part.text || '').join('');
  }
  if (provider === 'groq') {
    const data = await send('https://api.groq.com/openai/v1/chat/completions', {
      ...common, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, max_completion_tokens: maxTokens, temperature: 0.65, ...(model.startsWith('openai/gpt-oss-') ? { reasoning_effort: 'low' } : {}) }),
    });
    if (aiSafetyError(data) || data.choices?.[0]?.finish_reason === 'content_filter') throw blocked();
    if (data.choices?.[0]?.finish_reason !== 'stop') throw incomplete();
    return data.choices[0].message?.content;
  }
  const data = await send('https://api.openai.com/v1/responses', {
    ...common, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: prompt, max_output_tokens: maxTokens, text: { format: { type: 'json_object' } } }),
  });
  if (aiSafetyError(data) || data.output?.some(item => item.content?.some(part => part.type === 'refusal'))) throw blocked();
  if (data.status === 'incomplete') throw incomplete();
  return data.output_text || (data.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('');
}
export async function generateText({ prompt, maxTokens = 2200, validate = value => value, candidates = textCandidates(), send = requestJSON, circuit = circuits, now = Date.now }) {
  if (!candidates.length) throw new AutomationError('ai_setup_required', 'Live text AI is not configured. The site owner must add server-only Gemini or Groq credentials. Offline templates are a separate, explicit mode.', { status: 503 });
  const unique = candidates.filter((candidate, index, all) => all.findIndex(item => item.provider === candidate.provider && item.model === candidate.model) === index).slice(0, 3);
  let attempts = 0;
  const failed = [];
  for (const [index, candidate] of unique.entries()) {
    const id = `${candidate.provider}:${candidate.model}`;
    if ((circuit.get(id) || 0) > now()) { failed.push(candidate.provider); continue; }
    attempts++;
    try {
      const text = await requestCandidate(candidate, prompt, Math.min(5000, Math.max(128, maxTokens)), send);
      const result = validate(parseAIJSON(text));
      circuit.delete(id);
      return { data: result, generation: { provider: candidate.provider, model: candidate.model, fallbackUsed: index > 0 || failed.length > 0, attempts, generatedAt: new Date(now()).toISOString() } };
    } catch (error) {
      if (['content_blocked', 'unsafe_topic'].includes(error.code)) throw blocked();
      // Fixed per-instance cooldowns avoid repeatedly hitting a known exhausted
      // provider. Firestore budgets, not this cache, enforce cross-instance caps.
      const cooldown = error.upstreamStatus === 429 ? Math.max(30, error.retryAfterSeconds || 60) : error.upstreamStatus === 404 ? 3600 : [401, 403].includes(error.upstreamStatus) ? 300 : error.code === 'invalid_content' ? 5 : 30;
      circuit.set(id, now() + cooldown * 1000);
      failed.push(candidate.provider);
    }
  }
  throw new AutomationError('ai_unavailable', 'All configured text AI services are unavailable, returned invalid content or reached a limit. Wait and retry, or ask the site owner to check provider quotas and model settings. No offline template was substituted.', { retryable: true, status: 503 });
}
