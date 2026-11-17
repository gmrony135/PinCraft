import 'server-only';
import {createHash} from 'node:crypto';
import {transaction} from './db.mjs';
import {AutomationError} from './errors.mjs';
import {publicGeneration} from '../ai/public.mjs';
import {httpsURL} from './http.mjs';
import {validJobId} from './images.mjs';
import {accountRef,data,defaultJob,jobRef,readAccount,writeAccount,writeJob} from './firestore.mjs';
import {addLog,ensureSettings} from './repository.mjs';
import {assertOwnedArticleImages,validArticleImageId} from '../publishing/article-images.mjs';
import {readLibraryImage,validLibraryImageId} from '../ai/library-images.mjs';

function text(value,max,{optional=false,lines=true}={}){
 if(typeof value!=='string')throw new AutomationError('invalid_draft','The draft has missing, too-long or invalid text fields.');
 const trimmed=value.trim();if(optional&&!trimmed)return '';
 const hasControl=(source,allowLines)=>[...source].some(character=>{const code=character.charCodeAt(0);return code===127||(code<32&&(!allowLines||![9,10,13].includes(code)));});
 if(!trimmed||value.length>max||hasControl(value,lines))throw new AutomationError('invalid_draft','The draft has missing, too-long or invalid text fields.');
 return trimmed;
}
const strings=(value,count,max)=>Array.isArray(value)&&value.length<=count?value.map(v=>text(v,max)):[];
const isObject=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const exactKeys=(value,allowed)=>isObject(value)&&Object.keys(value).every(key=>allowed.includes(key));
const historyTypes=new Set(['trend_ideas','keywords','plan','quality','pin_artwork','featured_image','pin_info']);
const validHashtag=tag=>typeof tag==='string'&&tag.startsWith('#')&&[...tag.slice(1)].length>=2&&[...tag.slice(1)].length<=50&&![...tag.slice(1)].some(character=>character.charCodeAt(0)<=32||'<>#'.includes(character));
function generationOf(value){return value?.kind==='ai'?publicGeneration(value):null;}
function historyInput(c){
 if(!isObject(c)||Object.keys(c).some(key=>!['historyType','title','topic','category','description','result','imageAssetId','useCase','prompt','categoryId','language','region','trendId','width','height','hashtags','generation'].includes(key))||!historyTypes.has(c.historyType))throw new AutomationError('invalid_draft','Choose a supported AI history item.');
 const historyType=c.historyType,title=text(c.title,240,{lines:false}),topic=text(c.topic||title,160,{lines:false}),category=text(c.category||historyType.replaceAll('_',' '),160,{lines:false});
 const language=c.language===undefined?'en':c.language;if(!['en','bn'].includes(language))throw new AutomationError('invalid_draft','Choose a supported history language.');
 const content={historyType,title,topic,category,language};
 const generation=generationOf(c.generation);if(generation)content.generation=generation;
 if(historyType==='pin_artwork'||historyType==='featured_image'){
  const useCase=historyType==='pin_artwork'?'pin':'featured',size=useCase==='pin'?{width:1000,height:1500}:{width:1200,height:630};
  if(c.useCase!==useCase||!validLibraryImageId(c.imageAssetId)||c.width!==size.width||c.height!==size.height)throw new AutomationError('invalid_draft','The saved artwork reference or dimensions are invalid.');
  content.useCase=useCase;content.imageAssetId=c.imageAssetId;content.width=size.width;content.height=size.height;content.prompt=text(c.prompt,1700,{lines:false});
  if(c.categoryId!==undefined){if(typeof c.categoryId!=='string'||(c.categoryId&&!/^[a-z0-9-]{1,80}$/.test(c.categoryId)))throw new AutomationError('invalid_draft','The artwork category is invalid.');content.categoryId=c.categoryId;}
  content.description=text(c.description||`${size.width} × ${size.height} original AI artwork. Private history only; not published.`,500,{lines:false});
 }
 else if(historyType==='pin_info'){
  if(!validLibraryImageId(c.imageAssetId)||c.useCase!=='pin')throw new AutomationError('invalid_draft','Pinterest Post Info must reference saved Pin artwork.');
  content.useCase='pin';content.imageAssetId=c.imageAssetId;content.prompt=text(c.prompt,1700,{lines:false});content.description=text(c.description,500);content.hashtags=strings(c.hashtags,5,80);
  if(content.hashtags.length<4||content.hashtags.some(tag=>!validHashtag(tag)))throw new AutomationError('invalid_draft','Pinterest Post Info needs four or five valid hashtags.');
 }
 else{
  if(!isObject(c.result))throw new AutomationError('invalid_draft','The generated result is missing.');
  const r=c.result;
  if(historyType==='trend_ideas'){
   if(!exactKeys(r,['trend','region','language','ideas','note'])||!Array.isArray(r.ideas)||r.ideas.length!==3)throw new AutomationError('invalid_draft','The trend idea result is incomplete.');
   content.trend=text(r.trend,160,{lines:false});content.region=text(c.region||r.region,80,{lines:false});
   content.result={trend:content.trend,region:content.region,language:text(r.language||language,2,{lines:false}),ideas:r.ideas.map(idea=>{
    if(!exactKeys(idea,['pinTitle','concept','likelyAudience','contentStrategy','keywordSuggestions'])||!exactKeys(idea.contentStrategy,['format','hook','visualDirection','coreTakeaway','callToAction']))throw new AutomationError('invalid_draft','A trend idea is incomplete.');
    return {pinTitle:text(idea.pinTitle,100,{lines:false}),concept:text(idea.concept,360),likelyAudience:text(idea.likelyAudience,240),contentStrategy:Object.fromEntries(['format','hook','visualDirection','coreTakeaway','callToAction'].map(key=>[key,text(idea.contentStrategy[key],220)])),keywordSuggestions:strings(idea.keywordSuggestions,5,80)};
   }),note:text(r.note,1000)};
  }else if(historyType==='keywords'){
   if(!exactKeys(r,['groups','hashtags','note'])||!Array.isArray(r.groups)||r.groups.length<3||r.groups.length>5)throw new AutomationError('invalid_draft','The keyword result is incomplete.');
   content.result={groups:r.groups.map(group=>{if(!exactKeys(group,['name','intent','keywords'])||!['informational','commercial','transactional','navigational'].includes(group.intent))throw new AutomationError('invalid_draft','A keyword group is invalid.');return {name:text(group.name,100,{lines:false}),intent:group.intent,keywords:strings(group.keywords,8,100)};}),hashtags:strings(r.hashtags,10,80),note:text(r.note,1000)};
   if(content.result.hashtags.length!==10)throw new AutomationError('invalid_draft','The keyword result must keep its ten hashtags.');
  }else if(historyType==='plan'){
   if(!exactKeys(r,['days','note'])||!Array.isArray(r.days)||r.days.length!==7)throw new AutomationError('invalid_draft','The seven-day plan is incomplete.');
   content.result={days:r.days.map((day,index)=>{if(!exactKeys(day,['day','topic','pinTitle','articleTitle','keywords','hashtags'])||day.day!==index+1)throw new AutomationError('invalid_draft','The content plan days are not in order.');return {day:index+1,topic:text(day.topic,160,{lines:false}),pinTitle:text(day.pinTitle,100,{lines:false}),articleTitle:text(day.articleTitle,200,{lines:false}),keywords:strings(day.keywords,5,80),hashtags:strings(day.hashtags,5,80)};}),note:text(r.note,1000)};
  }else if(historyType==='quality'){
   if(!exactKeys(r,['score','summary','checks','improvedTitle','improvedDescription','hashtags','note'])||!Number.isInteger(r.score)||r.score<0||r.score>100||!Array.isArray(r.checks)||r.checks.length<4||r.checks.length>8)throw new AutomationError('invalid_draft','The editorial review result is incomplete.');
   content.result={score:r.score,summary:text(r.summary,1400),checks:r.checks.map(check=>{if(!exactKeys(check,['label','status','detail'])||!['pass','improve','review'].includes(check.status))throw new AutomationError('invalid_draft','An editorial review check is invalid.');return {label:text(check.label,100,{lines:false}),status:check.status,detail:text(check.detail,800)};}),improvedTitle:text(r.improvedTitle,100,{lines:false}),improvedDescription:text(r.improvedDescription,500),hashtags:strings(r.hashtags,10,80),note:text(r.note,1000)};
  }
  content.description=text(c.description||r.note||'AI-generated result saved privately for later review.',1200);
 }
 if(c.trendId!==undefined){if(typeof c.trendId!=='string'||!/^[a-f0-9]{64}$/.test(c.trendId))throw new AutomationError('invalid_draft','The trend reference is invalid.');content.trendId=c.trendId;}
 if(Buffer.byteLength(JSON.stringify(content),'utf8')>100000)throw new AutomationError('invalid_draft','This history item exceeds the private Library size limit.');
 return content;
}

