// EXPLICIT LOCAL TEST FIXTURES. Never imported by app/, lib/ or components/.
import { createHash, randomUUID } from 'node:crypto';
import { encryptCredentials } from '../lib/automation/vault.mjs';
import { BLOGGER_SCOPE,PINTEREST_SCOPES } from '../lib/automation/oauth-config.mjs';
import { emptyConnection,saveOAuthGrant } from '../lib/automation/oauth-store.mjs';
import { ensureSettings,saveAI,saveDestinations,setMode,updatePreferences } from '../lib/automation/repository.mjs';
import { DEFAULT_TOPICS } from '../lib/automation/shared.mjs';
import { validateContent } from '../lib/automation/content.mjs';
import { accountRef,connectionRef,data,recalculateDue } from '../lib/automation/firestore.mjs';
import { firebaseEmulatorsAllowed,firebaseProjectId } from '../lib/firebase/admin.mjs';
export const BOARD='12345678901',BLOG='123456789012';
export const ai={aiProvider:'openai',aiKey:'isolated-ai-api-key',model:'gpt-4.1-mini'};
export const paragraph='A thoughtful routine begins with a small decision that you can repeat with care. Set aside a quiet moment, notice what matters to you, and write one practical intention for the day. You do not need to solve everything at once. Focus instead on a useful action that fits your situation. Give yourself room to learn, adjust your expectations, and build a steady habit through patient practice. Reflection can help you recognize patterns without judging yourself harshly or comparing your progress with somebody else’s experience. Choose an approach that feels honest, simple, and sustainable. Your next step can be modest while still making your daily life more intentional and grounded.';
export const raw={title:'Small Habits for a More Intentional Day',description:'Build a thoughtful daily routine with practical, gentle steps.',hashtags:['#DailyHabits','#MindfulLiving','#Motivation','#PersonalGrowth','#SimpleLiving','#Reflection'],intro:paragraph,sections:[{heading:'Choose your focus',paragraphs:[paragraph,paragraph]},{heading:'Make room to reflect',paragraphs:[paragraph]},{heading:'Keep the next step small',paragraphs:[paragraph]}],conclusion:paragraph};
export const content=validateContent(raw,'Motivation');
export const fixturePinterestId=user=>(BigInt('0x'+createHash('sha256').update(user).digest('hex').slice(0,16))+100000n).toString();
export const grant=(provider,user='test')=>({accessToken:`isolated-${provider}-access-${user}`,refreshToken:`isolated-${provider}-refresh-${user}`,expiresAt:new Date(Date.now()+86400000),refreshExpiresAt:provider==='pinterest'?new Date(Date.now()+60*86400000):null,scopes:provider==='pinterest'?PINTEREST_SCOPES:[BLOGGER_SCOPE],identity:{id:fixturePinterestId(user),username:user,name:'Isolated test account'}});
export function isolatedFirebase(){if(!firebaseEmulatorsAllowed()||firebaseProjectId()!=='demo-pincraft-local'||process.env.VERCEL_ENV==='production')throw new Error('Only the explicit demo Firebase emulators may run these fixtures.');}
export async function resetFirebase(){isolatedFirebase();for(const url of [`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${firebaseProjectId()}/databases/(default)/documents`,`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${firebaseProjectId()}/accounts`]){const response=await fetch(url,{method:'DELETE'});if(!response.ok)throw new Error('Local emulator reset failed.');}}
export async function firebaseIdentity(label=randomUUID()){
 isolatedFirebase();const claims={sub:'isolated-google-'+label,email:label.replace(/[^a-zA-Z0-9]/g,'').slice(0,40)+'@example.test',email_verified:true,name:'Isolated Creator'};
 const encoded=Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.';
 const response=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${process.env.FIREBASE_WEB_API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestUri:'http://localhost',postBody:new URLSearchParams({providerId:'google.com',id_token:encoded}).toString(),returnSecureToken:true,returnIdpCredential:false})});
 const result=await response.json();if(!response.ok||!result.idToken||!result.localId)throw new Error('Explicit local Firebase Auth emulator Google fixture failed: '+JSON.stringify(result));
 return {id:result.localId,idToken:result.idToken};
}
export async function fixtureAccount(db,{id=`firebase-test:${randomUUID()}`,activate=true,mode='generated',dailyLimit=3,intervalMinutes=120}={}){
 isolatedFirebase();await ensureSettings(db,id);
 for(const provider of ['pinterest','blogger']){const ref=connectionRef(db,id,provider);if(!(await ref.get()).exists)await ref.create(emptyConnection(id,provider));await saveOAuthGrant(db,id,provider,grant(provider,id),data(await ref.get()).revision);}
 const p=data(await connectionRef(db,id,'pinterest').get()),b=data(await connectionRef(db,id,'blogger').get());
 await saveDestinations(db,id,{pinterest:{id:BOARD,name:'Isolated test board',revision:p.revision},blogger:{id:BLOG,name:'Isolated Blogger test blog',url:'https://example.com',revision:b.revision}});
 await saveAI(db,id,encryptCredentials(id,ai),{aiProvider:ai.aiProvider,model:ai.model,verifiedAt:new Date().toISOString()});
 await updatePreferences(db,id,{topics:DEFAULT_TOPICS,timezone:'Asia/Dhaka',topicSource:'rotation',trendRegion:'BD',postingMode:mode,dailyLimit,intervalMinutes});
 if(activate)await setMode(db,id,true);
 const ref=accountRef(db,id),settings=data(await ref.get());settings.next_run_at=new Date(Date.now()-1000);recalculateDue(settings);await ref.set(settings);
 return id;
}
export function providerDouble(options={}){
  const calls={ai:0,blog:0,pin:0,pinterestRefresh:0,bloggerRefresh:0};const pins=[],articles=[];
  const send=async(value,init={})=>{
    const url=String(value);
    if(url==='https://api.pinterest.com/v5/oauth/token'||url==='https://oauth2.googleapis.com/token'){
      const provider=url.includes('pinterest')?'pinterest':'blogger',body=new URLSearchParams(init.body);calls[provider==='pinterest'?'pinterestRefresh':'bloggerRefresh']++;
      if(options.token)await options.token(provider,body,init);
      return {access_token:`isolated-refreshed-${body.get('refresh_token')||body.get('code')}`,refresh_token:`isolated-rotated-${body.get('refresh_token')||body.get('code')}`,token_type:'bearer',expires_in:3600,scope:provider==='pinterest'?PINTEREST_SCOPES.join(','):BLOGGER_SCOPE,...(provider==='pinterest'?{refresh_token_expires_in:60*86400}:{})};
    }
    if(url.includes('api.openai.com')){calls.ai++;return {status:'completed',output_text:JSON.parse(init.body).input.startsWith('Return a JSON object')?'{"ready":true}':JSON.stringify(raw)};}
    if(url.includes('/v5/user_account'))return {id:'2783136121146311751',username:'isolated_owner'};
    if(url.includes('/v5/boards/'))return {id:BOARD,name:'Isolated test board',privacy:'PUBLIC',owner:{username:'isolated_owner'}};
    if(url.includes('/v5/boards?'))return {items:[{id:BOARD,name:'Isolated test board',privacy:'PUBLIC',owner:{username:'isolated_owner'}},{id:'2222222222',name:'Someone else’s board',privacy:'PUBLIC',owner:{username:'another_owner'}},{id:'3333333333',name:'Private board',privacy:'SECRET',owner:{username:'isolated_owner'}}],bookmark:null};
    if(url.includes('/blogger/v3/users/self/blogs/'))return {blog:{id:BLOG,name:'Isolated test blog',url:'http://example.com'},blog_user_info:{hasAdminAccess:true}};
    if(url.includes('/blogger/v3/users/self/blogs?'))return {items:[{id:BLOG,name:'Isolated test blog',url:'http://example.com'}]};
    if(url.includes('/posts?isDraft=false')){calls.blog++;articles.push({body:JSON.parse(init.body),headers:init.headers});if(options.blog)await options.blog(calls,init);return {id:'12345678901234',url:'http://example.com/published',published:new Date().toISOString(),status:'LIVE'};}
    if(url==='https://api.pinterest.com/v5/pins'&&init.method==='POST'){calls.pin++;pins.push({body:JSON.parse(init.body),headers:init.headers});if(options.pin)await options.pin(calls,init);return {id:'9876543210987'};}
    if(url==='https://oauth2.googleapis.com/revoke'){if(options.revoke)await options.revoke(init);return '';}
    throw new Error('Unexpected provider request in isolated fixture');
  };
  return {send,calls,pins,articles,imageURL:id=>`https://pincraftly.vercel.app/api/automation/image/${id}?sig=isolated-fixture`,verifyImage:async()=>{}};
}
