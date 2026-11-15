import 'server-only';
import { AutomationError } from '../automation/errors.mjs';
import { imageSettings } from './config.mjs';
import { textTask } from './tasks.mjs';
import { managedText } from './managed-text.mjs';
import { reserveAIRequest, finishAIRequest, requestFingerprint } from './usage.mjs';
import {storeArticleImage,readArticleImage} from '../publishing/article-images.mjs';

export async function generateForUser(db, uid, input, dependencies = {}) {
  const { requestKey, ...data } = input;
  const fingerprint = requestFingerprint(data);
  if (input.task !== 'image') return managedText(db, uid, { requestKey, task: input.task, fingerprint, ...textTask(input) }, dependencies);
  if (!imageSettings() && !dependencies.config) throw new AutomationError('ai_image_setup_required', 'Image AI needs server-only Cloudflare configuration. No image was simulated.', { status: 503 });
  const requestNow=typeof dependencies.now==='function'?dependencies.now():Date.now();
  const reservation = await reserveAIRequest(db, uid, { requestKey, task: input.task, fingerprint, kind: 'image' }, {now:requestNow,...(dependencies.limits?{limits:dependencies.limits}:{})});
  const durable= ['article-cover','article-section'].includes(input.useCase);
  if(reservation.cached){
    if(durable&&!await readArticleImage(db,reservation.cached.result?.assetId,{uid}))throw new AutomationError('article_image_missing','The previously generated article image is missing from private storage. It was not replaced or published.');
    return {...reservation.cached,replayed:true};
  }
  let output;
  try {
    const { generateImage } = await import('./images.mjs');output=await generateImage(input,dependencies);
    if(durable){
      const result=await storeArticleImage(db,uid,{requestKey,fingerprint,useCase:input.useCase,generated:output});
      const receipt={task:input.task,requestKey,result,generation:output.generation};
      await finishAIRequest(db,uid,reservation,{result:receipt});return receipt;
    }
  }catch(error){await finishAIRequest(db,uid,reservation,{error});throw error;}
  await finishAIRequest(db,uid,reservation);
  return { task: input.task, requestKey, result: output.data, generation: output.generation };
}
