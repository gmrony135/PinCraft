import 'server-only';
import {AutomationError} from '../automation/errors.mjs';
import {numericId} from './content.mjs';
import {publicationMarker} from './blogger.mjs';

const states=['DRAFT','SCHEDULED','LIVE'];
const messages={
 direct:'Google confirmed administrator access to this same blog and returned the requested post.',
 admin_list:'The direct post lookup returned 404, but an authenticated ADMIN list returned this exact post ID with this job’s marker. No new post was created.',
 candidate:'The entered post ID returned 404. A different existing post contains this exact job’s marker. Review the matched ID below and explicitly verify it; nothing was resumed automatically.',
 ambiguous:'More than one existing post contains this job’s marker. Nothing was selected or resumed. Inspect these posts in Blogger before continuing.',
 missing:'Google confirmed administrator access to this same blog, but the requested post ID returned 404 and no matching job marker appeared in this bounded check. This is not proof of deletion. Do not submit another copy.',
 blog_unavailable:'Google could not confirm administrator access to the original blog. Check this same blog under the original Google account; this is not a post-field or quota diagnosis.',
 authorization_unavailable:'Google could not authorize this inspection. Reconnect the original Google account with Blogger permission, then re-verify this same blog before trying again.',
 incomplete:'The read-only post check could not finish. Its result does not establish whether the post exists. No new post or publication request was sent.',
};
// Only neutral status/ID/count flags cross the owner API boundary. Never URLs,
// preview tokens, unrelated post titles/content, page tokens or provider bodies.
export function publicInspection(value){
 if(!value||!Object.hasOwn(messages,value.outcome))return null;
 return {outcome:value.outcome,message:messages[value.outcome],adminConfirmed:value.adminConfirmed===true,blogHTTP:Number.isInteger(value.blogHTTP)?value.blogHTTP:null,primaryHTTP:Number.isInteger(value.primaryHTTP)?value.primaryHTTP:null,scanRequests:Number.isInteger(value.scanRequests)?value.scanRequests:0,scanPosts:Number.isInteger(value.scanPosts)?value.scanPosts:0,scanLimited:value.scanLimited===true,matchedPostId:numericId(value.matchedPostId)?value.matchedPostId:null,matchedPostStatus:states.includes(value.matchedPostStatus)?value.matchedPostStatus:null,source:['posts_get','admin_list'].includes(value.source)?value.source:null};
}
function rejected(code,outcome,diagnostic,cause=null){
 if(cause?.code==='oauth_reconnect_required'||[401,403].includes(cause?.upstreamStatus)){code='oauth_reconnect_required';outcome='authorization_unavailable';}
 const saved={...diagnostic,outcome},error=new AutomationError(code,messages[outcome],{status:409,upstreamStatus:Number.isInteger(cause?.upstreamStatus)?cause.upstreamStatus:null});
 error.inspectionDiagnostic=saved;return error;
}
// Called only by an explicit, authenticated owner inspection. This is NOT used
// by the runner, draft insertion, retries or final LIVE/public-page verification.
export async function inspectExistingBloggerPost(publisher,job,id){
 if(!numericId(id))throw new AutomationError('invalid_remote_id','Enter the actual Blogger post ID.');
 const diagnostic={adminConfirmed:false,blogHTTP:null,primaryHTTP:null,scanRequests:0,scanPosts:0,scanLimited:false,matchedPostId:null,matchedPostStatus:null,source:null};
 try{await publisher.verifyBlog(job,{timeout:10000});diagnostic.adminConfirmed=true;diagnostic.blogHTTP=200;}
 catch(error){diagnostic.blogHTTP=Number.isInteger(error.upstreamStatus)?error.upstreamStatus:null;throw rejected('inspection_blog_unavailable','blog_unavailable',diagnostic,error);}
 try{
  const post=await publisher.get(job,id,{content:true,timeout:10000});
  return {post,diagnostic:{...diagnostic,primaryHTTP:200,matchedPostId:id,matchedPostStatus:post.status,source:'posts_get',outcome:'direct'}};
 }catch(error){
  diagnostic.primaryHTTP=Number.isInteger(error.upstreamStatus)?error.upstreamStatus:null;
  if(error.upstreamStatus!==404)throw rejected('inspection_unconfirmed','incomplete',diagnostic,error);
 }
 const matches=new Map(),deadline=Date.now()+28000;
 for(const status of ['draft','scheduled','live']){
  if(Date.now()>=deadline){diagnostic.scanLimited=true;throw rejected('inspection_unconfirmed','incomplete',diagnostic);}
  const query=new URLSearchParams({view:'ADMIN',status,fetchBodies:'true',fetchImages:'false',maxResults:'25',orderBy:'updated',fields:'nextPageToken,items(id,blog,status,url,published,title,content)'});
  let result;
  try{diagnostic.scanRequests++;result=await publisher.call(job,`blogs/${job.payload.blogId}/posts?${query}`,{timeout:8000});}
  catch(error){diagnostic.scanLimited=true;throw rejected('inspection_unconfirmed','incomplete',diagnostic,error);}
  if(!result||result.items!==undefined&&!Array.isArray(result.items))throw rejected('inspection_unconfirmed','incomplete',diagnostic);
  if(result.nextPageToken)diagnostic.scanLimited=true;
  const posts=(result.items||[]).slice(0,25);diagnostic.scanPosts+=posts.length;
  if((result.items||[]).length>25)diagnostic.scanLimited=true;
  for(const post of posts){
   if(numericId(post?.id)&&post.blog?.id===job.payload.blogId&&states.includes(post.status)&&typeof post.content==='string'&&post.content.includes(publicationMarker(job.id)))matches.set(post.id,post);
  }
 }
 if(matches.size>1)throw rejected('inspection_ambiguous','ambiguous',diagnostic);
 if(!matches.size)throw rejected('inspection_post_unavailable','missing',diagnostic);
 const [matchedId,post]=[...matches][0];diagnostic.matchedPostId=matchedId;diagnostic.matchedPostStatus=post.status;diagnostic.source='admin_list';
 if(matchedId!==id)throw rejected('inspection_candidate_found','candidate',diagnostic);
 return {post,diagnostic:{...diagnostic,outcome:'admin_list'}};
}
