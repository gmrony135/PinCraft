import 'server-only';
import {createHash} from 'node:crypto';
import {requestData,httpsURL} from '../automation/http.mjs';
import {AutomationError} from '../automation/errors.mjs';
import {BLOG_TREND_REGIONS} from './blog-automation-policy.mjs';
// Search terms constrain retrieval and relevance. They are NOT article angles,
// trend observations, a popularity database or a fallback pool of fixed topics.
export const CATEGORY_TERMS={
 'home-decor':['home decor','interior design','small space','room decor','furniture','bedroom','living room','ঘর সাজ','অন্দরসজ্জা','আসবাব'],
 'food-recipes':['recipe','recipes','cooking','meal','baking','kitchen','রেসিপি','রান্না','খাবার'],
 'fashion-style':['fashion','outfit','wardrobe','street style','clothing','ফ্যাশন','পোশাক'],
 'beauty-skincare':['skincare','skin care','makeup','beauty','hair care','রূপচর্চা','ত্বক','মেকআপ'],
 'diy-crafts':['craft','crafts','diy','handmade','upcycling','crochet','হস্তশিল্প','কারুশিল্প'],
 'wedding-events':['wedding','bridal','event planning','table setting','বিয়ে','বিয়ে','বিবাহ'],
 'travel-tourism':['travel','tourism','destination','itinerary','packing','ভ্রমণ','পর্যটন'],
 'gardening-outdoor':['gardening','garden','plants','planting','balcony','outdoor living','বাগান','গাছ'],
 'health-wellness':['wellness','fitness','workout','stretching','sleep','walking','ব্যায়াম','ব্যায়াম','হাঁটা','ঘুম'],
 'parenting-kids':['parenting','family activities','kids craft','children reading','family routine','অভিভাবক','শিশু','পরিবার'],
};
const STOP=new Set(('the a an and or of for to in on with your this that these those is are was were be by from as at it its how why what when which who you we our their has have into new latest best top now today says say can will more all every most not than about after before over up out just first here news guide practical simple tips ideas trend trends trending year years day days home decor interior design recipe recipes fashion style beauty craft crafts wedding travel tourism gardening garden outdoor health wellness fitness parenting kids family room small space according get make ways look new york times yahoo google msn review reviews article articles watch november december january february march april may june july august september october একটি এবং জন্য নিয়ে থেকে সাথে নতুন সবচেয়ে মধ্যে করা করুন আপনার এই যে কি কেন').split(/\s+/));
const HIGH_RISK=/\b(?:cancer|diabetes|diagnos\w*|cure[sd]?|treat(?:ment|s)?|prescri\w*|suicid\w*|killed|murder\w*|death|war|election|politic\w*|cryptocurr\w*|investment|recall|alleg\w*|scam|weight.loss|ozempic|pregnan\w*)\b|ক্যান্সার|ডায়াবেটিস|হত্যা|নিহত|নির্বাচন|চিকিৎসা|ঔষধ|ওষুধ|গর্ভ|[$£€]\s*\d|\b\d+(?:\.\d+)?\s*(?:percent|%)|\b(?:sale|deals?|discount|coupon)\b/iu;
const norm=value=>String(value).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
export const topicTokens=value=>[...new Set(norm(value).split(' ').filter(w=>w.length>2&&!STOP.has(w)).map(w=>/^[a-z]{6,}s$/.test(w)?w.slice(0,-1):w))].sort();
const intersect=(a,b)=>a.filter(t=>b.includes(t)).length;
export function topicsOverlap(a,b){const n=intersect(a,b);return n>=2&&(n/Math.max(a.length,b.length)>=.5||n/Math.min(a.length,b.length)>=.75);}
export function rssText(value=''){
 return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&(?:amp|lt|gt|quot|apos);/g,e=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[e])).replace(/&#(x[0-9a-f]+|\d+);/gi,(_,s)=>{const n=s[0].toLowerCase()==='x'?parseInt(s.slice(1),16):Number(s);return n>0&&n<=0x10ffff&&!((n>=0xd800)&&(n<=0xdfff))?String.fromCodePoint(n):'';}).replace(/<[^>]*>/g,'').replace(/[<>\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
}
const field=(xml,name)=>rssText(xml.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'))?.[1]||'');
function rssItems(xml){
 if(typeof xml!=='string'||Buffer.byteLength(xml)>900000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new AutomationError('invalid_trends','The current-topic feed format was rejected.',{retryable:true});
 return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0,100).map(m=>m[1]);
}
function fresh(date,now){const delta=now-Date.parse(date);return Number.isFinite(delta)&&delta>=-3600000&&delta<48*3600000;}
function publicLink(value){try{const u=httpsURL(value.replace(/^http:/,'https:'));return u.href.length<=2000?u.href:null;}catch{return null;}}
function relevance(title,settings){
 const value=' '+norm(title)+' ',matches=settings.categoryIds.flatMap(id=>CATEGORY_TERMS[id]||[]).filter(term=>value.includes(' '+norm(term)+' '));
 const focus=topicTokens(settings.topic||'');
 if(focus.length&&!focus.some(t=>topicTokens(title).includes(t)))return 0;
 return new Set(matches).size;
}
export function parseCategoryNews(xml,settings,now=Date.now()){
 return rssItems(xml).map(item=>{
  const title=field(item,'title'),publishedAt=field(item,'pubDate'),source=field(item,'source'),url=publicLink(field(item,'link'));
  const trimmed=source&&title.endsWith(' - '+source)?title.slice(0,-source.length-3):title;
  return {title:trimmed,publisher:source||'',url,publishedAt:new Date(Date.parse(publishedAt)||0).toISOString(),tokens:topicTokens(trimmed),relevance:relevance(trimmed,settings)};
 }).filter(s=>s.url&&s.publisher.length>=2&&s.publisher.length<=120&&s.title.length>=12&&s.title.length<=260&&fresh(s.publishedAt,now)&&s.relevance>0&&s.tokens.length>=2&&!HIGH_RISK.test(s.title));
}
export function parseCategorySearchTrends(xml,settings,now=Date.now()){
 return rssItems(xml).map(item=>{
  const trend=field(item,'title'),publishedAt=field(item,'pubDate');
  const news=[...item.matchAll(/<ht:news_item>([\s\S]*?)<\/ht:news_item>/g)].slice(0,5).map(m=>({title:field(m[1],'ht:news_item_title'),publisher:field(m[1],'ht:news_item_source'),url:publicLink(field(m[1],'ht:news_item_url')),publishedAt:new Date(Date.parse(publishedAt)||0).toISOString()}));
  const relevant=news.filter(n=>n.url&&n.publisher.length>=2&&n.title.length>=12&&n.title.length<=260&&relevance(n.title,settings)>0&&!HIGH_RISK.test(n.title));
  if(!fresh(publishedAt,now)||!relevant.length||HIGH_RISK.test(trend))return null;
  const title=relevant[0].title,tokens=topicTokens(trend+' '+title);
  return {topic:title,searchTerm:trend,topicTokens:tokens,signal:'google_search_trend',sources:relevant,relevance:relevance(title,settings)};
 }).filter(Boolean);
}
export function rankCategorySignals({news=[],searchTrends=[],settings,recentTopics=[],now=Date.now()}){
 const newsCandidates=news.map(seed=>{
  const cluster=news.filter(item=>{const n=intersect(seed.tokens,item.tokens);return n>=2&&n/Math.min(seed.tokens.length,item.tokens.length)>=.3;});
  const publishers=new Set(cluster.map(s=>norm(s.publisher)));
  if(publishers.size<2)return null;
  const sources=[...new Map(cluster.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).map(s=>[s.url,s])).values()].slice(0,6);
  const tokens=seed.tokens.filter(t=>cluster.filter(s=>s.tokens.includes(t)).length>=2);
  if(tokens.length<2)return null;
  return {topic:seed.title,topicTokens:tokens,signal:'recent_category_news',sources,relevance:seed.relevance};
 }).filter(Boolean);
 const candidates=[...searchTrends,...newsCandidates].filter(c=>c.topicTokens.length>=2&&!recentTopics.some(p=>p.key===createHash('sha256').update(c.topicTokens.join(' ')).digest('hex')||topicsOverlap(c.topicTokens,p.tokens||[])));
 for(const c of candidates){
  const newest=Math.max(...c.sources.map(s=>Date.parse(s.publishedAt))),hours=Math.max(0,(now-newest)/3600000),publishers=new Set(c.sources.map(s=>norm(s.publisher))).size;
  c.ranking={method:'Category/topic match, fresh dates and distinct publisher names; search-trend confirmation ranks first. This is not measured search volume or independent fact verification.',relevance:c.relevance,distinctPublishers:publishers,newestAgeHours:Math.round(hours*10)/10,score:(c.signal==='google_search_trend'?1000:0)+Math.min(6,publishers)*40+Math.min(c.relevance,5)*10+Math.round(48-hours)};
  c.topicKey=createHash('sha256').update(c.topicTokens.join(' ')).digest('hex');
 }
 return candidates.sort((a,b)=>b.ranking.score-a.ranking.score||a.topicKey.localeCompare(b.topicKey));
}
const LOCALES={BD:{en:'en',bn:'bn',gl:'BD'},US:{en:'en-US',bn:'bn',gl:'US'},GB:{en:'en-GB',bn:'bn',gl:'GB'},IN:{en:'en-IN',bn:'bn',gl:'IN'},CA:{en:'en-CA',bn:'bn',gl:'CA'},AU:{en:'en-AU',bn:'bn',gl:'AU'}};
export function categoryFeedURLs(settings){
 if(!BLOG_TREND_REGIONS.includes(settings.trendRegion)||!settings.categoryIds?.length||settings.categoryIds.some(id=>!CATEGORY_TERMS[id]))throw new AutomationError('invalid_region','Select supported categories and a trend region.');
 const locale=LOCALES[settings.trendRegion],terms=settings.categoryIds.flatMap(id=>CATEGORY_TERMS[id]).filter(t=>settings.language==='bn'||/^[\x00-\x7f]+$/.test(t)).slice(0,24),focus=(settings.topic||'').replace(/["()\\]/g,' ').trim();
 const q='('+terms.map(t=>'"'+t+'"').join(' OR ')+')'+(focus?' "'+focus+'"':'')+' when:2d';
 return {searchTrends:`https://trends.google.com/trending/rss?geo=${settings.trendRegion}`,categoryNews:'https://news.google.com/rss/search?'+new URLSearchParams({q,hl:locale[settings.language],gl:locale.gl,ceid:locale.gl+':'+settings.language})};
}
export async function selectCategoryTrend(settings,recentTopics=[],{send=requestData,now=Date.now()}={}){
 const urls=categoryFeedURLs(settings),options={format:'text',timeout:12000,maxBytes:900000,headers:{Accept:'application/rss+xml, application/xml, text/xml'}};
 const [trends,news]=await Promise.allSettled([send(urls.searchTrends,{...options,provider:'Google Trends RSS'}),send(urls.categoryNews,{...options,provider:'Current category news RSS'})]);
 let searchSignals=[],newsItems=[];
 try{if(trends.status==='fulfilled')searchSignals=parseCategorySearchTrends(trends.value,settings,now);}catch{}
 try{if(news.status==='fulfilled')newsItems=parseCategoryNews(news.value,settings,now);}catch{}
 const ranked=rankCategorySignals({news:newsItems,searchTrends:searchSignals,settings,recentTopics,now});
 if(!ranked.length)throw new AutomationError('category_trends_unavailable','No unused, sufficiently fresh category/topic signal met the evidence and safety gates. General trends, fixed angles and filler articles were not substituted. This slot can retry before its deadline.',{status:503,retryable:true});
 const selected=ranked[0];
 return {...selected,sources:selected.sources.map(({title,publisher,url,publishedAt})=>({title,publisher,url,publishedAt})),feedURLs:urls,fetchedAt:new Date(now).toISOString(),region:settings.trendRegion,categoryIds:settings.categoryIds,focus:settings.topic,label:selected.signal==='google_search_trend'?'Category-relevant Google Search trend':'Fresh category-news cluster — not measured search demand',limitations:'Headlines and dates are source signals, not verified full-text reporting, search-volume measurement or a guarantee of the best topic on the internet.'};
}
export function trendGuideTitle(evidence,language){
 const topic=evidence.topic.replace(/^(?:exclusive|watch|opinion)\s*:\s*/i,'').replace(/[!?]+/g,'').trim();
 const prefix=language==='bn'?'ব্যবহারিক গাইড: ':'Practical guide: ';
 return (prefix+topic).slice(0,190).trim();
}
