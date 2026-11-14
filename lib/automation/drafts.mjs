import 'server-only';
import {createHash} from 'node:crypto';
import {transaction} from './db.mjs';
import {AutomationError} from './errors.mjs';
import {publicGeneration} from '../ai/public.mjs';
import {httpsURL} from './http.mjs';
import {validJobId} from './images.mjs';
import {accountRef,data,defaultJob,readAccount,writeAccount,writeJob} from './firestore.mjs';
import {addLog,ensureSettings} from './repository.mjs';
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
  const sections=c.sections.map(section=>({heading:text(section.heading,240,{lines:false}),paragraphs:strings(section.paragraphs,8,6000)}));if(sections.some(s=>!s.paragraphs.length))throw new AutomationError('invalid_draft','Article sections need their full paragraph text.');
  const listSection=c.listSection?{heading:text(c.listSection.heading,240),intro:text(c.listSection.intro||'',2000,{optional:true}),items:strings(c.listSection.items,20,1000)}:null;
  content={title,category,description:text(c.intro,6000).slice(0,1000),hashtags:[],intro:text(c.intro,6000),sections,listSection,conclusion:text(c.conclusion,6000),plainText:text(c.plainText,20000),keywords:strings(c.keywords||[],20,100)};
 }
 if(c.generation?.kind==='ai')content.generation=publicGeneration(c.generation);
 if(Buffer.byteLength(JSON.stringify(content),'utf8')>100000)throw new AutomationError('invalid_draft','This draft exceeds the private Library size limit.');
 return {kind:raw.kind==='pin'?'pin_draft':'article_draft',requestKey:raw.requestKey,topic,content,imageUrl,destinationUrl};
}
export async function saveDraft(db,userId,draft){
 await ensureSettings(db,userId);const ref=accountRef(db,userId).collection('requests').doc(draft.requestKey),hash=createHash('sha256').update(JSON.stringify([draft.kind,draft.topic,draft.content,draft.imageUrl,draft.destinationUrl])).digest('hex');
 return transaction(db,async tx=>{
  const s=await readAccount(tx,db,userId),previous=data(await tx.get(ref));
  if(previous){if(previous.kind!==draft.kind||previous.fingerprint!==hash)throw new AutomationError('request_key_reused','This request key already belongs to a different saved draft.',{status:409});return previous.job_id;}
  const job=defaultJob(userId,{kind:draft.kind,state:'draft',topic:draft.topic,topic_metadata:{source:'user_draft',label:'Your private saved draft — not queued or published'},content:draft.content,image_url:draft.imageUrl,destination_url:draft.destinationUrl,request_key:draft.requestKey,scheduled_at:null});
  writeJob(tx,db,s,null,job);writeAccount(tx,db,s);tx.create(ref,{job_id:job.id,kind:draft.kind,fingerprint:hash,created_at:new Date()});
  addLog(db,userId,job.id,'draft_saved','info',`${draft.kind==='pin_draft'?'Pin':'Article'} saved privately in Firestore. Saving a draft does not authorize, queue or publish it.`,tx);return job.id;
 });
}
