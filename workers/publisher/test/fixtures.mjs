// Synthetic local fixtures only. No credentials are loaded from disk/env and
// no real provider request can leave this transport.
import { seal } from '../src/security.mjs';
import { ownerPath,connPath,accountKey,emptyConnection } from '../src/model.mjs';
import { ProviderHTTP } from '../src/http.mjs';
import { OAuth } from '../src/oauth.mjs';
import { PublishingJobs } from '../src/jobs.mjs';
export const TEST_KEY=btoa(String.fromCharCode(...new Uint8Array(32).fill(13)));
export const environment=()=>({APP_URL:'https://pincraftly.vercel.app',FIREBASE_PROJECT_ID:'demo-pincraft-local',TOKEN_ENCRYPTION_KEY:TEST_KEY,PINTEREST_CLIENT_ID:'synthetic-app-id',PINTEREST_CLIENT_SECRET:'synthetic-app-secret-not-a-credential',PINTEREST_REDIRECT_URI:'https://pincraftly.vercel.app/api/pinterest/callback',GOOGLE_CLIENT_ID:'synthetic-google-web-id',GOOGLE_CLIENT_SECRET:'synthetic-google-secret-not-a-credential',GOOGLE_REDIRECT_URI:'https://pincraftly.vercel.app/api/blogger/callback',PINTEREST_ACCESS_TIER:'trial',PUBLIC_IMAGE_HOSTS:'images.example.net',PINCRAFT_PUBLISH_BRIDGE_SECRET:'synthetic-bridge-secret-for-local-tests-only'});
export class MemoryStore {
 constructor(){this.rows=new Map();this.tail=Promise.resolve();this.managed=new Set();this.commits=0;this.afterCommit=null;}
 async get(path){return structuredClone(this.rows.get(path)||null);}
 async list(parent,collection,{field=null,op='EQUAL',value=null,order=null,direction='ASCENDING',limit=50}={}){const prefix=(parent?parent+'/':'')+collection+'/';let rows=[...this.rows].filter(([p])=>p.startsWith(prefix)&&!p.slice(prefix.length).includes('/')).map(([path,value])=>({path,value:structuredClone(value)}));const compare=(a,b)=>a instanceof Date?a.getTime()-(b instanceof Date?b.getTime():Number(b)):typeof a==='number'?a-b:String(a).localeCompare(String(b));if(field)rows=rows.filter(r=>r.value[field]!==undefined&&(op==='EQUAL'?r.value[field]===value:op==='LESS_THAN_OR_EQUAL'?compare(r.value[field],value)<=0:false));if(order)rows.sort((a,b)=>compare(a.value[order],b.value[order])*(direction==='DESCENDING'?-1:1)||a.path.localeCompare(b.path));return rows.slice(0,limit);}
 async transaction(task){let release;const old=this.tail;this.tail=new Promise(r=>{release=r;});await old;const writes=new Map();let dirty=false;const read=fn=>{if(dirty)throw new Error('Read after write');return fn();};try{const result=await task({get:p=>read(()=>this.get(p)),list:(p,c,o)=>read(()=>this.list(p,c,o)),set:(p,v)=>{dirty=true;writes.set(p,structuredClone(v));},delete:p=>{dirty=true;writes.set(p,null);}});for(const[p,v]of writes)if(v===null)this.rows.delete(p);else this.rows.set(p,v);this.commits++;if(this.afterCommit)await this.afterCommit(writes);return result;}finally{release();}}
 async set(p,v){return this.transaction(tx=>tx.set(p,v));}
 async managedUser(uid){if(!this.managed.has(uid))throw Object.assign(new Error('Synthetic disabled user'),{code:'identity_unavailable',status:403});return true;}
}
export class Fixture {
 constructor(){this.env=environment();this.db=new MemoryStore();this.now=Date.parse('2026-11-13T13:00:00Z');this.requests=[];this.posts=new Map();this.pins=new Map();this.nextPost=900000;this.nextPin=800000;this.refreshes={pinterest:0,blogger:0};this.intercept=null;this.image=new Uint8Array(33);this.image.set([137,80,78,71,13,10,26,10]);this.image[32]=7;this.send=this.send.bind(this);this.rebuild();}
 rebuild(){this.http=new ProviderHTTP(this.send,this.env.PUBLIC_IMAGE_HOSTS);this.oauth=new OAuth(this.env,this.db,this.http);this.jobs=new PublishingJobs(this.env,this.db,this.http,this.oauth,()=>this.now);}
 async seed(uid='synthetic-owner-1',{pinIdentity='111111',pinConnection='pinterest',bloggerConnection='blogger'}={}){
  this.db.managed.add(uid);const root=await ownerPath(uid);this.db.rows.set(root,{user_id:uid,enabled:false,created_at:new Date(this.now)});
  for(const[p,id,identity]of[['pinterest',pinConnection,pinIdentity],['blogger',bloggerConnection,'222222']]){const row={...emptyConnection(uid,p,id),status:'connected',created_at:new Date(this.now),revision:1,token_version:1,account_key:await accountKey(p,identity),account_name:p==='pinterest'?'synthetic-renter':'Synthetic Blogger',expires_at:new Date(Date.now()+3600000),refresh_expires_at:new Date(Date.now()+60*86400000),encrypted_tokens:await seal(this.env,`oauth:v1:${p}:${uid}${id===p?'':':'+id}`,{accessToken:`synthetic-access-${p}`,refreshToken:`synthetic-refresh-${p}`})};this.db.rows.set(await connPath(uid,p,id),row);}
  this.db.rows.set(root+'/websites/blogger_555555',{id:'blogger_555555',user_id:uid,provider:'blogger',blog_id:'555555',name:'Synthetic renter blog',url:'https://blog.example.net/',connection_id:bloggerConnection,connection_revision:1,removed:false,created_at:new Date(this.now)});return uid;
 }
 payload(extra={}){return {requestId:crypto.randomUUID(),article:{title:'Renter-friendly small apartment storage',html:'<p>A reviewed introduction about useful storage.</p><h2>Keep the floor clear</h2><p>Try a freestanding shelf and check the load rating.</p>',featuredImageUrl:''},pin:{title:'Small apartment storage for renters',description:'Practical renter-friendly storage ideas, reviewed before publishing.',hashtags:['#SmallApartment','#RenterFriendly'],imageUrl:'https://images.example.net/reviewed.png',altText:'A small organized living room',boardId:'777777',connectionId:'pinterest'},bloggerConnectionId:'blogger',websiteId:'blogger_555555',blogPublishAtUTC:'now',pinPublishAtUTC:'now',timezone:'America/New_York',reviewed:true,trialConsent:true,...extra};}
 async create(uid='synthetic-owner-1',body=this.payload()){return (await this.jobs.create(uid,body)).job;}
 resetBudget(){this.http.calls=0;}
 async process(id,uid){const http=new ProviderHTTP(this.send,this.env.PUBLIC_IMAGE_HOSTS),oauth=new OAuth(this.env,this.db,http),jobs=new PublishingJobs(this.env,this.db,http,oauth,()=>this.now);return jobs.process(id,uid);}
 async finishArticle(id,uid){let r;for(let n=0;n<3;n++)r=await this.process(id,uid);return r.job;}
 reply(value,status=200,headers={}){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json',...headers}});}
 async send(input,options={}){
  const url=new URL(input instanceof Request?input.url:input),method=options.method||'GET',record={url:url.href,method,headers:options.headers||{},body:options.body};this.requests.push(record);if(this.intercept){const r=await this.intercept(record,this);if(r)return r;}
  if(url.hostname==='images.example.net')return new Response(this.image,{headers:{'Content-Type':'image/png'}});
  if(url.hostname==='blog.example.net'){const post=[...this.posts.values()].find(p=>new URL(p.url).pathname===url.pathname);return new Response('<html><body>Actual synthetic fixture article</body></html>',{status:post&&post.status==='LIVE'?200:404,headers:{'Content-Type':'text/html'}});}
  if(url.pathname.endsWith('/oauth/token')||url.href==='https://oauth2.googleapis.com/token'){
   const p=url.hostname==='api.pinterest.com'?'pinterest':'blogger';this.refreshes[p]++;return this.reply({access_token:`synthetic-rotated-${p}-${this.refreshes[p]}`,refresh_token:`synthetic-new-refresh-${p}-${this.refreshes[p]}`,token_type:'bearer',expires_in:3600,refresh_token_expires_in:60*86400,scope:p==='pinterest'?'pins:read,pins:write,boards:read,boards:write,user_accounts:read':'https://www.googleapis.com/auth/blogger'});
  }
  if(url.href==='https://oauth2.googleapis.com/revoke')return new Response('',{status:200});
  if(url.pathname==='/v5/user_account')return this.reply({id:'111111',username:'synthetic-renter'});
  if(url.pathname==='/v5/boards')return this.reply({items:[{id:'777777',name:'Renter-friendly storage',privacy:'PUBLIC',owner:{username:'synthetic-renter'}},{id:'666666',name:'Another user board',privacy:'PUBLIC',owner:{username:'somebody-else'}},{id:'444444',name:'Secret board',privacy:'SECRET',owner:{username:'synthetic-renter'}}]});
  if(url.pathname.startsWith('/v5/boards/')){const id=url.pathname.split('/').at(-1);return id==='777777'?this.reply({id,name:'Renter-friendly storage',privacy:'PUBLIC',owner:{username:'synthetic-renter'}}):this.reply({message:'Board access denied'},403);}
  if(url.pathname==='/blogger/v3/users/self')return this.reply({id:'222222',displayName:'Synthetic Blogger'});
  if(url.pathname==='/blogger/v3/users/self/blogs')return this.reply({items:[{id:'555555',name:'Synthetic renter blog',url:'https://blog.example.net/'}]});
  if(url.pathname==='/blogger/v3/users/self/blogs/555555')return this.reply({blog:{id:'555555',name:'Synthetic renter blog',url:'https://blog.example.net/'},blog_user_info:{hasAdminAccess:true}});
  if(url.pathname==='/blogger/v3/blogs/555555/posts'&&method==='POST'){const body=JSON.parse(options.body),id=String(++this.nextPost),post={id,blog:{id:'555555'},status:'DRAFT',url:`https://blog.example.net/2026/11/${id}.html`,...body};this.posts.set(id,post);return this.reply(post);}
  const match=/^\/blogger\/v3\/blogs\/555555\/posts\/(\d+)(\/publish)?$/.exec(url.pathname);
  if(match){const post=this.posts.get(match[1]);if(!post)return this.reply({error:{message:'Not found'}},404);if(match[2]){const at=url.searchParams.get('publishDate');post.status=at&&Date.parse(at)>this.now?'SCHEDULED':'LIVE';post.published=at||new Date(this.now).toISOString();}else if(post.status==='SCHEDULED'&&Date.parse(post.published)<=this.now)post.status='LIVE';return this.reply(post);}
  if(url.pathname==='/v5/pins'&&method==='POST'){const body=JSON.parse(options.body),id=String(++this.nextPin),pin={id,...body};this.pins.set(id,pin);return this.reply(pin,201);}
  if(/^\/v5\/pins\/\d+$/.test(url.pathname))return this.pins.has(url.pathname.split('/').at(-1))?this.reply(this.pins.get(url.pathname.split('/').at(-1))):this.reply({message:'Not found'},404);
  throw new Error('Unexpected synthetic request: '+method+' '+url.origin+url.pathname);
 }
}
