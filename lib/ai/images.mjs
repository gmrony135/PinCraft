import 'server-only';
import sharp from 'sharp';
import { AutomationError } from '../automation/errors.mjs';
import { requestData, aiSafetyError } from '../automation/http.mjs';
import { imageSettings } from './config.mjs';

const circuits = new Map();
const invalid = () => new AutomationError('invalid_ai_image', 'The image provider did not return a valid, bounded image.', { retryable: true, status: 502 });
export async function normalizeImage(bytes, useCase) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 100 || bytes.length > 7000000) throw invalid();
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!png && !jpeg && !webp) throw invalid();
  const width = useCase === 'pin' ? 1000 : 1200, height = useCase === 'pin' ? 1500 : 630;
  try {
    const pipeline = sharp(bytes, { limitInputPixels: 16000000, animated: false }).rotate();
    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height || meta.width < 256 || meta.height < 256 || meta.width > 4096 || meta.height > 4096 || (meta.pages || 1) > 1) throw invalid();
    let output = await pipeline.clone().resize(width, height, { fit: 'cover', position: 'attention' }).webp({ quality: 82 }).toBuffer();
    if (output.length > 650000) output = await pipeline.clone().resize(width, height, { fit: 'cover', position: 'attention' }).webp({ quality: 62 }).toBuffer();
    if (output.length > 650000) throw invalid();
    return { dataUrl: `data:image/webp;base64,${output.toString('base64')}`, mimeType: 'image/webp', width, height, useCase };
  } catch (error) { if (error instanceof AutomationError) throw error; throw invalid(); }
}
async function cloudflareImage(config, model, input, send) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${model}`;
  const prompt = `${input.prompt}\nOne standalone image, ${input.useCase === 'pin' ? 'vertical 2:3 Pinterest composition, central subject and generous safe margins' : 'wide landscape blog featured composition, central subject'}. No logos, watermarks or lettering.`;
  let body, contentType;
  if (model.endsWith('flux-1-schnell')) { body = JSON.stringify({ prompt: prompt.slice(0, 2048), steps: 4 }); contentType = 'application/json'; }
  else {
    const form = new FormData();
    form.set('prompt', prompt);
    form.set('width', input.useCase === 'pin' ? '768' : '1024');
    form.set('height', input.useCase === 'pin' ? '1152' : '544');
    // REST FLUX.2 requires actual multipart bytes, not a JSON "multipart" key.
    const serialized = new Response(form);
    contentType = serialized.headers.get('content-type'); body = Buffer.from(await serialized.arrayBuffer());
  }
  const response = await send(url, { provider: 'Cloudflare Workers AI', ai: true, method: 'POST', timeout: 20000, format: 'bytes', maxBytes: 9500000, headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': contentType }, body });
  if (!Buffer.isBuffer(response)) throw invalid();
  let bytes = response;
  if (response.toString('utf8', 0, 20).trimStart().startsWith('{')) {
    let data; try { data = JSON.parse(response.toString('utf8')); } catch { throw invalid(); }
    if (aiSafetyError(data)) throw new AutomationError('content_blocked', 'The image provider declined this content. Safety refusals are not retried with another model.', { status: 422 });
    const encoded = data.result?.image;
    if (data.success !== true || typeof encoded !== 'string' || encoded.length > 9400000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw invalid();
    bytes = Buffer.from(encoded, 'base64');
  }
  return normalizeImage(bytes, input.useCase);
}
export async function generateImage(input, { send = requestData, config = imageSettings(), circuit = circuits, now = Date.now } = {}) {
  if (!config) throw new AutomationError('ai_image_setup_required', 'Image AI needs the site owner’s server-only Cloudflare account ID and Workers AI token. No image was simulated.', { status: 503 });
  let attempts = 0;
  for (const [index, model] of config.models.slice(0, 2).entries()) {
    if ((circuit.get(model) || 0) > now()) continue;
    attempts++;
    try {
      const data = await cloudflareImage(config, model, input, send);
      circuit.delete(model);
      return { data, generation: { provider: 'cloudflare', model, fallbackUsed: index > 0, attempts, generatedAt: new Date(now()).toISOString() } };
    } catch (error) {
      if (error.code === 'content_blocked') throw error;
      circuit.set(model, now() + (error.upstreamStatus === 404 ? 3600000 : Math.max(30, error.retryAfterSeconds || 60) * 1000));
    }
  }
  throw new AutomationError('ai_images_unavailable', 'Cloudflare image models are unavailable or have reached a limit. Model fallback cannot overcome an account-wide quota or Cloudflare outage. Wait and retry; no placeholder image was returned.', { status: 503, retryable: true });
}
