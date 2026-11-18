import test from 'node:test';
import assert from 'node:assert/strict';
import {generateText} from '../lib/ai/text.mjs';
import {textTask} from '../lib/ai/tasks.mjs';
import {AutomationError,publicError} from '../lib/automation/errors.mjs';
const candidates=[{provider:'groq',model:'fixture-one',key:'synthetic'},{provider:'groq',model:'fixture-two',key:'synthetic'}];
const complete=content=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}]});
test('article requests receive enough time and fallback gains correction instructions',async()=>{
 const task=textTask({task:'article',language:'en',title:'Ten ideas for a peaceful balcony garden',topic:'balcony garden'});assert.equal(task.timeout,40000);let calls=0;
 const output=await generateText({...task,candidates,circuit:new Map(),validate:x=>x,send:async(_,init)=>{assert.equal(init.timeout,40000);calls++;const body=JSON.parse(init.body);if(calls===1)return {choices:[{finish_reason:'length'}]};assert.match(body.messages[0].content,/Recovery requirements/);return complete({valid:true})}});assert(output.data.valid);assert.equal(calls,2);
});
test('invalid output and exhausted quota are distinct safe public failures',async()=>{
 for(const [send,code] of [[async()=>({choices:[{finish_reason:'length'}]}),'ai_invalid_output'],[async()=>{throw new AutomationError('provider_request','private provider detail',{upstreamStatus:429})},'ai_rate_limited']]){
  await assert.rejects(()=>generateText({prompt:'JSON',candidates,circuit:new Map(),send}),e=>{assert.equal(e.code,code);assert(!publicError(e).error.includes('private provider detail'));return true});
 }
});
test('safety refusal still stops immediately without fallback',async()=>{let calls=0;await assert.rejects(()=>generateText({prompt:'JSON',candidates,circuit:new Map(),send:async()=>{calls++;return {choices:[{finish_reason:'content_filter'}]}}}),e=>e.code==='content_blocked');assert.equal(calls,1)});