export function draftInput(raw){
 if(!raw||Object.keys(raw).some(k=>!['action','kind','requestKey','content'].includes(k))||!['pin','article','history'].includes(raw.kind)||!validJobId(raw.requestKey)||!raw.content||typeof raw.content!=='object'||Array.isArray(raw.content))throw new AutomationError('invalid_draft','Choose a valid Pin, article or generated-content history item with a unique request key.');
 const c=raw.content;
 if(raw.kind==='history'){
  const content=historyInput(c);return {kind:'history_draft',requestKey:raw.requestKey,topic:content.topic,content,imageUrl:null,destinationUrl:null};
 }
 const title=text(raw.kind==='pin'?(c.titles?.[0]||c.title):c.title,240,{lines:false}),topic=text(c.topic||c.niche||c.category||'Saved draft',160,{lines:false}),category=text(c.category||c.niche||topic,160,{lines:false});
 const imageUrl=c.imageUrl?httpsURL(text(c.imageUrl,2000,{lines:false})).href:null;
 const destinationUrl=c.destinationUrl?httpsURL(text(c.destinationUrl,2000,{lines:false})).href:null;
 let content;
 if(raw.kind==='pin')content={title,titles:strings(c.titles||[title],10,240),description:text(c.description,2400),hashtags:strings(c.hashtags||[],20,80),keywords:strings(c.keywords||[],20,100),category,imagePrompt:text(c.imageIdea?.prompt||c.imagePrompt||'',2000,{optional:true}),...(c.imageIdea&&typeof c.imageIdea==='object'&&!Array.isArray(c.imageIdea)?{imageIdea:Object.fromEntries(['headline','palette','layout','style','prompt'].map(key=>[key,text(c.imageIdea[key]||'',key==='prompt'?2000:300,{optional:true})]))}:{})};
 else{
  if(!Array.isArray(c.sections)||c.sections.length<1||c.sections.length>8)throw new AutomationError('invalid_draft','Save the complete article, including its sections.');
  const sections=c.sections.map(section=>({heading:text(section.heading,240,{lines:false}),paragraphs:strings(section.paragraphs,8,6000),subsections:Array.isArray(section.subsections)?section.subsections.map(sub=>({heading:text(sub.heading,240,{lines:false}),paragraphs:strings(sub.paragraphs,4,6000)})):[]}));if(sections.some(s=>!s.paragraphs.length||s.subsections.some(sub=>!sub.paragraphs.length)))throw new AutomationError('invalid_draft','Article sections need their full paragraph text.');
  const listSection=c.listSection?{heading:text(c.listSection.heading,240),intro:text(c.listSection.intro||'',2000,{optional:true}),items:strings(c.listSection.items,20,1000)}:null;
  const faqs=Array.isArray(c.faqs)?c.faqs.map(item=>({question:text(item.question,260,{lines:false}),answer:text(item.answer,2000)})):[];
  const focusKeyword=text(c.focusKeyword||'',100,{optional:true,lines:false}),secondaryKeywords=strings(c.secondaryKeywords||c.keywords||[],20,120);
  const metaDescription=text(c.metaDescription||'',160,{optional:true,lines:false}),slug=text(c.slug||'',100,{optional:true,lines:false});if(slug&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new AutomationError('invalid_draft','The suggested permalink must use lowercase words joined by hyphens.');
  if(c.imageBriefs!==undefined&&(!Array.isArray(c.imageBriefs)||c.imageBriefs.length!==3))throw new AutomationError('invalid_draft','Keep exactly one cover and two section image briefs.');
  const imageBriefs=Array.isArray(c.imageBriefs)?c.imageBriefs.map((image,index)=>{const role=index===0?'cover':'section',sectionIndex=index===0?null:index===1?0:2;if(image.role!==role||(image.sectionIndex??null)!==sectionIndex)throw new AutomationError('invalid_draft','The article image briefs do not match the cover/section schema.');return {role,sectionIndex,prompt:text(image.prompt,1600,{lines:false}),altText:text(image.altText,300,{lines:false})};}):[];
  if(c.images!==undefined&&(!Array.isArray(c.images)||c.images.length>3))throw new AutomationError('invalid_draft','An article can contain at most three AI image references.');
  const images=Array.isArray(c.images)?c.images.map(image=>{if(!validArticleImageId(image.assetId)||!['cover','section'].includes(image.role))throw new AutomationError('invalid_draft','An article image reference is invalid.');const sectionIndex=image.role==='cover'?null:Number.isInteger(image.sectionIndex)?image.sectionIndex:null;if(image.role==='section'&&(sectionIndex===null||!sections[sectionIndex]))throw new AutomationError('invalid_draft','A section image must be attached to an existing article section.');if(image.role==='cover'&&image.sectionIndex!==null&&image.sectionIndex!==undefined)throw new AutomationError('invalid_draft','A cover image cannot be attached to a section.');return {assetId:image.assetId,role:image.role,sectionIndex,sectionHeading:image.role==='section'?sections[sectionIndex].heading:'',altText:text(image.altText,300,{lines:false})};}):[];
  if(new Set(images.map(image=>image.assetId)).size!==images.length||images.filter(image=>image.role==='cover').length>1||images.filter(image=>image.role==='section').length>2)throw new AutomationError('invalid_draft','The article has duplicate image references or roles.');
  const imageStatus=['complete','incomplete','pending'].includes(c.imageStatus)?c.imageStatus:(images.length===3?'complete':'incomplete');
  if(imageStatus==='complete'&&images.length!==3)throw new AutomationError('invalid_draft','A complete illustrated article needs a cover and two section images.');
  const relatedArticles=Array.isArray(c.relatedArticles)?c.relatedArticles.slice(0,5).map(item=>({...(typeof item.id==='string'&&/^[0-9]{3,40}$/.test(item.id)?{id:item.id}:{}),title:text(item.title,240,{lines:false}),url:httpsURL(text(item.url,2000,{lines:false})).href,...(Number.isFinite(Date.parse(item.publishedAt))?{publishedAt:new Date(item.publishedAt).toISOString()}:{})})):[];
  content={title,category,description:text(c.intro,6000).slice(0,1200),hashtags:[],intro:text(c.intro,6000),sections,listSection,faqs,conclusion:text(c.conclusion,6000),plainText:text(c.plainText,30000),keywords:secondaryKeywords,focusKeyword,secondaryKeywords,metaDescription,slug,imageBriefs,images,imageStatus,imageError:text(c.imageError||'',600,{optional:true}),relatedArticles,wordCount:Number.isInteger(c.wordCount)?c.wordCount:0};
 }
 if(raw.kind==='article'&&c.generation?.kind==='ai'){
  if(content.title.length<50||content.title.length>60||content.metaDescription.length<140||content.metaDescription.length>160||content.faqs.length<3||content.faqs.length>5||content.secondaryKeywords.length<5||content.secondaryKeywords.length>10||content.imageBriefs.length!==3||!content.focusKeyword||!content.slug||content.wordCount<1000||content.wordCount>1600)throw new AutomationError('invalid_draft','The SEO fields, FAQs, image briefs or 1,000–1,600-word article are incomplete.');
 }
 if(c.generation?.kind==='ai')content.generation=publicGeneration(c.generation);
 if(Buffer.byteLength(JSON.stringify(content),'utf8')>100000)throw new AutomationError('invalid_draft','This draft exceeds the private Library size limit.');
 return {kind:raw.kind==='pin'?'pin_draft':'article_draft',requestKey:raw.requestKey,topic,content,imageUrl,destinationUrl};
}

async function verifyDraftAssets(db,userId,draft){
 if(draft.kind==='article_draft'&&draft.content.images?.length)await assertOwnedArticleImages(db,userId,draft.content.images,{required:draft.content.images.length});
 if(draft.kind==='history_draft'&&draft.content.imageAssetId){
  const image=await readLibraryImage(db,draft.content.imageAssetId,{uid:userId});
  if(!image||image.useCase!==draft.content.useCase)throw new AutomationError('invalid_draft','This private artwork does not belong to the signed-in account.');
 }
}
function draftHash(draft){return createHash('sha256').update(JSON.stringify([draft.kind,draft.topic,draft.content,draft.imageUrl,draft.destinationUrl])).digest('hex');}
export async function saveDraft(db,userId,draft,{automationSlotId=null}={}){
 if(automationSlotId!==null&&!/^\d{8}T\d{9}Z$/.test(automationSlotId))throw new AutomationError('invalid_draft','The recurring generation slot was invalid.');
 await verifyDraftAssets(db,userId,draft);await ensureSettings(db,userId);
 const ref=accountRef(db,userId).collection('requests').doc(draft.requestKey),hash=draftHash(draft);
 return transaction(db,async tx=>{
  const s=await readAccount(tx,db,userId),previous=data(await tx.get(ref));
  if(previous){if(previous.kind!==draft.kind||previous.fingerprint!==hash)throw new AutomationError('request_key_reused','This request key already belongs to a different saved draft.',{status:409});return previous.job_id;}
  const topicMetadata=automationSlotId?{source:'recurring_automation',slotId:automationSlotId,label:'AI-generated recurring-automation draft; publication has its own saved Blogger job'}:{source:'user_draft',label:'Your private saved draft — not queued or published'};
  const job=defaultJob(userId,{kind:draft.kind,state:'draft',topic:draft.topic,topic_metadata:topicMetadata,content:draft.content,image_url:draft.imageUrl,destination_url:draft.destinationUrl,request_key:draft.requestKey,scheduled_at:null});
  writeJob(tx,db,s,null,job);writeAccount(tx,db,s);tx.create(ref,{job_id:job.id,kind:draft.kind,fingerprint:hash,created_at:new Date()});
  addLog(db,userId,job.id,'draft_saved','info',`${draft.kind==='pin_draft'?'Pin':draft.kind==='article_draft'?'Article':'Generated result'} saved privately in your Cloud Library. Saving a draft does not authorize, queue or publish it.`,tx);return job.id;
 });
}

export async function archiveDraft(db,userId,draft){
 await verifyDraftAssets(db,userId,draft);await ensureSettings(db,userId);
 const ref=accountRef(db,userId).collection('requests').doc(draft.requestKey),hash=draftHash(draft);
 return transaction(db,async tx=>{
  const s=await readAccount(tx,db,userId),previous=data(await tx.get(ref));
  if(previous){
   if(previous.kind!==draft.kind||!previous.job_id)throw new AutomationError('request_key_reused','This history key already belongs to a different Library item.',{status:409});
   const saved=data(await tx.get(jobRef(db,previous.job_id)));
   if(!saved||saved.user_id!==userId||saved.kind!==draft.kind)throw new AutomationError('not_found','This private Library item could not be verified.',{status:404});
   if(previous.fingerprint===hash)return saved.id;
   if(saved.state!=='draft'||saved.pin_id||saved.blog_id||saved.pin_url||saved.blog_url)throw new AutomationError('history_locked','Published or queued history cannot be overwritten by an auto-save.',{status:409});
   const next={...saved,topic:draft.topic,content:draft.content,image_url:draft.imageUrl,destination_url:draft.destinationUrl,scheduled_at:null,request_key:draft.requestKey};
   writeJob(tx,db,s,saved,next);writeAccount(tx,db,s);tx.update(ref,{fingerprint:hash,updated_at:new Date()});
   addLog(db,userId,saved.id,'draft_updated','info','An existing private Library draft was updated. It was not queued or published.',tx);return saved.id;
  }
  const job=defaultJob(userId,{kind:draft.kind,state:'draft',topic:draft.topic,topic_metadata:{source:'generated_history',historyType:draft.content.historyType||draft.kind,label:'Automatically saved private history — not queued or published'},content:draft.content,image_url:draft.imageUrl,destination_url:draft.destinationUrl,request_key:draft.requestKey,scheduled_at:null});
  writeJob(tx,db,s,null,job);writeAccount(tx,db,s);tx.create(ref,{job_id:job.id,kind:draft.kind,fingerprint:hash,created_at:new Date()});
  addLog(db,userId,job.id,'history_saved','info','Generated content was automatically saved privately in My Library. This does not create a publishing job or authorize an external upload.',tx);return job.id;
 });
}
