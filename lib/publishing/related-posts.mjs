import 'server-only';
import {AutomationError} from '../automation/errors.mjs';
import {accountRef,connectionRef,data,connected} from '../automation/firestore.mjs';
import {getAccessToken} from '../automation/oauth-tokens.mjs';
import {httpsURL,requestData} from '../automation/http.mjs';
import {numericId} from './content.mjs';
import {topicTokens} from './category-trends.mjs';
const safeDate=value=>Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
export async function listLiveBloggerPosts(db,uid,connectionId,websiteId,{send=requestData,maxPages=3}={}){
 const [authSnap,siteSnap]=await db.getAll(connectionRef(db,uid,'blogger',connectionId),accountRef(db,uid).collection('websites').doc(websiteId)),auth=data(authSnap),site=data(siteSnap);
 if(!connected(auth)||auth.user_id!==uid||auth.provider!=='blogger'||!site||site.user_id!==uid||site.removed||site.connection_id!==connectionId||site.connection_revision!==auth.revision||!numericId(site.blog_id))throw new AutomationError('website_verification_required','Reconnect and verify this Blogger blog before selecting internal links.',{status:409});
 let blog;try{blog=new URL(site.url);if(blog.protocol==='http:')blog.protocol='https:';blog=httpsURL(blog.href);}catch{throw new AutomationError('website_verification_required','The verified Blogger website does not have a safe public HTTPS address.',{status:409});}
 const access=await getAccessToken(db,uid,'blogger',{send,connectionId});if(access.revision!==auth.revision||access.accountKey!==auth.account_key)throw new AutomationError('oauth_changed','Blogger authorization changed while loading live articles. Reconnect and verify the blog again.',{status:409});
 const items=[],seen=new Set();let pageToken=null;
 for(let page=0;page<Math.min(3,Math.max(1,maxPages));page++){
  const url=new URL(`https://www.googleapis.com/blogger/v3/blogs/${site.blog_id}/posts`);url.searchParams.set('status','live');url.searchParams.set('maxResults','100');url.searchParams.set('fetchBodies','false');url.searchParams.set('fields','nextPageToken,items(id,title,url,published,labels)');if(pageToken)url.searchParams.set('pageToken',pageToken);
  const response=await send(url.href,{provider:'Blogger public live-post links',timeout:15000,maxBytes:900000,headers:{Authorization:`Bearer ${access.accessToken}`,'Accept':'application/json'}});
  for(const row of Array.isArray(response?.items)?response.items:[]){
   if(!numericId(row?.id)||seen.has(row.id)||typeof row.title!=='string'||!row.title.trim()||row.title.length>240)continue;
   try{const href=httpsURL(row.url);if(href.origin!==blog.origin||href.pathname===blog.pathname||!href.pathname.startsWith(blog.pathname.endsWith('/')?blog.pathname:blog.pathname+'/')||href.search||href.hash)continue;seen.add(row.id);items.push({id:row.id,title:row.title.trim(),url:href.href,publishedAt:safeDate(row.published),labels:Array.isArray(row.labels)?row.labels.filter(label=>typeof label==='string'&&label.length<=100).slice(0,20):[]});}catch{}
  }
  pageToken=typeof response?.nextPageToken==='string'&&response.nextPageToken.length<=2000?response.nextPageToken:null;if(!pageToken)break;
 }
 return items;
}
export function selectRelevantBloggerPosts(posts,article,{minimum=2,maximum=5}={}){
 const seed=[article?.title,article?.topic,article?.focusKeyword,...(article?.secondaryKeywords||article?.keywords||[]),...(article?.category?[article.category]:[])].filter(Boolean).join(' '),tokens=topicTokens(seed);
 const scored=(Array.isArray(posts)?posts:[]).map(post=>{const own=topicTokens(`${post.title} ${(post.labels||[]).join(' ')}`),matches=tokens.filter(token=>own.includes(token)),ratio=matches.length/Math.max(1,Math.min(tokens.length,own.length));return {...post,score:matches.length,ratio};});
 const byRelevance=(a,b)=>b.score-a.score||b.ratio-a.ratio||Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0)||a.id.localeCompare(b.id);
 const strict=scored.filter(post=>post.score>=2&&post.ratio>=0.28).sort(byRelevance).slice(0,maximum);
 // A young blog rarely has two strongly relevant posts for a news-driven topic.
 // Fall back to the best-matching live posts so the article still ships with
 // internal links instead of skipping the whole slot.
 const ranked=strict.length>=minimum?strict:[...scored].sort(byRelevance).slice(0,maximum);
 if(ranked.length<minimum)throw new AutomationError('article_internal_links_missing',`Only ${ranked.length} relevant published Blogger article${ranked.length===1?'':'s'} could be confirmed; at least ${minimum} are required. This article was not queued or published. Add relevant live posts to the selected blog and retry a later slot.`,{status:422});
 return ranked.map(({id,title,url,publishedAt})=>({id,title,url,publishedAt}));
}
export async function verifySelectedBloggerPosts(db,uid,connectionId,websiteId,selected,article,{send=requestData}={}){
 if(!Array.isArray(selected)||selected.length<2||selected.length>5||new Set(selected.map(post=>post?.id)).size!==selected.length)throw new AutomationError('article_internal_links_missing','Select two to five relevant live articles from the verified Blogger blog. No publication was queued. This slot was not published.',{status:422});
 const live=await listLiveBloggerPosts(db,uid,connectionId,websiteId,{send}),candidates=selectRelevantBloggerPosts(live,article,{minimum:2,maximum:5}),byId=new Map(candidates.map(post=>[post.id,post]));
 const verified=selected.map(post=>{
  const match=byId.get(post.id);let url;try{url=new URL(post.url).href;}catch{url='';}
  if(!match||match.title!==post.title||match.url!==url)throw new AutomationError('article_internal_links_stale','A selected internal link is no longer a relevant, live post on this verified blog. Refresh the list and review your links again. No publication was queued.',{status:409});
  return {id:match.id,title:match.title,url:match.url,publishedAt:match.publishedAt};
 });
 return verified;
}
