import 'server-only';
import { AutomationError } from '../automation/errors.mjs';

// Explicit browser contracts: internal receipts stay on the server, including
// cached results and legacy scheduled content. Never spread generation metadata.
export function publicGeneration(generation) {
  if (!generation || typeof generation !== 'object' || Array.isArray(generation)) return null;
  const date = typeof generation.generatedAt === 'string' ? new Date(generation.generatedAt) : null;
  return {
    kind: 'ai',
    fallbackUsed: generation.fallbackUsed === true,
    generatedAt: date && Number.isFinite(date.getTime()) ? date.toISOString() : null,
  };
}

export function publicAIResult(value) {
  const generation = publicGeneration(value?.generation);
  if (!generation || !value.result || !['pin', 'article', 'keywords', 'plan', 'quality', 'image'].includes(value.task)) {
    throw new AutomationError('invalid_content', 'The AI result could not be confirmed. No offline content was substituted.', { status: 502 });
  }
  return {
    task: value.task,
    requestKey: value.requestKey,
    result: value.result,
    generation,
    ...(value.replayed === true ? { replayed: true } : {}),
  };
}

const CONTENT_FIELDS = ['title', 'titles', 'description', 'hashtags', 'category', 'topic', 'intro', 'sections', 'listSection', 'conclusion', 'plainText', 'keywords', 'wordCount', 'readMinutes', 'imagePrompt', 'imageIdea'];
export function publicLibraryContent(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
  return {
    ...Object.fromEntries(CONTENT_FIELDS.filter(key => Object.hasOwn(content, key)).map(key => [key, content[key]])),
    ...(content.generation ? { generation: publicGeneration(content.generation) } : {}),
  };
}
