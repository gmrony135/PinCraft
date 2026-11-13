// Run with Node 22, react-server condition and the explicit local HTTP-fixture
// preload. This exercises the deployable native bundle, NOT a live Scheduler.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {getDatabase} from '../lib/automation/db.mjs';
import {getJob,getSettings} from '../lib/automation/repository.mjs';
import {data,connectionRef} from '../lib/automation/firestore.mjs';
import {addQueuedPin,queueInput} from '../lib/automation/queue.mjs';
import {isolatedFirebase,resetFirebase,fixtureAccount} from './automation-fixtures.mjs';
isolatedFirebase();
if(process.versions.node.split('.')[0]!=='22'||process.env.AUTOMATION_HTTP_FIXTURES!=='1')throw new Error('Run only under Node 22 with the explicit demo-emulator HTTP preload.');
const db=getDatabase(),results=[];let handler,fnAdmin;
async function test(name,task){try{await task();results.push({name,pass:true});console.log('PASS '+name);}catch(error){results.push({name,pass:false,error:error.message});console.error('FAIL '+name+': '+error.message);}}
try{
 await resetFirebase();
 await test('The shared scheduled-function bundle imports under actual Node 22',async()=>{({pincraftAutoPost:handler}=await import('../functions/runtime/index.mjs'));assert.equal(typeof handler.run,'function');fnAdmin=await import('../functions/node_modules/firebase-admin/lib/app/index.js');});
 await test('The deployable export is a native Gen 2 UTC 30-minute schedule, not a public callable/HTTP trigger',()=>{const ep=handler.__endpoint;assert.equal(ep.platform,'gcfv2');assert.equal(ep.scheduleTrigger.schedule,'*/30 * * * *');assert.equal(ep.scheduleTrigger.timeZone,'UTC');assert(!ep.httpsTrigger&&!ep.callableTrigger);assert.deepEqual(ep.region,['asia-south1']);});
 await test('Scheduler retries are disabled; persisted application retries keep their separate one-hour policy',()=>assert.equal(handler.__endpoint.scheduleTrigger.retryConfig.retryCount,0));
 await test('The native bundle declares all five Secret Manager bindings, bounded concurrency and runtime budget',()=>{const ep=handler.__endpoint;assert.equal(ep.maxInstances,1);assert.equal(ep.concurrency,1);assert.equal(ep.timeoutSeconds,300);assert.equal(ep.minInstances,0);assert.deepEqual(ep.secretEnvironmentVariables.map(s=>s.key).sort(),['AUTOMATION_ENCRYPTION_KEY','BLOGGER_CLIENT_SECRET','GEMINI_API_KEY','GROQ_API_KEY','PINTEREST_CLIENT_SECRET']);});
 await test('Firebase deployment configuration selects Node 22 and builds from shared source before deploy',async()=>{const config=JSON.parse(await readFile(new URL('../firebase.json',import.meta.url),'utf8'));assert.equal(config.functions[0].runtime,'nodejs22');assert(config.functions[0].predeploy[0].includes('build:functions'));});
 await test('Functions keeps the last Node 22-compatible Realtime Database adapter instead of a Node 24-only transitive release',async()=>{const lock=JSON.parse(await readFile(new URL('../functions/package-lock.json',import.meta.url),'utf8')),packages=Object.entries(lock.packages).filter(([path])=>path.endsWith('node_modules/@firebase/database-compat')).map(([,value])=>value);assert(packages.length>0);for(const p of packages){assert.equal(p.version,'2.1.7');assert.equal(p.engines.node,'>=20.0.0');}});
 await test('An actual Node 22 native handler invocation persists an idle Firestore heartbeat without a browser',async()=>{await handler.run({scheduleTime:new Date().toISOString()});assert.equal(data(await db.doc('pincraft_system/heartbeat').get()).last_status,'ok');});
 const owner=await fixtureAccount(db,{mode:'queue'}),input=queueInput({title:'Native Node 22 offline fixture Pin',description:'Explicit local provider double; not a real Pinterest publication.',imageUrl:'https://placehold.co/1000x1500/png',destinationUrl:'https://example.com/post',requestKey:randomUUID()}),id=await addQueuedPin(db,owner,input,{verifyImage:async()=>{},resolve:async()=>[{address:'1.1.1.1',family:4}]});
 await test('Actual Node 22 scheduled bundle claims, validates a real public PNG and persists a fixture-confirmed Pin',async()=>{await handler.run({scheduleTime:new Date().toISOString()});const job=await getJob(db,id);assert.equal(job.user_id,owner);assert.equal(job.state,'success');assert.equal(job.pin_url,'https://www.pinterest.com/pin/9876543210987/');assert.equal((await getSettings(db,owner)).total_success,1);assert.equal(data(await connectionRef(db,owner,'pinterest').get()).status,'connected');});
 await test('A repeated native handler invocation cannot republish the same completed Firestore Pin',async()=>{await handler.run({scheduleTime:new Date().toISOString()});assert.equal((await getSettings(db,owner)).total_success,1);assert.equal((await getJob(db,id)).attempts,1);});
}finally{
 await db.terminate();if(fnAdmin)await Promise.all(fnAdmin.getApps().map(fnAdmin.deleteApp));await mkdir(new URL('../.shots/',import.meta.url),{recursive:true});await writeFile(new URL('../.shots/functions-verification.json',import.meta.url),JSON.stringify({node:process.version,mode:'Actual Node 22 native scheduled-function bundle, real local Firestore and public HTTPS image; explicitly synthetic provider grant and Pin response. No deployed Functions, Scheduler delivery, production IAM, genuine consent or live publication verified.',results},null,2));
}
console.log(`\n${results.filter(r=>r.pass).length}/${results.length} native Functions runtime checks passed`);if(results.some(r=>!r.pass))process.exitCode=1;
