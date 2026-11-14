import 'server-only';
import { AutomationError } from './errors.mjs';
import { httpsURL,requestData } from './http.mjs';
import { getAccessToken } from './oauth-tokens.mjs';
import { pinterestAccountKey } from './pin-quota.mjs';
export const numericID=(id)=>typeof id==='string'&&/^\d{3,40}$/.test(id);
const bearer=(accessToken)=>({Authorization:`Bearer ${accessToken}`});
const name=(value,fallback)=>typeof value==='string'?value.slice(0,160):fallback;
const cursorOK=(cursor)=>typeof cursor==='string'&&cursor.length<=2000&&!/[\u0000-\u0020\u007f]/.test(cursor);
const sameOwner=(board,account)=>typeof board?.owner?.username==='string'&&typeof account?.username==='string'&&board.owner.username.toLowerCase()===account.username.toLowerCase();
async function pinterestAccount(token,send){
  const account=await send('https://api.pinterest.com/v5/user_account',{provider:'Pinterest authorized account',headers:bearer(token)});
  if(typeof account?.username!=='string'||!account.username||typeof account.id!=='string'||!/^\d{3,40}$/.test(account.id))throw new AutomationError('provider_auth','Pinterest did not confirm the authorized account. Reconnect Pinterest.');
  return account;
}
export async function listOAuthResources(database,userId,provider,cursor=null,send=requestData,connectionId=provider){
  if(cursor!==null&&!cursorOK(cursor))throw new AutomationError('invalid_cursor','The provider pagination cursor is invalid.');
  const {accessToken}=await getAccessToken(database,userId,provider,{send,connectionId});
  if(provider==='pinterest'){
    const account=await pinterestAccount(accessToken,send);
    const url=new URL('https://api.pinterest.com/v5/boards');url.searchParams.set('page_size','100');url.searchParams.set('privacy','PUBLIC');if(cursor)url.searchParams.set('bookmark',cursor);
    const data=await send(url.href,{provider:'Pinterest boards',headers:bearer(accessToken)});
    return {provider,items:(Array.isArray(data?.items)?data.items:[]).filter(b=>numericID(b.id)&&b.privacy==='PUBLIC'&&sameOwner(b,account)).map(b=>({id:b.id,name:name(b.name,b.id)})),nextCursor:cursorOK(data?.bookmark)?data.bookmark:null};
  }
  const url=new URL('https://www.googleapis.com/blogger/v3/users/self/blogs');url.searchParams.set('role','ADMIN');url.searchParams.set('status','LIVE');if(cursor)url.searchParams.set('pageToken',cursor);
  const data=await send(url.href,{provider:'Blogger owned blogs',headers:bearer(accessToken)});
  const items=[];
  for(const b of Array.isArray(data?.items)?data.items:[]){if(!numericID(b.id))continue;try{const url=new URL(b.url);if(url.protocol==='http:')url.protocol='https:';items.push({id:b.id,name:name(b.name,b.id),url:httpsURL(url.href).href});}catch{/* Ignore invalid/unpublished provider resources. */}}
  return {provider,items,nextCursor:cursorOK(data?.nextPageToken)?data.nextPageToken:null};
}
export async function verifyDestination(database,userId,provider,id,send=requestData,connectionId=provider){
  if(!numericID(id))throw new AutomationError('invalid_destination','Select a destination from your connected account.');
  const {accessToken,revision}=await getAccessToken(database,userId,provider,{send,connectionId});
  if(provider==='pinterest'){
    const [account,board]=await Promise.all([pinterestAccount(accessToken,send),send(`https://api.pinterest.com/v5/boards/${id}`,{provider:'Pinterest board ownership',headers:bearer(accessToken)})]);
    if(board?.id!==id||board.privacy!=='PUBLIC'||!sameOwner(board,account))throw new AutomationError('destination_not_owned','Select a public board owned by this authorized Pinterest account.');
    return {id,name:name(board.name,id),revision,connectionId,accountKey:pinterestAccountKey(account),accountName:account.username};
  }
  const data=await send(`https://www.googleapis.com/blogger/v3/users/self/blogs/${id}`,{provider:'Blogger administrator permission',headers:bearer(accessToken)});
  if(data?.blog?.id!==id||data.blog_user_info?.hasAdminAccess!==true)throw new AutomationError('destination_not_owned','Select a live Blogger blog for which this authorized account is an owner or administrator.');
  let url;try{url=new URL(data.blog.url);if(url.protocol==='http:')url.protocol='https:';url=httpsURL(url.href).href;}catch{throw new AutomationError('invalid_destination','Blogger did not confirm a public HTTPS blog URL.');}
  return {id,name:name(data.blog.name,id),url,revision,connectionId};
}

export async function readOAuthIdentity(provider, accessToken, send=requestData) {
  if(provider==='pinterest') { const account=await pinterestAccount(accessToken,send); return { id:account.id,username:account.username,name:account.username }; }
  const account=await send('https://www.googleapis.com/blogger/v3/users/self',{provider:'Blogger authorized account',headers:bearer(accessToken)});
  if(typeof account?.id!=='string'||!/^[A-Za-z0-9_.-]{1,128}$/.test(account.id))throw new AutomationError('provider_auth','Blogger did not confirm the authorized account. Reconnect Blogger.');
  return {id:account.id,name:name(account.displayName,'Blogger account')};
}
