import { apiError, json, readBody, sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { archiveDraft, draftInput } from '@/lib/automation/drafts.mjs';
import { generatePinPostInfo, resolveSavedPinPostInfoInput } from '@/lib/ai/pin-post-info.mjs';
import { publicAIResult, publicGeneration } from '@/lib/ai/public.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  try {
    const user = await sessionUser(request, true), body = await readBody(request, 64_000), db = getDatabase();
    const input = await resolveSavedPinPostInfoInput(db, user.id, body);
    const result = await generatePinPostInfo(db, user.id, input);
    let library = { saved: false };
    if (body.imageAssetId) {
      const content = {
        historyType: 'pin_info',
        title: result.result.title,
        topic: body.topic || result.result.title,
        category: 'Pinterest Post Info',
        language: body.language || 'en',
        imageAssetId: body.imageAssetId,
        useCase: 'pin',
        prompt: body.prompt,
        description: result.result.description,
        hashtags: result.result.hashtags,
        generation: publicGeneration(result.generation),
      };
      try {
        const draft = draftInput({ action: 'archive', kind: 'history', requestKey: result.requestKey, content });
        library = { saved: true, id: await archiveDraft(db, user.id, draft) };
      } catch {
        // Preserve the confirmed Post Info result; the client can retry the
        // same private history key without repeating the image analysis call.
      }
    }
    return json(publicAIResult({ ...result, library }));
  } catch (error) { return apiError(error); }
}
