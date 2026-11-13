import 'server-only';
import { AutomationError } from '../automation/errors.mjs';
import { imageSettings } from './config.mjs';
import { textTask } from './tasks.mjs';
import { managedText } from './managed-text.mjs';
import { reserveAIRequest, finishAIRequest, requestFingerprint } from './usage.mjs';

export async function generateForUser(db, uid, input, dependencies = {}) {
  const { requestKey, ...data } = input;
  const fingerprint = requestFingerprint(data);
  if (input.task !== 'image') return managedText(db, uid, { requestKey, task: input.task, fingerprint, ...textTask(input) }, dependencies);
  if (!imageSettings() && !dependencies.config) throw new AutomationError('ai_image_setup_required', 'Image AI needs server-only Cloudflare configuration. No image was simulated.', { status: 503 });
  const reservation = await reserveAIRequest(db, uid, { requestKey, task: input.task, fingerprint, kind: 'image' });
  let output;
  try { const { generateImage } = await import('./images.mjs'); output = await generateImage(input, dependencies); }
  catch (error) { await finishAIRequest(db, uid, reservation, { error }); throw error; }
  await finishAIRequest(db, uid, reservation);
  return { task: input.task, requestKey, result: output.data, generation: output.generation };
}
