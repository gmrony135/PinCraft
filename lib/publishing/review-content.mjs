// Text-only handoff. Never copy AI generation receipts or private identity data.
import {articleHTML} from './article-format.mjs';
const escapeHTML=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inline=value=>escapeHTML(value).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
export function plainArticleToHTML(text,title=''){
 const blocks=String(text||'').replace(/\r\n?/g,'\n').split(/\n\s*\n/).filter(b=>b.trim());
 return blocks.flatMap(block=>{
  const lines=block.trim().split('\n'),result=[];let paragraphs=[],items=[],listType='';
  const flushParagraph=()=>{if(paragraphs.length){result.push(`<p>${paragraphs.map(inline).join('<br>')}</p>`);paragraphs=[];}};
  const flushList=()=>{if(items.length){result.push(`<${listType}>${items.map(i=>`<li>${inline(i)}</li>`).join('')}</${listType}>`);items=[];listType='';}};
  for(const line of lines){const heading=/^(#{1,6})\s+(.+)$/.exec(line),bullet=/^\s*(?:([-*])|\d+[.)])\s+(.+)$/.exec(line);
   if(heading){flushParagraph();flushList();if(heading[1]==='#'&&heading[2].trim()===title.trim())continue;const tag=heading[1].length<=2?'h2':'h3';result.push(`<${tag}>${inline(heading[2])}</${tag}>`);}
   else if(bullet){flushParagraph();const nextType=bullet[1]?'ul':'ol';if(listType&&listType!==nextType)flushList();listType=nextType;items.push(bullet[2]);}
   else{flushList();paragraphs.push(line);}
  }
  flushParagraph();flushList();return result;
 }).join('\n');
}
export function appendRelatedLinks(value,links=[]){
 let html=articleHTML(value);const selected=Array.isArray(links)?links.filter(link=>typeof link?.title==='string'&&typeof link?.url==='string').slice(0,5):[];
 const missing=selected.filter(link=>!html.includes(`<a href="${escapeHTML(link.url)}">`));
 if(missing.length)html+=`\n<h2>Related articles</h2>\n<ul>${missing.map(link=>`<li><a href="${escapeHTML(link.url)}">${escapeHTML(link.title)}</a></li>`).join('')}</ul>`;
 return articleHTML(html);
}
function decodeReviewText(value){
 return String(value||'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#(\d+);/g,(_,digits)=>{const code=Number(digits);return Number.isInteger(code)&&code>=0&&code<=0x10ffff?String.fromCodePoint(code):' ';});
}
export function externalSourceLinks(value,internalOrigins=[]){
 let html;try{html=articleHTML(value);}catch{return [];}
 const origins=new Set((Array.isArray(internalOrigins)?internalOrigins:[]).map(item=>{try{return new URL(typeof item==='string'?item:item?.url).origin;}catch{return '';}}).filter(Boolean)),found=new Map();
 const add=(raw,label='')=>{
  const cleaned=decodeReviewText(raw).replace(/[),.;!?]+$/,'');let url;try{url=new URL(cleaned);}catch{return;}
  if(url.protocol!=='https:'||url.username||url.password||origins.has(url.origin)||found.has(url.href))return;
  found.set(url.href,{url:url.href,title:decodeReviewText(label.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim()||url.hostname,hostname:url.hostname});
 };
 for(const match of html.matchAll(/<a href="([^"]+)">([\s\S]*?)<\/a>/g))add(match[1],match[2]);
 const visible=html.replace(/<a href="[^"]+">([\s\S]*?)<\/a>/g,'$1').replace(/<[^>]*>/g,' ');
 for(const match of visible.matchAll(/https:\/\/[^\s<>"']+/gi))add(match[0]);
 return [...found.values()];
}
// Recurring articles use only their separately verified live Blogger links.
// Remove any accidental absolute source links without pausing a scheduled slot.
export function omitExternalLinks(value,allowedInternalLinks=[]){
 let html=articleHTML(value);
 const allowed=new Set((Array.isArray(allowedInternalLinks)?allowedInternalLinks:[]).flatMap(value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?[url.href]:[];}catch{return [];}}));
 html=html.replace(/<a href="https:\/\/([^\"]+)">([\s\S]*?)<\/a>/g,(whole,rawPath,label)=>{let href;try{href=new URL(`https://${rawPath}`).href;}catch{return label;}return allowed.has(href)?whole:label;});
 return articleHTML(html);
}
export function hasProfessionalArticleStructure(value){
 let html;try{html=articleHTML(value);}catch{return false;}
 const ids=[...html.matchAll(/<h2 id="section-(\d+)">/g)].map(match=>Number(match[1]));
 if(ids.length!==4||ids.some((id,index)=>id!==index+1)||[...html.matchAll(/<h3>/g)].length<4)return false;
 const toc=/<h2>In this guide<\/h2>\s*<ol>([\s\S]*?)<\/ol>/.exec(html);if(!toc)return false;
 const required=[...ids.map(index=>`section-${index}`),'article-tips','article-faq','article-conclusion'];
 return required.every(id=>toc[1].includes(`<a href="#${id}">`)&&html.includes(`<h2 id="${id}">`));
}
export function countArticleWordsFromHTML(value){
 let html;try{html=articleHTML(value);}catch{return 0;}
 html=html.replace(/<h2>In this guide<\/h2>\s*<ol>[\s\S]*?<\/ol>/i,'')
  .replace(/<h2>Related articles<\/h2>\s*<ul>[\s\S]*?<\/ul>/i,'')
  .replace(/<p><strong>\s*Q:\s*/gi,'<p><strong>')
  .replace(/<p>\s*A:\s*/gi,'<p>');
 const visible=html.replace(/<[^>]*>/g,' ').replace(/&(#x[\da-f]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos|nbsp);/gi,(entity,code)=>{
  if(code[0]==='#'){const value=code[1].toLowerCase()==='x'?parseInt(code.slice(2),16):parseInt(code.slice(1),10);return Number.isInteger(value)&&value>=0&&value<=0x10ffff&&!(value>=0xd800&&value<=0xdfff)?String.fromCodePoint(value):' ';}
  return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[code.toLowerCase()]||entity;
 });
 return visible.split(/\s+/u).filter(Boolean).length;
}
export function articleToHTML(article){
 if(typeof article.reviewedHTML==='string')return articleHTML(article.reviewedHTML);
 if(!article.intro&&!(article.sections||[]).length&&!article.listSection&&!article.conclusion)return plainArticleToHTML(article.plainText,article.title);
 const sections=article.sections||[],modern=Boolean(article.metaDescription||article.focusKeyword||article.faqs?.length||sections.length>=4);
 const tocItems=[...sections.map((section,index)=>`<li><a href="#section-${index+1}">${escapeHTML(section.heading)}</a></li>`),...(article.listSection?.items?.length?[`<li><a href="#article-tips">${escapeHTML(article.listSection.heading||'Practical tips')}</a></li>`]:[]),...(article.faqs?.length?['<li><a href="#article-faq">Frequently asked questions</a></li>']:[]),...(article.conclusion?['<li><a href="#article-conclusion">Final thoughts</a></li>']:[])];
 const toc=modern&&sections.length?`<h2>In this guide</h2>\n<ol>${tocItems.join('')}</ol>`:'';
 const body=sections.map((section,index)=>{const parts=[`<h2${modern?` id="section-${index+1}"`:''}>${escapeHTML(section.heading)}</h2>`,...(section.paragraphs||[]).map(paragraph=>`<p>${inline(paragraph)}</p>`)];for(const subsection of section.subsections||[])parts.push(`<h3>${escapeHTML(subsection.heading)}</h3>`,...(subsection.paragraphs||[]).map(paragraph=>`<p>${inline(paragraph)}</p>`));return parts.join('\n');});
 const faqs=article.faqs?.length?`<h2 id="article-faq">Frequently asked questions</h2>\n${article.faqs.map(faq=>`<p><strong>Q: ${inline(faq.question)}</strong></p>\n<p>A: ${inline(faq.answer)}</p>`).join('\n')}`:'';
 const links=Array.isArray(article.relatedArticles)?article.relatedArticles.filter(link=>{try{const url=new URL(link.url);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}}):[];
 const related=links.length?`<h2>Related articles</h2>\n<ul>${links.map(link=>`<li><a href="${escapeHTML(link.url)}">${escapeHTML(link.title)}</a></li>`).join('')}</ul>`:'';
 return [article.intro&&`<p>${inline(article.intro)}</p>`,toc,...body,article.listSection&&`<h2${modern?' id="article-tips"':''}>${escapeHTML(article.listSection.heading)}</h2>\n${article.listSection.intro?`<p>${inline(article.listSection.intro)}</p>`:''}\n<ul>${(article.listSection.items||[]).map(item=>`<li>${inline(item)}</li>`).join('')}</ul>`,faqs,article.conclusion&&`<h2${modern?' id="article-conclusion"':''}>Final thoughts</h2>\n<p>${inline(article.conclusion)}</p>`,related].filter(Boolean).join('\n');
}
const handoffKey='pincraft.reviewed-pin-handoff.v1';
export function handoffPin(owner,pack){try{if(!owner||!pack)return;sessionStorage.setItem(handoffKey,JSON.stringify({owner,title:String(pack.titles?.[0]||pack.title||'').slice(0,100),description:String(pack.description||'').slice(0,500),hashtags:Array.isArray(pack.hashtags)?pack.hashtags.filter(t=>typeof t==='string').slice(0,10):[],createdAt:Date.now()}));}catch{}}
export function readPinHandoff(owner){try{const value=JSON.parse(sessionStorage.getItem(handoffKey));if(value?.owner!==owner||!owner||!Number.isFinite(value.createdAt)||Date.now()-value.createdAt>3600000)return null;return value;}catch{return null;}}
