// Shared by the review UI and the authoritative server boundary. No Node,
// credentials, provider transport or privileged database dependency.
import { AutomationError } from '../automation/errors.mjs';
const reject = (code, message) => { throw new AutomationError(code, message); };
const anchorSafe=value=>{
 if(/^#[a-z0-9-]{1,80}$/.test(value))return true;
 try{const href=value.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'");const url=new URL(href);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.hash&&url.hostname.includes('.')&&!url.hostname.endsWith('.')&&!/(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/.test(url.hostname);}catch{return false;}
};
export function articleHTML(value) {
  const size = typeof value === 'string' ? new TextEncoder().encode(value).byteLength : 0;
  if (typeof value !== 'string' || size < 50 || size > 100000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) reject('invalid_article', 'Review article HTML between 50 bytes and 100 KB. Do not embed image bytes.');
  const allowed = new Set(['p','h2','h3','ul','ol','li','strong','em','blockquote','a']),stack=[],ids=new Set();let at=0;
  for(const token of value.matchAll(/<[^>]*>/g)){
    if(value.slice(at,token.index).includes('<'))reject('invalid_html','Use safe article formatting without scripts or arbitrary attributes.');
    const raw=token[0],anchor=/^<a href="([^"]+)">$/.exec(raw),heading=/^<h2(?: id="([a-z0-9-]+)")?>$/.exec(raw),plain=/^<([a-z0-9]+)>$/.exec(raw),close=/^<\/([a-z0-9]+)>$/.exec(raw);
    if(raw==='<br>'){at=token.index+raw.length;continue;}
    if(anchor){if(!anchorSafe(anchor[1]))reject('invalid_link','Article links must use a safe HTTPS URL or an internal section link.');stack.push('a');}
    else if(heading){if(heading[1]){if(!/^(?:section-\d+|article-(?:tips|faq|conclusion))$/.test(heading[1])||ids.has(heading[1]))reject('invalid_html','Article heading IDs must be unique generated contents anchors.');ids.add(heading[1]);}stack.push('h2');}
    else if(plain&&allowed.has(plain[1])&&plain[1]!=='a'&&plain[1]!=='h2')stack.push(plain[1]);
    else if(close&&allowed.has(close[1])){if(stack.pop()!==close[1])reject('invalid_html','Close the article formatting tags in order.');}
    else reject('invalid_html','Allowed article formatting: p, h2, h3, lists, emphasis, blockquote, linked contents and safe HTTPS anchors; no arbitrary attributes or image bytes.');
    at=token.index+raw.length;
  }
  if(stack.length||value.slice(at).includes('<')||!value.replace(/<[^>]*>/g,'').trim())reject('invalid_html','The article HTML is incomplete. Check the preview and close its tags.');
  return value;
}
