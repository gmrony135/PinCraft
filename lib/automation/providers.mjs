import 'server-only';
import {manualPinterestMode} from '../publishing/mode.mjs';
import { AutomationError } from './errors.mjs';
import { httpsURL,requestJSON } from './http.mjs';
import { articleHTML,contentPrompt,pinDescription,validateContent } from './content.mjs';
import { textCandidates } from '../ai/config.mjs';
import { generateText } from '../ai/text.mjs';
import { managedText } from '../ai/managed-text.mjs';
import { requestFingerprint } from '../ai/usage.mjs';
const bearer=(token)=>({Authorization:`Bearer ${token}`,'Content-Type':'application/json'});
const pinID=(id)=>typeof id==='string'&&/^\d{5,40}$/.test(id);
const remoteID=(id)=>(typeof id==='string'||typeof id==='number')&&/^[A-Za-z0-9_-]{1,128}$/.test(String(id));
export function aiInput(raw){
  if(!raw||!['managed','openai','gemini','groq'].includes(raw.aiProvider)||Object.keys(raw).some(k=>!['aiProvider','aiKey','model'].includes(k)))throw new AutomationError('invalid_settings','Only an AI provider, API key and model are accepted here. Publishing accounts use OAuth, never pasted tokens or passwords.');
  if(raw.aiProvider==='managed'){if((raw.aiKey&&raw.aiKey!=='')||(raw.model&&raw.model!=='automatic'))throw new AutomationError('invalid_settings','Managed AI uses server credentials and automatic model selection, not a browser-supplied API key.');return {aiProvider:'managed',model:'automatic'};}
  const aiKey=typeof raw.aiKey==='string'?raw.aiKey.trim():'';
  const model=typeof raw.model==='string'?raw.model.trim():'';
  if(!aiKey||aiKey.length>6000||/[\u0000-\u0020\u007f]/.test(aiKey)||!/^[A-Za-z0-9._:/-]{1,100}$/.test(model))throw new AutomationError('invalid_settings','Enter a valid AI API key and model.');
  return {aiProvider:raw.aiProvider,aiKey,model};
}
export async function verifyAI(config,send=requestJSON,context=null){
  if(config.aiProvider==='managed'){
    if(!context?.database||!context.userId||!context.requestKey)throw new AutomationError('ai_setup_required','Managed AI needs an authenticated, budgeted server request.',{status:503});
    const prompt='Return a JSON object with exactly one key, "ready", set to true.';
    const result=await managedText(context.database,context.userId,{requestKey:context.requestKey,task:'verification',fingerprint:requestFingerprint(['verification',prompt]),prompt,maxTokens:256,validate:value=>{if(value.ready!==true)throw new AutomationError('invalid_content','AI verification did not return ready.',{retryable:true});return {ready:true};}},{send});
    return {aiProvider:'managed',model:'automatic',verifiedAt:new Date().toISOString(),verification:{provider:result.generation.provider,model:result.generation.model}};
  }
  const raw=await aiRequest(config,'Return a JSON object with exactly one key, "ready", set to true.',256,send);
  let data;try{data=JSON.parse(raw);}catch{}
  if(data?.ready!==true)throw new AutomationError('connection_failed','AI verification did not succeed. No connection was simulated.');
  return {aiProvider:config.aiProvider,model:config.model,verifiedAt:new Date().toISOString()};
}
async function aiRequest(config, prompt, maxTokens, send) {
  if(config.aiProvider==='groq'){
    const result=await generateText({prompt,maxTokens,send,candidates:[{provider:'groq',key:config.aiKey,model:config.model}],circuit:new Map()});return JSON.stringify(result.data);
  }
  if (config.aiProvider === "openai") {
    const data = await send("https://api.openai.com/v1/responses", { provider: "OpenAI", method: "POST", headers: bearer(config.aiKey), timeout: 80000, body: JSON.stringify({ model: config.model, input: prompt, max_output_tokens: maxTokens, text: { format: { type: "json_object" } } }) });
    const text = data.output_text || (data.output || []).flatMap((item) => item.content || []).filter((item) => item.type === "output_text").map((item) => item.text).join("");
    if (data.status === "incomplete" || !text) throw new AutomationError("invalid_content", "OpenAI did not return a complete response.", { retryable: true });
    return text;
  }
  const model = config.model.replace(/^models\//, "");
  const data = await send(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { provider: "Gemini", method: "POST", headers: { "x-goog-api-key": config.aiKey, "Content-Type": "application/json" }, timeout: 80000, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", maxOutputTokens: maxTokens } }) });
  const candidate = data.candidates?.[0];
  if (!candidate || candidate.finishReason !== "STOP") throw new AutomationError("invalid_content", "Gemini did not return a complete response.", { retryable: true });
  return candidate.content?.parts?.map((part) => part.text || "").join("") || "";
}
export async function generateContent(config, topic, send = requestJSON, metadata = null, context = null) {
  let prompt = contentPrompt(topic,context?.language||'en');
  if (metadata?.source === "google_trends") prompt += " This title comes from a live search-trend feed, NOT a verified news article. Write an evergreen educational guide or thoughtful reflection about the topic. Do not invent match results, current news, dates, quotations, allegations, biographical facts or claims about real people. Do not imply you have read the news. If the title is inappropriate or unsafe to cover without current evidence, return a JSON object with error set to unsafe_topic instead of an article.";
  if(config.aiProvider==='managed'||(context&&textCandidates().length)){
    if(!context?.database||!context.userId||!context.requestKey)throw new AutomationError('ai_setup_required','Managed AI needs an owner-scoped server budget.',{status:503});
    const candidates=config.aiProvider==='managed'?textCandidates():[{provider:config.aiProvider,key:config.aiKey,model:config.model},...textCandidates()];
    const result=await managedText(context.database,context.userId,{requestKey:context.requestKey,task:'automation',fingerprint:requestFingerprint(['automation',topic,prompt]),prompt,maxTokens:4500,validate:value=>{if(value.error==='unsafe_topic')throw new AutomationError('unsafe_topic','This topic needs review. No article was published.');return validateContent(value,topic);}},{send,candidates,...(config.aiProvider==='managed'?{}:{circuit:new Map()})});
    return {...result.result,generation:result.generation};
  }
  const text = await aiRequest(config, prompt, 4500, send);
  let data; try { data = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { throw new AutomationError("invalid_content", "AI returned invalid JSON. Nothing was published.", { retryable: true }); }
  if (data?.error === "unsafe_topic") throw new AutomationError("unsafe_topic", "The AI declined this trend topic. Auto Mode was paused for review; no article was published.");
  return validateContent(data, topic);
}
function articleResult(config,data){
  try{
    if(!remoteID(data?.id))throw new Error('Missing ID');
    const raw=new URL(data.url),expected=httpsURL(config.blogUrl);
    if(raw.hostname!==expected.hostname)throw new Error('Wrong hostname');
    if(raw.protocol==='http:')raw.protocol='https:';
    const url=httpsURL(raw.href);
    if(['DRAFT','SCHEDULED'].includes(data.status)||!Number.isFinite(new Date(data.published).getTime()))throw new Error('Not public');
    return {id:String(data.id),url:url.href};
  }catch{throw new AutomationError('unconfirmed_publication','Blogger did not confirm a public article URL. Check the remote blog before continuing.',{uncertain:true});}
}
export async function publishArticle(config,job,send=requestJSON){
  if(manualPinterestMode())throw new AutomationError('reviewed_publishing_required','Use the reviewed Blogger draft-to-publish runner in this mode. No legacy publication was sent.',{status:409});
  if(!config.blogToken||!/^\d{3,40}$/.test(config.blogId||''))throw new AutomationError('oauth_reconnect_required','Blogger offline authorization and your selected blog are required.');
  const data=await send(`https://www.googleapis.com/blogger/v3/blogs/${config.blogId}/posts?isDraft=false`,{provider:'Blogger publish',mutation:true,method:'POST',headers:bearer(config.blogToken),body:JSON.stringify({kind:'blogger#post',title:job.content.title,content:articleHTML(job.content,job.id),labels:['PinCraft',job.topic]})});
  return articleResult(config,data);
}
export async function postPin(config,job,imageUrl,send=requestJSON){
  if(manualPinterestMode())throw new AutomationError('pinterest_manual_mode','Pinterest is manual in this mode. No API publication was sent.',{status:409});
  const link=httpsURL(job.kind==='queued_pin'?job.destination_url:job.blog_url).href;
  httpsURL(imageUrl);
  const description=job.kind==='queued_pin'?job.content.description:pinDescription(job.content);
  const data=await send('https://api.pinterest.com/v5/pins',{provider:'Pinterest publish',mutation:true,method:'POST',headers:bearer(config.pinterestToken),body:JSON.stringify({board_id:job.board_id||config.pinterestBoardId,title:job.content.title,description,link,alt_text:`${job.topic}: ${job.content.title}`.slice(0,450),media_source:{source_type:'image_url',url:imageUrl}})});
  if(!pinID(data?.id))throw new AutomationError('unconfirmed_pin','Pinterest did not confirm a valid Pin ID. Check your board before continuing.',{uncertain:true});
  return {id:data.id,url:`https://www.pinterest.com/pin/${data.id}/`};
}
export async function verifyRemotePublication(config,job,externalId,send=requestJSON){
  if(!remoteID(externalId))throw new AutomationError('invalid_id','Enter the remote post or Pin ID.');
  if(job.kind==='queued_pin'||job.uncertain_step==='pin'||job.blog_url){
    if(!pinID(externalId))throw new AutomationError('invalid_id','Enter a numeric Pinterest Pin ID.');
    const data=await send(`https://api.pinterest.com/v5/pins/${externalId}`,{provider:'Pinterest verification',headers:bearer(config.pinterestToken)});
    const expected=job.kind==='queued_pin'?job.destination_url:job.blog_url;
    if(data.id!==externalId||data.link!==expected||String(data.board_id)!==(job.board_id||config.pinterestBoardId))throw new AutomationError('verification_failed','That Pin did not confirm the expected board and destination link.');
    return {pin:{id:externalId,url:`https://www.pinterest.com/pin/${externalId}/`}};
  }
  const data=await send(`https://www.googleapis.com/blogger/v3/blogs/${config.blogId}/posts/${encodeURIComponent(externalId)}`,{provider:'Blogger verification',headers:bearer(config.blogToken)});
  if(String(data.id)!==externalId||typeof data.content!=='string'||!data.content.includes(`pincraft-job:${job.id}`))throw new AutomationError('verification_failed','That article did not confirm this job’s publication marker.');
  return {blog:articleResult(config,data)};
}
