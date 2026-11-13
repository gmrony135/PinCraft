// EXPLICIT LOCAL TEST FIXTURES. Never imported by app/, lib/ or components/.
import { randomUUID } from 'node:crypto';
import { encryptCredentials } from '../lib/automation/vault.mjs';
import { BLOGGER_SCOPE,PINTEREST_SCOPES } from '../lib/automation/oauth-config.mjs';
import { saveOAuthGrant } from '../lib/automation/oauth-store.mjs';
import { ensureSettings,saveAI,saveDestinations,setMode,updatePreferences } from '../lib/automation/repository.mjs';
import { DEFAULT_TOPICS } from '../lib/automation/shared.mjs';
import { validateContent } from '../lib/automation/content.mjs';
export const BOARD='12345678901',BLOG='123456789012';
export const ai={aiProvider:'openai',aiKey:'isolated-ai-api-key',model:'gpt-4.1-mini'};
export const paragraph='A thoughtful routine begins with a small decision that you can repeat with care. Set aside a quiet moment, notice what matters to you, and write one practical intention for the day. You do not need to solve everything at once. Focus instead on a useful action that fits your situation. Give yourself room to learn, adjust your expectations, and build a steady habit through patient practice. Reflection can help you recognize patterns without judging yourself harshly or comparing your progress with somebody else’s experience. Choose an approach that feels honest, simple, and sustainable. Your next step can be modest while still making your daily life more intentional and grounded.';
export const raw={title:'Small Habits for a More Intentional Day',description:'Build a thoughtful daily routine with practical, gentle steps.',hashtags:['#DailyHabits','#MindfulLiving','#Motivation','#PersonalGrowth','#SimpleLiving','#Reflection'],intro:paragraph,sections:[{heading:'Choose your focus',paragraphs:[paragraph,paragraph]},{heading:'Make room to reflect',paragraphs:[paragraph]},{heading:'Keep the next step small',paragraphs:[paragraph]}],conclusion:paragraph};
export const content=validateContent(raw,'Motivation');
export const grant=(provider,user='test')=>({accessToken:`isolated-${provider}-access-${user}`,refreshToken:`isolated-${provider}-refresh-${user}`,expiresAt:new Date(Date.now()+86400000),refreshExpiresAt:provider==='pinterest'?new Date(Date.now()+60*86400000):null,scopes:provider==='pinterest'?PINTEREST_SCOPES:[BLOGGER_SCOPE]});
export async function fixtureAccount(db,{id=`oauth-test:${randomUUID()}`,activate=true,mode='generated',dailyLimit=10,intervalMinutes=120}={}){
  await ensureSettings(db,id);
  for(const provider of ['pinterest','blogger']){
    await db.query("INSERT INTO pincraft_oauth_connections(user_id,provider,status) VALUES($1,$2,'disconnected') ON CONFLICT DO NOTHING",[id,provider]);
    const rev=(await db.query('SELECT revision FROM pincraft_oauth_connections WHERE user_id=$1 AND provider=$2',[id,provider])).rows[0].revision;
    await saveOAuthGrant(db,id,provider,grant(provider,id),rev);
  }
  const revs=(await db.query('SELECT provider,revision FROM pincraft_oauth_connections WHERE user_id=$1',[id])).rows;
  await saveDestinations(db,id,{pinterest:{id:BOARD,name:'Isolated test board',revision:revs.find(r=>r.provider==='pinterest').revision},blogger:{id:BLOG,name:'Isolated Blogger test blog',url:'https://blog.example.com',revision:revs.find(r=>r.provider==='blogger').revision}});
  await saveAI(db,id,encryptCredentials(id,ai),{aiProvider:ai.aiProvider,model:ai.model,verifiedAt:new Date().toISOString()});
  await updatePreferences(db,id,{topics:DEFAULT_TOPICS,timezone:'Asia/Dhaka',topicSource:'rotation',trendRegion:'BD',postingMode:mode,dailyLimit,intervalMinutes});
  if(activate)await setMode(db,id,true);
  await db.query("UPDATE pincraft_auto_settings SET next_run_at=now()-interval '1 second' WHERE user_id=$1",[id]);
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
    if(url.includes('/v5/user_account'))return {username:'isolated_owner'};
    if(url.includes('/v5/boards/'))return {id:BOARD,name:'Isolated test board',privacy:'PUBLIC',owner:{username:'isolated_owner'}};
    if(url.includes('/v5/boards?'))return {items:[{id:BOARD,name:'Isolated test board',privacy:'PUBLIC',owner:{username:'isolated_owner'}},{id:'2222222222',name:'Someone else’s board',privacy:'PUBLIC',owner:{username:'another_owner'}},{id:'3333333333',name:'Private board',privacy:'SECRET',owner:{username:'isolated_owner'}}],bookmark:null};
    if(url.includes('/blogger/v3/users/self/blogs/'))return {blog:{id:BLOG,name:'Isolated test blog',url:'http://blog.example.com'},blog_user_info:{hasAdminAccess:true}};
    if(url.includes('/blogger/v3/users/self/blogs?'))return {items:[{id:BLOG,name:'Isolated test blog',url:'http://blog.example.com'}]};
    if(url.includes('/posts?isDraft=false')){calls.blog++;articles.push({body:JSON.parse(init.body),headers:init.headers});if(options.blog)await options.blog(calls,init);return {id:'12345678901234',url:'http://blog.example.com/published',published:new Date().toISOString(),status:'LIVE'};}
    if(url==='https://api.pinterest.com/v5/pins'&&init.method==='POST'){calls.pin++;pins.push({body:JSON.parse(init.body),headers:init.headers});if(options.pin)await options.pin(calls,init);return {id:'9876543210987'};}
    if(url==='https://oauth2.googleapis.com/revoke'){if(options.revoke)await options.revoke(init);return '';}
    throw new Error('Unexpected provider request in isolated fixture');
  };
  return {send,calls,pins,articles,imageURL:id=>`https://pincraftly.vercel.app/api/automation/image/${id}?sig=isolated-fixture`,verifyImage:async()=>{}};
}
