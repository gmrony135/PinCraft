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
export function articleToHTML(article){
 if(typeof article.reviewedHTML==='string')return articleHTML(article.reviewedHTML);
 if(!article.intro&&!(article.sections||[]).length&&!article.listSection&&!article.conclusion)return plainArticleToHTML(article.plainText,article.title);
 return [article.intro&&`<p>${inline(article.intro)}</p>`,...(article.sections||[]).map(s=>`<h2>${escapeHTML(s.heading)}</h2>\n${(s.paragraphs||[]).map(p=>`<p>${inline(p)}</p>`).join('\n')}`),article.listSection&&`<h2>${escapeHTML(article.listSection.heading)}</h2>\n${article.listSection.intro?`<p>${inline(article.listSection.intro)}</p>`:''}\n<ul>${(article.listSection.items||[]).map(i=>`<li>${inline(i)}</li>`).join('')}</ul>`,article.conclusion&&`<h2>Final thoughts</h2>\n<p>${inline(article.conclusion)}</p>`].filter(Boolean).join('\n');
}
const handoffKey='pincraft.reviewed-pin-handoff.v1';
export function handoffPin(owner,pack){try{if(!owner||!pack)return;sessionStorage.setItem(handoffKey,JSON.stringify({owner,title:String(pack.titles?.[0]||pack.title||'').slice(0,100),description:String(pack.description||'').slice(0,500),hashtags:Array.isArray(pack.hashtags)?pack.hashtags.filter(t=>typeof t==='string').slice(0,10):[],createdAt:Date.now()}));}catch{}}
export function readPinHandoff(owner){try{const value=JSON.parse(sessionStorage.getItem(handoffKey));if(value?.owner!==owner||!owner||!Number.isFinite(value.createdAt)||Date.now()-value.createdAt>3600000)return null;return value;}catch{return null;}}
