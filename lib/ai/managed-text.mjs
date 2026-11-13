import 'server-only';
import { AutomationError } from '../automation/errors.mjs';
import { textCandidates } from './config.mjs';
import { generateText } from './text.mjs';
import { reserveAIRequest, finishAIRequest } from './usage.mjs';

export async function managedText(db, uid, { requestKey, task, fingerprint, prompt, maxTokens, validate }, dependencies = {}) {
  if (!textCandidates().length && !dependencies.candidates?.length) throw new AutomationError('ai_setup_required', 'Live text AI is not configured. Add server-only Gemini or Groq credentials.', { status: 503 });
  const reservation = await reserveAIRequest(db, uid, { requestKey, task, fingerprint, kind: 'text' });
  if (reservation.cached) return { ...reservation.cached, replayed: true };
  let output;
  try { output = await generateText({ prompt, maxTokens, validate, ...dependencies }); }
  catch (error) { await finishAIRequest(db, uid, reservation, { error }); throw error; }
  const result = { task, requestKey, result: output.data, generation: output.generation };
  await finishAIRequest(db, uid, reservation, { result });
  return result;
}
