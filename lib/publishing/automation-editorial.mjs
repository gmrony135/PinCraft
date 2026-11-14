import 'server-only';
import {AutomationError} from '../automation/errors.mjs';
import {articleToHTML} from './review-content.mjs';
import {articleHTML} from './article-format.mjs';
import {topicTokens,CATEGORY_TERMS} from './category-trends.mjs';
export function automationContext(evidence){return {purpose:'Original practical guide inspired by current category signals, not verified news reporting',signal:evidence.signal,topic:evidence.topic,searchTerm:evidence.searchTerm||null,sourceHeadlines:evidence.sources.map(s=>({title:s.title,publisher:s.publisher,publishedAt:s.publishedAt})),limitations:evidence.limitations};}
const reject=message=>{throw new AutomationError('automation_quality_gate',message,{status:422});};
export function validateAutomaticArticle(article,title,evidence){
 if(!article||article.title!==title||article.wordCount<500||article.wordCount>850||!article.plainText||!Array.isArray(article.sections)||article.sections.length!==3)reject('The generated article did not meet the existing complete-article requirements. Nothing was queued.');
 const html=articleHTML(articleToHTML(article)),paragraphs=[article.intro,...article.sections.flatMap(s=>s.paragraphs),article.conclusion].map(t=>t.toLocaleLowerCase().replace(/\s+/g,' ').trim());
 if(new Set(paragraphs).size!==paragraphs.length||paragraphs.some(p=>p.length<70))reject('The generated article repeated or omitted substantive paragraphs. No filler was published.');
 if(/lorem ipsum|as an ai(?: language model)?|\[insert|\bTODO\b|placeholder|guaranteed (?:viral|income|cure|traffic)|ignore (?:all |previous )?instructions/i.test(article.plainText))reject('The generated article contained placeholder, deceptive or instruction-like copy. Nothing was queued.');
 const bodyTokens=topicTokens(article.plainText),signalTokens=evidence.topicTokens||[],matches=signalTokens.filter(t=>bodyTokens.includes(t));
 if(matches.length<Math.min(2,signalTokens.length)||matches.length<1)reject('The article did not retain enough of the selected current topic to pass the relevance gate.');
 const terms=evidence.categoryIds.flatMap(id=>CATEGORY_TERMS[id]||[]);
 if(!terms.some(t=>article.plainText.toLocaleLowerCase().includes(t.toLocaleLowerCase())))reject('The generated article did not remain relevant to a selected category.');
 return {title:article.title,html,featuredImageUrl:null};
}
export function automaticEditorialReview(result){
 const passed=Boolean(result&&Number.isInteger(result.score)&&result.score>=82&&Array.isArray(result.checks)&&result.checks.length>=4&&result.checks.every(c=>c.status==='pass'));
 return {passed,score:Number.isInteger(result?.score)?result.score:null,checks:(result?.checks||[]).map(({label,status,detail})=>({label,status,detail})),summary:result?.summary||'No complete editorial review was confirmed.',threshold:82,label:'AI editorial review + deterministic structure/relevance checks',limitations:'Not independently verified fact checking, plagiarism detection, measured SEO performance or a quality guarantee.'};
}
