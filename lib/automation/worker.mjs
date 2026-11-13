import 'server-only';
import { decryptCredentials } from './vault.mjs';
import { requestData } from './http.mjs';
import { pinImageURL } from './images.mjs';
import { chooseTopic } from './trends.mjs';
import { generateContent,postPin,publishArticle } from './providers.mjs';
import { getAccessToken,invalidateAuthorization,maintainPinterestTokens } from './oauth-tokens.mjs';
import { verifyPublicPinImage } from './queue.mjs';
import { addLog,assertActive,beginMutation,checkpoint,claimJob,completeJob,failJob,recoverInterrupted,workerHeartbeat } from './repository.mjs';
import { AutomationError } from './errors.mjs';
export async function verifyPinImage(url,send=requestData){
  const data=await send(url,{provider:'Pin image service',publicHost:true,format:'bytes',timeout:20000});
  const png=Buffer.isBuffer(data)&&data.length>24&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(!png||data.readUInt32BE(16)!==1000||data.readUInt32BE(20)!==1500)throw new AutomationError('image_unavailable','The public image service did not confirm a 1000×1500 PNG. Nothing new was published.',{retryable:true});
}
export async function runJob(database,job,dependencies={}){
  const send=dependencies.send||requestData;
  const image=dependencies.imageURL||pinImageURL;
  const access=dependencies.accessToken||((provider)=>getAccessToken(database,job.user_id,provider,{send}));
  let publishingProvider=null,publishingAccess=null;
  try{
    await assertActive(database,job);
    const queued=job.kind==='queued_pin';
    const config=queued?{}:decryptCredentials(job.user_id,job.account.credentials);
    if(!queued){
      if(!job.topic_metadata){const selected=await chooseTopic(job.account,job,database,send);await checkpoint(database,job,'pending',{topic:selected.topic,topic_metadata:selected.metadata});await addLog(database,job.user_id,job.id,'topic_selected','info',`Topic selected: ${job.topic}. Source: ${selected.metadata.label}.`);}
      if(!job.content){await checkpoint(database,job,'generating');const content=await generateContent(config,job.topic,send,job.topic_metadata);await checkpoint(database,job,'generated',{content});await addLog(database,job.user_id,job.id,'content_saved','success','Pin title, description, hashtags and full SEO article generated and saved to the cloud Library.');}
    }
    await assertActive(database,job);
    const imageUrl=queued?job.image_url:image(job.id);
    if(dependencies.verifyImage)await dependencies.verifyImage(imageUrl);
    else if(queued)await verifyPublicPinImage(imageUrl,send);
    else await verifyPinImage(imageUrl,send);
    if(!queued&&!job.blog_url){
      publishingProvider='blogger';publishingAccess=await access('blogger');
      config.blogToken=publishingAccess.accessToken; // transient only
      config.blogId=job.blog_target_id;config.blogUrl=job.blog_target_url;
      await beginMutation(database,job,'publishing');
      const published=await publishArticle(config,job,send);
      await checkpoint(database,job,'blog_published',{blog_id:published.id,blog_url:published.url});
      // Never serialize this transient config; it contains a Blogger access token.
      delete config.blogToken;
      await addLog(database,job.user_id,job.id,'article_published','success','Article Published — Blogger confirmed the public article URL.');
    }
    publishingProvider='pinterest';publishingAccess=await access('pinterest');
    config.pinterestToken=publishingAccess.accessToken;
    config.pinterestBoardId=job.board_id;
    await beginMutation(database,job,'posting');
    const pin=await postPin(config,job,imageUrl,send);
    await completeJob(database,job,pin);
    return {status:'success'};
  }catch(error){if(error.code==='provider_auth'&&publishingProvider&&publishingAccess)await invalidateAuthorization(database,job.user_id,publishingProvider,publishingAccess);await failJob(database,job,error);return {status:error.code==='paused'?'paused':error.uncertain?'attention':'stopped'};}
}
export async function runWorker(database,options={}){
  await workerHeartbeat(database,'start',options.executionId||null);
  try{
    await recoverInterrupted(database);
    // Refresh maintenance also runs for paused connected accounts, so continuous
    // Pinterest refresh grants are renewed before their provider expiry.
    const maintenance=await maintainPinterestTokens(database,{send:options.dependencies?.send||requestData});
    const results=[],limit=Math.min(30,Math.max(1,options.maxJobs||3)),deadline=Date.now()+120000;
    while(results.length<limit&&Date.now()<deadline){
      const batch=await Promise.all(Array.from({length:Math.min(3,limit-results.length)},async()=>{const job=await claimJob(database);return !job?{status:'idle'}:job.skipped?{status:'skipped'}:runJob(database,job,options.dependencies);}));
      results.push(...batch);if(batch.every(result=>result.status==='idle'))break;
    }
    await workerHeartbeat(database,'ok');
    return {processed:results.filter(r=>!['idle','skipped'].includes(r.status)).length,completed:results.filter(r=>r.status==='success').length,stopped:results.filter(r=>['stopped','attention'].includes(r.status)).length,tokenMaintenance:maintenance};
  }catch{try{await workerHeartbeat(database,'error');}catch{}throw new AutomationError('worker_unavailable','The server worker could not persist its result. The next healthy run will recover expired leases without blindly reposting.',{status:503});}
}
