// Demo Firestore counters and synthetic transports only. NO provider calls or Pin/article generation.
import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {aiLimits,textCandidates} from '../lib/ai/config.mjs';import {generateText} from '../lib/ai/text.mjs';import {AutomationError} from '../lib/automation/errors.mjs';
import {getDatabase} from '../lib/automation/db.mjs';import {accountRef} from '../lib/automation/firestore.mjs';import {reserveAIRequest,finishAIRequest,aiUsage} from '../lib/ai/usage.mjs';import {freeUsageDay,nextFreeReset} from '../lib/free-plan.mjs';import {isolatedFirebase} from '../scripts/automation-fixtures.mjs';
isolatedFirebase();const db=getDatabase(),now=Date.parse('2026-11-21T17:50:00Z'),day=freeUsageDay(now),uid='quota-'+randomUUID();
const req=(kind='text')=>({requestKey:randomUUID(),fingerprint:'a'.repeat(64),task:kind==='text'?'quality':'image',kind});
try{
 assert.equal(aiLimits().user.text,150);assert.equal(aiLimits().user.image,20);assert(!('global'in aiLimits()));
 await db.doc(`pincraft_system/ai-${day}`).set({text:999999,image:999999,active:Array(12).fill({id:'old',until:new Date(now+100000)})});
 const ref=accountRef(db,uid).collection('aiUsage').doc(day);await ref.set({user_id:uid,day,text:150,image:20,pin_packs:20,active:[]});
 await assert.rejects(()=>reserveAIRequest(db,uid,req(),{now}),e=>e.code==='ai_daily_limit');await assert.rejects(()=>reserveAIRequest(db,uid,req('image'),{now}),e=>e.code==='ai_daily_limit');
 const other=uid+'-other';const reserved=await reserveAIRequest(db,other,req(),{now});await finishAIRequest(db,other,reserved,{error:{code:'synthetic_failure'}});
 const image=await reserveAIRequest(db,other,req('image'),{now:now+16000});await finishAIRequest(db,other,image,{error:{code:'synthetic_failure'}});
 assert.equal((await aiUsage(db,other,now)).used.text,1);assert.equal((await aiUsage(db,other,now)).used.image,1);assert.equal((await aiUsage(db,other,now)).used.pinPacks,0);
 assert.equal((await db.doc(`pincraft_system/ai-${day}`).get()).data().text,999999);
 const midnight=Date.parse('2026-11-21T18:00:01Z'),fresh=await reserveAIRequest(db,uid,req(),{now:midnight});await finishAIRequest(db,uid,fresh,{error:{code:'synthetic_failure'}});assert.equal((await aiUsage(db,uid,midnight)).used.text,1);assert.equal(nextFreeReset(now),'2026-11-21T18:00:00.000Z');
 console.log('PASS account text/image cap, exhausted legacy global doc ignored, other owners unaffected, failed-request counting preserved, Bangladesh midnight');
 const syntheticKey='synthetic-key-for-contract-test-only';let calls=[];
 const candidates=[{provider:'gemini',model:'gemini-contract',key:syntheticKey},{provider:'groq',model:'openai/gpt-oss-120b',key:syntheticKey},{provider:'cloudflare',model:'@cf/meta/llama-3.3-70b-instruct-fp8-fast',key:syntheticKey,accountId:'a'.repeat(32)}];
 const result=await generateText({prompt:'Return a JSON test acknowledgement only',candidates,circuit:new Map(),send:async(url,options)=>{calls.push(url);if(!url.includes('api.cloudflare.com'))throw new AutomationError('provider_request','Synthetic quota',{upstreamStatus:429});const body=JSON.parse(options.body);assert.equal(body.response_format.type,'json_object');assert.equal(options.headers.Authorization,`Bearer ${syntheticKey}`);return {success:true,result:{response:'{"acknowledged":true}'}}}});
 assert.equal(result.data.acknowledged,true);assert.equal(result.generation.provider,'cloudflare');assert.equal(calls.length,3);
 calls=[];await generateText({prompt:'Return a JSON test acknowledgement only',circuit:new Map(),candidates:[{provider:'groq',model:'openai/gpt-oss-20b',key:syntheticKey},{provider:'groq',model:'openai/gpt-oss-20b',key:syntheticKey+'-second'}],send:async(url,options)=>{calls.push(options.headers.Authorization);if(calls.length===1)throw new AutomationError('provider_request','Synthetic quota',{upstreamStatus:429});return {choices:[{finish_reason:'stop',message:{content:'{"acknowledged":true}'}}]}}});assert.equal(calls.length,2);assert.notEqual(calls[0],calls[1]);
 let safetyCalls=0;await assert.rejects(()=>generateText({prompt:'Synthetic safety contract',candidates,circuit:new Map(),send:async()=>{safetyCalls++;return {promptFeedback:{blockReason:'SAFETY'}}}}),e=>e.code==='content_blocked');assert.equal(safetyCalls,1);
 const old={...process.env};try{process.env.GEMINI_API_KEY=syntheticKey;process.env.GEMINI_API_KEY_2=syntheticKey+'-second';process.env.GROQ_API_KEY=syntheticKey;process.env.CLOUDFLARE_ACCOUNT_ID='a'.repeat(32);process.env.CLOUDFLARE_API_TOKEN=syntheticKey;const first=textCandidates(),second=textCandidates();assert(first.some(c=>c.provider==='cloudflare'));assert.notEqual(first.find(c=>c.provider==='gemini').key,second.find(c=>c.provider==='gemini').key);}finally{for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old)}
 console.log('PASS synthetic Cloudflare REST transport, cross-provider quota fallback, distinct-key retry/rotation, safety refusals never rerouted');
}finally{await db.terminate()}
