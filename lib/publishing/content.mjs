import {createHash} from 'node:crypto';
import {AutomationError} from '../automation/errors.mjs';
import {httpsURL} from '../automation/http.mjs';
import {articleHTML} from './article-format.mjs';
import {appendRelatedLinks,countArticleWordsFromHTML,externalSourceLinks,hasProfessionalArticleStructure,omitExternalLinks} from './review-content.mjs';
import {validReviewHashtag,validReviewText} from './review-fields.mjs';
import {seoFailures} from './seo-rules.mjs';
export {articleHTML} from './article-format.mjs';
export const validJobId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export const numericId=value=>typeof value==='string'&&/^\d{3,40}$/.test(value);
export const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reject=(code,message,status=400)=>{throw new AutomationError(code,message,{status});};
const text=(value,max,label,multiline=false)=>{if(!validReviewText(value,max,multiline))reject('invalid_content',`Review ${label}, using at most ${max} characters without markup.`);return value.trim();};
const articleImageId=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function scheduleTime(value,now){
 if(value==='now')return now;
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))reject('invalid_schedule','Send an explicit UTC time or choose Publish now.');
 const at=Date.parse(value);
 if(new Date(at).toISOString().replace('.000Z','Z')!==value.replace('.000Z','Z'))reject('invalid_schedule','Choose a real UTC calendar date and time.');
 return at;
}
function articleSubmission(raw,now,automatic){
 const keys=['requestId','article','pin','bloggerConnectionId','websiteId','blogPublishAtUTC','pinReadyAtUTC','timezone','reviewed','externalSourcesVerified','allowNoInternalLinks'];
 if(!raw||Array.isArray(raw)||typeof raw!=='object'||Object.keys(raw).some(k=>!keys.includes(k))||!validJobId(raw.requestId)||(!automatic&&raw.reviewed!==true)||(automatic&&(raw.reviewed!==undefined||raw.externalSourcesVerified!==undefined||raw.allowNoInternalLinks!==undefined))||(!automatic&&raw.externalSourcesVerified!==undefined&&typeof raw.externalSourcesVerified!=='boolean')||(!automatic&&raw.allowNoInternalLinks!==undefined&&typeof raw.allowNoInternalLinks!=='boolean')||!/^blogger_\d{3,40}$/.test(raw.websiteId||'')||!(raw.bloggerConnectionId==='blogger'||validJobId(raw.bloggerConnectionId)))reject('review_required','Review the article and select your verified Blogger website. Recurring jobs require a separate saved automation authorization.');
 const allowNoInternalLinks=!automatic&&raw.allowNoInternalLinks===true;
 const allowedArticle=['title','html','featuredImageUrl','images','relatedArticles','metaDescription','focusKeyword','secondaryKeywords','slug','wordCount','sourceDraftId'];
 if(!raw.article||Array.isArray(raw.article)||typeof raw.article!=='object'||Object.keys(raw.article).some(k=>!allowedArticle.includes(k)))reject('invalid_content','Send only the complete reviewed article, its 1,000–1,600-word count, SEO suggestions, verified internal-link selections and saved AI image references.');
 if(!Number.isInteger(raw.article.wordCount)||raw.article.wordCount<1000||raw.article.wordCount>1600)reject('invalid_article_length','Review a complete article between 1,000 and 1,600 words before scheduling. No Blogger job was created.',422);
 const relatedRaw=raw.article.relatedArticles;
 if(!Array.isArray(relatedRaw)||relatedRaw.length>5||relatedRaw.length===1||(relatedRaw.length===0&&!allowNoInternalLinks)||(allowNoInternalLinks&&relatedRaw.length!==0))reject('article_internal_links_missing','Select two to five relevant live posts, or explicitly confirm a one-time manual publication with no internal links when fewer than two are available. Recurring posts still require two links.');
 const relatedArticles=relatedRaw.map(link=>{
  if(!link||Array.isArray(link)||typeof link!=='object'||Object.keys(link).some(key=>!['id','title','url','publishedAt'].includes(key))||!numericId(link.id))reject('article_internal_links_missing','A selected internal link did not come from a verified live Blogger post. Refresh the links before publishing.',422);
  let url;try{url=httpsURL(text(link.url,2000,'an internal Blogger link')).href;}catch{reject('article_internal_links_missing','A selected internal link is not a valid public HTTPS post on your Blogger website.',422);}
  return {id:link.id,title:text(link.title,240,'an internal article title'),url};
 });
 if(new Set(relatedArticles.map(link=>link.id)).size!==relatedArticles.length||new Set(relatedArticles.map(link=>link.url)).size!==relatedArticles.length)reject('article_internal_links_missing','Choose distinct live Blogger posts for the two to five internal links.',422);
 let baseHTML=articleHTML(raw.article.html);
 if(automatic)baseHTML=omitExternalLinks(baseHTML,relatedArticles.map(link=>link.url));
 const externalSources=automatic?[]:externalSourceLinks(baseHTML,relatedArticles);
 if(externalSources.length&&raw.externalSourcesVerified!==true)reject('external_source_review_required','Open every external source link, verify it supports the adjacent claim, then confirm the source review. No Blogger job was created.',422);
 const actualWordCount=countArticleWordsFromHTML(baseHTML),html=appendRelatedLinks(baseHTML,relatedArticles),imagesRaw=raw.article.images??[];
 if(actualWordCount<1000||actualWordCount>1600||raw.article.wordCount!==actualWordCount)reject('invalid_article_length',`The reviewed HTML contains ${actualWordCount} article words; keep its saved count accurate and within 1,000–1,600 before scheduling. No Blogger job was created.`,422);
 if(!Array.isArray(imagesRaw)||imagesRaw.length>3)reject('invalid_article_images','The article can contain one AI cover and two AI section images only.');
 const images=imagesRaw.map(image=>{
  if(!image||Array.isArray(image)||typeof image!=='object'||Object.keys(image).some(key=>!['assetId','role','sectionIndex','altText'].includes(key))||!articleImageId(image.assetId)||!['cover','section'].includes(image.role))reject('invalid_article_images','A saved AI article image reference is invalid.');
  const sectionIndex=image.role==='cover'?null:image.sectionIndex;
  if((image.role==='cover'&&image.sectionIndex!==null&&image.sectionIndex!==undefined)||(image.role==='section'&&![0,2].includes(sectionIndex)))reject('invalid_article_images','Use one cover and illustrations for the first and third article sections.');
  return {assetId:image.assetId,role:image.role,sectionIndex,altText:text(image.altText,300,'an AI image description')};
 });
 if(new Set(images.map(image=>image.assetId)).size!==images.length||images.filter(image=>image.role==='cover').length!==(images.length?1:0)||images.filter(image=>image.role==='section').length!==(images.length?2:0)||(automatic&&images.length!==3))reject('article_images_required','Automatic and AI-generated articles require one saved AI cover and both section illustrations. No post was queued.',422);
 const metaRaw=raw.article.metaDescription??'',metaDescription=metaRaw===''?'':text(metaRaw,160,'the SEO meta description');
 if(metaDescription&&(metaDescription.length<140||metaDescription.length>160))reject('invalid_seo','Keep the suggested meta description between 140 and 160 characters.');
 const focusKeyword=raw.article.focusKeyword?text(raw.article.focusKeyword,100,'the focus keyword'):'';
 const secondaryKeywords=raw.article.secondaryKeywords===undefined?[]:raw.article.secondaryKeywords;
 if(!Array.isArray(secondaryKeywords)||secondaryKeywords.length>10||secondaryKeywords.some(value=>typeof value!=='string'||!value.trim()||value.length>120))reject('invalid_seo','Review the article’s secondary keyword suggestions.');
 const keywords=secondaryKeywords.map(value=>value.trim());if(new Set(keywords.map(value=>value.toLocaleLowerCase())).size!==keywords.length)reject('invalid_seo','Remove duplicate SEO keyword suggestions.');
 const slug=raw.article.slug?text(raw.article.slug,100,'the suggested article slug'):'';if(slug&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))reject('invalid_seo','The suggested permalink must use lowercase words joined by hyphens.');
 const sourceDraftId=raw.article.sourceDraftId||null;if(sourceDraftId&&!validJobId(sourceDraftId))reject('invalid_draft','The source Library draft ID is invalid.');
 const title=text(raw.article.title,200,'the article title'),requireProfessionalSEO=automatic||Boolean(metaDescription||focusKeyword||keywords.length||slug||sourceDraftId);
 if(requireProfessionalSEO){
  const failures=seoFailures({title,html,metaDescription,focusKeyword,secondaryKeywords:keywords,slug});
  if(failures.length)reject('invalid_seo',`Publishing blocked by SEO: ${failures.join(' ')}`,422);
  if(!hasProfessionalArticleStructure(html))reject('invalid_article_structure','Keep one title, four organized H2/H3 sections and the clickable contents list before publishing.',422);
 }
 const article={title,html,featuredImageUrl:raw.article.featuredImageUrl?httpsURL(text(raw.article.featuredImageUrl,2000,'the featured image URL')).href:null,images,relatedArticles,externalSourcesVerified:!automatic&&raw.externalSourcesVerified===true,metaDescription,focusKeyword,secondaryKeywords:keywords,slug,wordCount:actualWordCount,sourceDraftId};
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
 return {requestId:raw.requestId,article,pin,allowNoInternalLinks,bloggerConnectionId:raw.bloggerConnectionId,websiteId:raw.websiteId,blogAt:new Date(blogAt),pinAt:pin?new Date(pinAt):null,timezone:raw.timezone};
}
export const reviewedInput=(raw,now=Date.now())=>articleSubmission(raw,now,false);
// Server-internal only. This does NOT authorize publication: the repository
// separately verifies a live owner consent, immutable slot and generation lease.
export const automatedArticleInput=(raw,now=Date.now())=>articleSubmission(raw,now,true);
export function redactedError(error){
 const known=error instanceof AutomationError,message=known?error.message:'This publishing step could not be confirmed. Inspect its saved status before retrying.';
 const unsafe=/access_token|refresh_token|client_secret|authorization\s*[:=]|bearer|-----BEGIN|pina_|pinr_|ya29\.|[A-Za-z0-9_+/=-]{28,}|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(message);
 // Safe per-attempt breakdown only (provider + code + status + ms; never keys,
 // prompts, model names or output). Lets the next failure name its real cause.
 const attempts=Array.isArray(error?.details?.attempts)?error.details.attempts.filter(a=>a&&typeof a.provider==='string'&&typeof a.code==='string').slice(0,24).map(a=>({provider:a.provider,code:a.code,upstreamStatus:Number.isInteger(a.upstreamStatus)?a.upstreamStatus:null,ms:Number.isFinite(a.ms)?Math.round(a.ms):null})):null;
 return {code:known?error.code:'publishing_unavailable',message:unsafe?'The publishing service rejected this request. Check its recorded HTTP status and reconnect or review the saved job.':message,upstreamStatus:Number.isInteger(error.upstreamStatus)?error.upstreamStatus:null,...(attempts&&attempts.length?{details:{attempts}}:{})};
}
export function reportedPinURL(value){const url=httpsURL(value),match=/^\/pin\/(\d{5,40})\/?$/.exec(url.pathname);if(!['www.pinterest.com','pinterest.com'].includes(url.hostname)||!match||url.search)reject('invalid_pin_url','Enter your actual https://www.pinterest.com/pin/…/ URL. It will be labeled user-reported, not API-verified.');return `https://www.pinterest.com/pin/${match[1]}/`;}
