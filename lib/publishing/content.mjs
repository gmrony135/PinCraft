import { createHash } from 'node:crypto';
import { AutomationError } from '../automation/errors.mjs';
import { httpsURL } from '../automation/http.mjs';
export const validJobId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export const numericId=value=>typeof value==='string'&&/^\d{3,40}$/.test(value);
export const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reject=(code,message)=>{throw new AutomationError(code,message);};
export function articleHTML(value){
 if(typeof value!=='string'||Buffer.byteLength(value)<50||Buffer.byteLength(value)>100000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))reject('invalid_article','Review article HTML between 50 bytes and 100 KB. Do not embed image bytes.');
 const allowed=new Set(['p','h2','h3','ul','ol','li','strong','em','blockquote']),stack=[];let at=0;
 for(const token of value.matchAll(/<[^>]*>/g)){if(value.slice(at,token.index).includes('<'))reject('invalid_html','Use simple article formatting without scripts or arbitrary attributes.');const match=/^<(\/?)([a-z0-9]+)>$/.exec(token[0]);if(token[0]!=='<br>'&&(!match||!allowed.has(match[2])))reject('invalid_html','Allowed HTML: p, h2, h3, ul, ol, li, strong, em, blockquote and br, without attributes.');if(match&&allowed.has(match[2])){if(match[1]){if(stack.pop()!==match[2])reject('invalid_html','Close the article formatting tags in order.');}else stack.push(match[2]);}at=token.index+token[0].length;}
 if(stack.length||value.slice(at).includes('<')||!value.replace(/<[^>]*>/g,'').trim())reject('invalid_html','The article HTML is incomplete. Check the preview and close its tags.');return value;
}
const text=(value,max,label,multiline=false)=>{const controls=multiline?/[<>\u0000-\u0009\u000b-\u001f\u007f]/:/[<>\u0000-\u001f\u007f]/;if(typeof value!=='string'||!value.trim()||value.trim().length>max||controls.test(value))reject('invalid_content',`Review ${label}, using at most ${max} characters without markup.`);return value.trim();};
export function reviewedInput(raw,now=Date.now()){
 if(!raw||Array.isArray(raw)||Object.keys(raw).some(k=>!['requestId','article','pin','bloggerConnectionId','websiteId','blogPublishAtUTC','pinReadyAtUTC','timezone','reviewed'].includes(k))||!validJobId(raw.requestId)||raw.reviewed!==true||!/^blogger_\d{3,40}$/.test(raw.websiteId||'')||!(raw.bloggerConnectionId==='blogger'||validJobId(raw.bloggerConnectionId)))reject('review_required','Review this specific article and manual Pin pack, then select your verified Blogger website.');
 if(!raw.article||Object.keys(raw.article).some(k=>!['title','html','featuredImageUrl'].includes(k))||!raw.pin||Object.keys(raw.pin).some(k=>!['title','description','hashtags','imageUrl','imageSource','altText'].includes(k)))reject('invalid_content','Send only the reviewed article, manual Pin copy and image reference.');
 const tags=Array.isArray(raw.pin.hashtags)?[...new Set(raw.pin.hashtags)]:[];if(tags.length>10||tags.some(t=>typeof t!=='string'||!/^#[\p{L}\p{N}_]{1,40}$/u.test(t)))reject('invalid_hashtags','Use at most ten hashtags, containing letters, numbers and underscores.');
 const description=text(raw.pin.description,500,'the Pin description',true);if((description+(tags.length?'\n'+tags.join(' '):'')).length>500)reject('invalid_description','The Pin description and hashtags together must be at most 500 characters.');
 if(!['local_download','public_url'].includes(raw.pin.imageSource))reject('image_review_required','Review and download your Pin artwork, or provide its existing public image URL.');
 const imageUrl=raw.pin.imageUrl?httpsURL(raw.pin.imageUrl).href:null;if(raw.pin.imageSource==='public_url'&&!imageUrl)reject('image_review_required','Provide the existing public image URL, or choose the downloaded-artwork option.');
 const dates=[raw.blogPublishAtUTC,raw.pinReadyAtUTC].map(value=>{if(value==='now')return now;if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))reject('invalid_schedule','Send an explicit UTC time or choose Publish now.');const at=Date.parse(value);if(new Date(at).toISOString().replace('.000Z','Z')!==value.replace('.000Z','Z'))reject('invalid_schedule','Choose a real UTC calendar date and time.');return at;});
 if(dates.some(t=>t<now-60000||t>now+366*86400000)||dates[1]<dates[0])reject('invalid_schedule','Choose dates within one year. The manual Pin target cannot precede the blog schedule.');
 try{if(typeof raw.timezone!=='string'||raw.timezone.length>100)throw new Error();new Intl.DateTimeFormat('en',{timeZone:raw.timezone}).format();}catch{reject('invalid_timezone','Choose a valid IANA audience timezone.');}
 return {requestId:raw.requestId,article:{title:text(raw.article.title,200,'the article title'),html:articleHTML(raw.article.html),featuredImageUrl:raw.article.featuredImageUrl?httpsURL(raw.article.featuredImageUrl).href:null},pin:{title:text(raw.pin.title,100,'the Pin title'),description,hashtags:tags,imageSource:raw.pin.imageSource,imageUrl,altText:raw.pin.altText?text(raw.pin.altText,450,'the image description'):''},bloggerConnectionId:raw.bloggerConnectionId,websiteId:raw.websiteId,blogAt:new Date(dates[0]),pinAt:new Date(dates[1]),timezone:raw.timezone};
}
export function redactedError(error){
 const known=error instanceof AutomationError,message=known?error.message:'This publishing step could not be confirmed. Inspect its saved status before retrying.';
 const unsafe=/access_token|refresh_token|client_secret|authorization\s*[:=]|bearer|-----BEGIN|pina_|pinr_|ya29\.|[A-Za-z0-9_+/=-]{28,}|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(message);
 return {code:known?error.code:'publishing_unavailable',message:unsafe?'The publishing service rejected this request. Check its recorded HTTP status and reconnect or review the saved job.':message,upstreamStatus:Number.isInteger(error.upstreamStatus)?error.upstreamStatus:null};
}
export function reportedPinURL(value){const url=httpsURL(value),match=/^\/pin\/(\d{5,40})\/?$/.exec(url.pathname);if(!['www.pinterest.com','pinterest.com'].includes(url.hostname)||!match||url.search)reject('invalid_pin_url','Enter your actual https://www.pinterest.com/pin/…/ URL. It will be labeled user-reported, not API-verified.');return `https://www.pinterest.com/pin/${match[1]}/`;}
