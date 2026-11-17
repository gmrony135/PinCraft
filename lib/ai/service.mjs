import 'server-only';
import { AutomationError } from '../automation/errors.mjs';
import { imageSettings } from './config.mjs';
import { textTask } from './tasks.mjs';
import { managedText } from './managed-text.mjs';
import { reserveAIRequest, finishAIRequest, requestFingerprint } from './usage.mjs';
import { storeArticleImage, readArticleImage } from '../publishing/article-images.mjs';
import { archiveDraft, draftInput } from '../automation/drafts.mjs';
import { publicGeneration } from './public.mjs';
import { readLibraryImage, storeLibraryImage } from './library-images.mjs';

async function saveHistory(db, uid, kind, content, requestKey) {
  try {
    const draft = draftInput({ action: 'archive', kind, content, requestKey });
    return { saved: true, id: await archiveDraft(db, uid, draft) };
  } catch {
    // Keep a verified AI result visible even if the separate Library write
    // cannot be confirmed; the client can retry the same idempotent archive.
    return { saved: false };
  }
}

function textHistory(input, generated) {
  const generation = publicGeneration(generated.generation);
  if (input.task === 'pin' || input.task === 'article') {
    return { kind: input.task, content: { ...generated.result, generation } };
  }
  const topic = input.topic || input.title || 'Content review';
  const title = input.task === 'keywords' ? `SEO keywords for ${topic}`
    : input.task === 'plan' ? `7-day content plan for ${topic}`
      : `Editorial review${input.topic ? `: ${input.topic}` : ''}`;
  return {
    kind: 'history',
    content: {
      historyType: input.task,
      title,
      topic: input.topic || title,
      category: input.task === 'keywords' ? 'SEO & hashtags' : input.task === 'plan' ? 'Content plan' : 'Content review',
      language: input.language || 'en',
      result: generated.result,
      generation,
    },
  };
}

function imageHistory(input, asset, generation) {
  const topic = String(input.topic || input.prompt).trim().slice(0, 160);
  const pin = input.useCase === 'pin';
  return {
    kind: 'history',
    content: {
      historyType: pin ? 'pin_artwork' : 'featured_image',
      title: `${pin ? 'Pin artwork' : 'Featured image'} — ${topic}`,
      topic,
      category: pin ? 'Pinterest artwork' : 'Blog featured image',
      language: input.language || 'en',
      imageAssetId: asset.assetId,
      useCase: input.useCase,
      prompt: input.prompt,
      categoryId: input.categoryId || '',
      width: asset.width,
      height: asset.height,
      generation: publicGeneration(generation),
    },
  };
}

export async function generateForUser(db, uid, input, dependencies = {}) {
  const { requestKey, ...data } = input;
  const fingerprint = requestFingerprint(data);
  if (input.task !== 'image') {
    const generated = await managedText(db, uid, { requestKey, task: input.task, fingerprint, ...textTask(input) }, dependencies);
    const history = textHistory(input, generated);
    const library = await saveHistory(db, uid, history.kind, history.content, generated.requestKey);
    return { ...generated, library };
  }

  if (!imageSettings() && !dependencies.config) throw new AutomationError('ai_image_setup_required', 'Image AI needs server-only Cloudflare configuration. No image was simulated.', { status: 503 });
  const requestNow = typeof dependencies.now === 'function' ? dependencies.now() : Date.now();
  const reservation = await reserveAIRequest(db, uid, { requestKey, task: input.task, fingerprint, kind: 'image' }, { now: requestNow, ...(dependencies.limits ? { limits: dependencies.limits } : {}) });
  const articleImage = ['article-cover', 'article-section'].includes(input.useCase);
  const libraryImage = ['pin', 'featured'].includes(input.useCase);

  if (reservation.cached) {
    let result = reservation.cached.result;
    if (articleImage) {
      if (!await readArticleImage(db, result?.assetId, { uid })) throw new AutomationError('article_image_missing', 'The previously generated article image is missing from private storage. It was not replaced or published.');
    } else if (libraryImage) {
      const stored = await readLibraryImage(db, result?.assetId, { uid });
      if (!stored) throw new AutomationError('library_image_missing', 'The previously generated artwork is missing from private storage. No replacement image was requested.');
      result = { ...result, dataUrl: `data:image/webp;base64,${stored.bytes.toString('base64')}` };
    }
    const library = libraryImage
      ? await saveHistory(db, uid, 'history', imageHistory(input, reservation.cached.result, reservation.cached.generation), requestKey)
      : undefined;
    return { ...reservation.cached, result, ...(library ? { library } : {}), replayed: true };
  }

  let output;
  try {
    const { generateImage } = await import('./images.mjs');
    output = await generateImage(input, dependencies);
    if (articleImage) {
      const result = await storeArticleImage(db, uid, { requestKey, fingerprint, useCase: input.useCase, generated: output });
      const receipt = { task: input.task, requestKey, result, generation: output.generation };
      await finishAIRequest(db, uid, reservation, { result: receipt });
      return receipt;
    }
    if (libraryImage) {
      const asset = await storeLibraryImage(db, uid, { requestKey, fingerprint, useCase: input.useCase, generated: output });
      const receipt = { task: input.task, requestKey, result: asset, generation: output.generation };
      await finishAIRequest(db, uid, reservation, { result: receipt });
      const history = imageHistory(input, asset, output.generation);
      const library = await saveHistory(db, uid, history.kind, history.content, requestKey);
      return { ...receipt, result: { ...asset, dataUrl: output.data.dataUrl }, library };
    }
    throw new AutomationError('invalid_ai_request', 'Choose a supported private image use.');
  } catch (error) {
    await finishAIRequest(db, uid, reservation, { error });
    throw error;
  }
}
