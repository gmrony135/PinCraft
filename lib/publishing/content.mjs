import {createHash} from 'node:crypto';
import {AutomationError} from '../automation/errors.mjs';
import {httpsURL} from '../automation/http.mjs';
import {articleHTML} from './article-format.mjs';
import {validReviewHashtag,validReviewText} from './review-fields.mjs';
export {articleHTML} from './article-format.mjs';
export const validJobId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export const numericId=value=>typeof value==='string'&&/^\d{3,40}$/.test(value);
export const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reject=(code,message)=>{throw new AutomationError(code,message);};
const text=(value,max,label,multiline=false)=>{if(!validReviewText(value,max,multiline))reject('invalid_content',`Review ${label}, using at most ${max} characters without markup.`);return value.trim();};
function scheduleTime(value,now){
 if(value==='now')return now;
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))reject('invalid_schedule','Send an explicit UTC time or choose Publish now.');
 const at=Date.parse(value);
 if(new Date(at).toISOString().replace('.000Z','Z')!==value.replace('.000Z','Z'))reject('invalid_schedule','Choose a real UTC calendar date and time.');
 return at;
}
function articleSubmission(raw,now,automatic){
 const keys=['requestId','article','pin','bloggerConnectionId','websiteId','blogPublishAtUTC','pinReadyAtUTC','timezone','reviewed'];
 if(!raw||Array.isArray(raw)||typeof raw!=='object'||Object.keys(raw).some(k=>!keys.includes(k))||!validJobId(raw.requestId)||(!automatic&&raw.reviewed!==true)||(automatic&&raw.reviewed!==undefined)||!/^blogger_\d{3,40}$/.test(raw.websiteId||'')||!(raw.bloggerConnectionId==='blogger'||validJobId(raw.bloggerConnectionId)))reject('review_required','Review the article and select your verified Blogger website. Recurring jobs require a separate saved automation authorization.');
 if(!raw.article||Array.isArray(raw.article)||typeof raw.article!=='object'||Object.keys(raw.article).some(k=>!['title','html','featuredImageUrl'].includes(k)))reject('invalid_content','Send only the complete article and optional hosted featured image.');
 const article={title:text(raw.article.title,200,'the article title'),html:articleHTML(raw.article.html),featuredImageUrl:raw.article.featuredImageUrl?httpsURL(raw.article.featuredImageUrl).href:null};
 let pin=null;
 if(raw.pin!==undefined&&raw.pin!==null){
  if(automatic||Array.isArray(raw.pin)||typeof raw.pin!=='object'||Object.keys(raw.pin).some(k=>!['title','description','hashtags','imageUrl','imageSource','altText'].includes(k)))reject('invalid_content','A manual Pin pack is optional and must contain only your explicitly reviewed copy and artwork reference.');
  const tags=Array.isArray(raw.pin.hashtags)?[...new Set(raw.pin.hashtags)]:[];
  if(tags.length>10||tags.some(t=>!validReviewHashtag(t)))reject('invalid_hashtags','Use at most ten hashtags, containing letters, normal vowel/combining marks, numbers and underscores.');
  const description=text(raw.pin.description,500,'the Pin description',true);
  if((description+(tags.length?'\n'+tags.join(' '):'')).length>500)reject('invalid_description','The Pin description and hashtags together must be at most 500 characters.');
  if(!['local_download','public_url'].includes(raw.pin.imageSource))reject('image_review_required','For a manual Pin pack, review and save its artwork or provide its existing public image URL. You can publish the blog without a Pin pack.');
  const imageUrl=raw.pin.imageUrl?httpsURL(raw.pin.imageUrl).href:null;
  if(raw.pin.imageSource==='public_url'&&!imageUrl)reject('image_review_required','Provide the existing public image URL, or choose downloaded artwork.');
  pin={title:text(raw.pin.title,100,'the Pin title'),description,hashtags:tags,imageSource:raw.pin.imageSource,imageUrl,altText:raw.pin.altText?text(raw.pin.altText,450,'the image description'):''};
 }else if(raw.pinReadyAtUTC!==undefined&&raw.pinReadyAtUTC!==null)reject('invalid_schedule','A manual Pin target is only used when you explicitly include a Pin pack.');
 const blogAt=scheduleTime(raw.blogPublishAtUTC,now),pinAt=pin?scheduleTime(raw.pinReadyAtUTC,now):null;
 if([blogAt,...(pin?[pinAt]:[])].some(t=>t<now-60000||t>now+366*86400000)||(pin&&pinAt<blogAt))reject('invalid_schedule','Choose dates from now to one year ahead. An optional manual Pin target cannot precede the blog schedule.');
 try{if(typeof raw.timezone!=='string'||raw.timezone.length>100)throw new Error();new Intl.DateTimeFormat('en',{timeZone:raw.timezone}).format();}catch{reject('invalid_timezone','Choose a valid IANA audience timezone.');}
 return {requestId:raw.requestId,article,pin,bloggerConnectionId:raw.bloggerConnectionId,websiteId:raw.websiteId,blogAt:new Date(blogAt),pinAt:pin?new Date(pinAt):null,timezone:raw.timezone};
}
export const reviewedInput=(raw,now=Date.now())=>articleSubmission(raw,now,false);
// Server-internal only. This does NOT authorize publication: the repository
// separately verifies a live owner consent, immutable slot and generation lease.
export const automatedArticleInput=(raw,now=Date.now())=>articleSubmission(raw,now,true);
export function redactedError(error){
 const known=error instanceof AutomationError,message=known?error.message:'This publishing step could not be confirmed. Inspect its saved status before retrying.';
 const unsafe=/access_token|refresh_token|client_secret|authorization\s*[:=]|bearer|-----BEGIN|pina_|pinr_|ya29\.|[A-Za-z0-9_+/=-]{28,}|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(message);
 return {code:known?error.code:'publishing_unavailable',message:unsafe?'The publishing service rejected this request. Check its recorded HTTP status and reconnect or review the saved job.':message,upstreamStatus:Number.isInteger(error.upstreamStatus)?error.upstreamStatus:null};
}
export function reportedPinURL(value){const url=httpsURL(value),match=/^\/pin\/(\d{5,40})\/?$/.exec(url.pathname);if(!['www.pinterest.com','pinterest.com'].includes(url.hostname)||!match||url.search)reject('invalid_pin_url','Enter your actual https://www.pinterest.com/pin/…/ URL. It will be labeled user-reported, not API-verified.');return `https://www.pinterest.com/pin/${match[1]}/`;}
