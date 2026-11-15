import {AutomationError} from './errors.mjs';
import {textTask} from '../ai/tasks.mjs';

const taskInput=(topic,language='en',title=topic)=>({task:'article',title:String(title||topic||'Practical article topic').slice(0,200),topic:String(topic||title||'').slice(0,160),language:language==='bn'?'bn':'en'});
const words=value=>String(value||'').trim().split(/\s+/u).filter(Boolean).length;
const pinterestTags=keywords=>{
 const tags=[...new Set((keywords||[]).map(keyword=>`#${String(keyword).normalize('NFKD').replace(/\p{M}/gu,'').replace(/[^A-Za-z0-9]/g,'').slice(0,30)}`).filter(tag=>tag.length>=3))].slice(0,8);
 return tags.length>=5?tags:['#PinCraft','#HelpfulIdeas','#Inspiration','#ContentIdeas','#ReadLater'];
};

// Keep the archived scheduler's generator on the same article contract as the
// current Article Writer: 1,000–1,600 words, four sections, FAQs, SEO fields,
// and three image briefs. The briefs are not saved artwork; publication still
// requires separately generated/verified assets in the reviewed publisher.
export function validateContent(raw,topic,language='en'){
 const article=textTask(taskInput(topic,language,raw?.title||topic)).validate(raw);
 return {...article,description:article.metaDescription,hashtags:pinterestTags(article.secondaryKeywords)};
}
export function escapeHTML(value){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
export function articleHTML(content,id){
 const paragraph=value=>`<p>${escapeHTML(value)}</p>`;
 const sections=(content.sections||[]).map(section=>`<h2>${escapeHTML(section.heading)}</h2>\n${(section.paragraphs||[]).map(paragraph).join('\n')}\n${(section.subsections||[]).map(subsection=>`<h3>${escapeHTML(subsection.heading)}</h3>\n${(subsection.paragraphs||[]).map(paragraph).join('\n')}`).join('\n')}`).join('\n');
 const list=content.listSection?`<h2>${escapeHTML(content.listSection.heading)}</h2>\n${paragraph(content.listSection.intro)}\n<ul>${(content.listSection.items||[]).map(item=>`<li>${escapeHTML(item)}</li>`).join('')}</ul>`:'';
 const faqs=Array.isArray(content.faqs)&&content.faqs.length?`<h2>Frequently asked questions</h2>\n${content.faqs.map(item=>`<h3>${escapeHTML(item.question)}</h3>\n${paragraph(item.answer)}`).join('\n')}`:'';
 return `<!-- pincraft-job:${escapeHTML(id)} -->\n${paragraph(content.intro)}\n${sections}\n${list}\n${faqs}\n<h2>Final thoughts</h2>\n${paragraph(content.conclusion)}`;
}
export function pinDescription(content){const tags=(content.hashtags||[]).join(' ');return `${String(content.description||'').slice(0,Math.max(0,499-tags.length)).trim()}\n${tags}`;}
export function contentPrompt(topic,language='en'){
 if(typeof topic!=='string'||topic.trim().length<3||topic.length>160)throw new AutomationError('invalid_topic','Choose a topic between 3 and 160 characters.');
 return textTask(taskInput(topic.trim(),language)).prompt;
}
export const articleWordCount=words;
