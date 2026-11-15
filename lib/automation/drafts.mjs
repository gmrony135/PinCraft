import 'server-only';
import {createHash} from 'node:crypto';
import {transaction} from './db.mjs';
import {AutomationError} from './errors.mjs';
import {publicGeneration} from '../ai/public.mjs';
import {httpsURL} from './http.mjs';
import {validJobId} from './images.mjs';
import {accountRef,data,defaultJob,readAccount,writeAccount,writeJob} from './firestore.mjs';
import {addLog,ensureSettings} from './repository.mjs';
import {assertOwnedArticleImages,validArticleImageId} from '../publishing/article-images.mjs';
function text(value,max,{optional=false,lines=true}={}){if(optional&&(value===undefined||value===null||value===''))return '';if(typeof value!=='string'||!value.trim()||value.length>max||(lines?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(value))throw new AutomationError('invalid_draft','The draft has missing, too-long or invalid text fields.');return value.trim();}
const strings=(value,count,max)=>Array.isArray(value)&&value.length<=count?value.map(v=>text(v,max)):[];
export function draftInput(raw){
 if(!raw||Object.keys(raw).some(k=>!['action','kind','requestKey','content'].includes(k))||!['pin','article'].includes(raw.kind)||!validJobId(raw.requestKey)||!raw.content||typeof raw.content!=='object'||Array.isArray(raw.content))throw new AutomationError('invalid_draft','Choose a valid Pin or article draft with a unique request key.');
 const c=raw.content,title=text(raw.kind==='pin'?(c.titles?.[0]||c.title):c.title,240,{lines:false}),topic=text(c.topic||c.niche||c.category||'Saved draft',160,{lines:false}),category=text(c.category||c.niche||topic,160,{lines:false});
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
  const relatedArticles=Array.isArray(c.relatedArticles)?c.relatedArticles.slice(0,5).map(item=>({...(typeof item.id==='string'&&/^\d{3,40}$/.test(item.id)?{id:item.id}:{}),title:text(item.title,240,{lines:false}),url:httpsURL(text(item.url,2000,{lines:false})).href,...(Number.isFinite(Date.parse(item.publishedAt))?{publishedAt:new Date(item.publishedAt).toISOString()}:{})})):[];
  content={title,category,description:text(c.intro,6000).slice(0,1200),hashtags:[],intro:text(c.intro,6000),sections,listSection,faqs,conclusion:text(c.conclusion,6000),plainText:text(c.plainText,30000),keywords:secondaryKeywords,focusKeyword,secondaryKeywords,metaDescription,slug,imageBriefs,images,imageStatus,imageError:text(c.imageError||'',600,{optional:true}),relatedArticles,wordCount:Number.isInteger(c.wordCount)?c.wordCount:0};
 }
 if(raw.kind==='article'&&c.generation?.kind==='ai'){
  if(content.title.length<50||content.title.length>60||content.metaDescription.length<140||content.metaDescription.length>160||content.faqs.length<3||content.faqs.length>5||content.secondaryKeywords.length<5||content.secondaryKeywords.length>10||content.imageBriefs.length!==3||!content.focusKeyword||!content.slug||content.wordCount<1000||content.wordCount>1600)throw new AutomationError('invalid_draft','The SEO fields, FAQs, image briefs or 1,000–1,600-word article are incomplete.');
 }
 if(c.generation?.kind==='ai')content.generation=publicGeneration(c.generation);
 if(Buffer.byteLength(JSON.stringify(content),'utf8')>100000)throw new AutomationError('invalid_draft','This draft exceeds the private Library size limit.');
 return {kind:raw.kind==='pin'?'pin_draft':'article_draft',requestKey:raw.requestKey,topic,content,imageUrl,destinationUrl};
}
export async function saveDraft(db,userId,draft,{automationSlotId=null}={}){
 if(automationSlotId!==null&&!/^\d{8}T\d{9}Z$/.test(automationSlotId))throw new AutomationError('invalid_draft','The recurring generation slot was invalid.');
 if(draft.kind==='article_draft'&&draft.content.images?.length)await assertOwnedArticleImages(db,userId,draft.content.images,{required:draft.content.images.length});
 await ensureSettings(db,userId);const ref=accountRef(db,userId).collection('requests').doc(draft.requestKey),hash=createHash('sha256').update(JSON.stringify([draft.kind,draft.topic,draft.content,draft.imageUrl,draft.destinationUrl])).digest('hex');
 return transaction(db,async tx=>{
  const s=await readAccount(tx,db,userId),previous=data(await tx.get(ref));
  if(previous){if(previous.kind!==draft.kind||previous.fingerprint!==hash)throw new AutomationError('request_key_reused','This request key already belongs to a different saved draft.',{status:409});return previous.job_id;}
  const job=defaultJob(userId,{kind:draft.kind,state:'draft',topic:draft.topic,topic_metadata:automationSlotId?{source:'recurring_automation',slotId:automationSlotId,label:'AI-generated recurring-automation draft; publication has its own saved Blogger job'}:{source:'user_draft',label:'Your private saved draft — not queued or published'},content:draft.content,image_url:draft.imageUrl,destination_url:draft.destinationUrl,request_key:draft.requestKey,scheduled_at:null});
  writeJob(tx,db,s,null,job);writeAccount(tx,db,s);tx.create(ref,{job_id:job.id,kind:draft.kind,fingerprint:hash,created_at:new Date()});
  addLog(db,userId,job.id,'draft_saved','info',`${draft.kind==='pin_draft'?'Pin':'Article'} saved privately in your Cloud Library. Saving a draft does not authorize, queue or publish it.`,tx);return job.id;
 });
}
