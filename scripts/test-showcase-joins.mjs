import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {showcaseChannel,showcaseUid,joinStatus,bothJoined,confirmJoin,readJoinStatus,SHOWCASE_COLLECTION} from '../lib/showcase/joins.mjs';

// Channel and UID validation
for (const bad of ['pinterest','', 'TELEGRAM', '__proto__', 'constructor']) assert.throws(()=>showcaseChannel(bad));
assert.equal(showcaseChannel('telegram'),'telegram'); assert.equal(showcaseChannel('youtube'),'youtube');
assert.throws(()=>showcaseUid('a/b')); assert.throws(()=>showcaseUid('')); assert.throws(()=>showcaseUid('x'.repeat(129)));

// Status and "stop only after both" rule
assert.deepEqual(joinStatus(undefined),{telegramJoined:false,youtubeSubscribed:false});
assert.deepEqual(joinStatus({telegramJoined:'yes',youtubeSubscribed:true}),{telegramJoined:false,youtubeSubscribed:true});
assert.equal(bothJoined({telegramJoined:true,youtubeSubscribed:false}),false);
assert.equal(bothJoined({telegramJoined:true,youtubeSubscribed:true}),true);

// Per-user Firestore record, using an in-memory fake of the Admin SDK surface used here
function fakeDb(){const docs=new Map();return {docs,collection:(name)=>({doc:(id)=>({
  get:async()=>({data:()=>docs.get(`${name}/${id}`)}),
  set:async(data,{merge})=>{const prev=merge?docs.get(`${name}/${id}`)||{}:{};docs.set(`${name}/${id}`,{...prev,...data});},
})})};}
const db=fakeDb();
let s=await readJoinStatus(db,'uid-1'); assert.equal(bothJoined(s),false);
s=await confirmJoin(db,'uid-1','telegram'); assert.deepEqual(s,{telegramJoined:true,youtubeSubscribed:false});
assert.equal(bothJoined(s),false);
s=await confirmJoin(db,'uid-1','youtube'); assert.equal(bothJoined(s),true);
assert.equal(db.docs.get(`${SHOWCASE_COLLECTION}/uid-1`).telegramJoined,true);
// Records are per user: another UID is unaffected
assert.deepEqual(await readJoinStatus(db,'uid-2'),{telegramJoined:false,youtubeSubscribed:false});

// Static requirement checks
const popup=readFileSync(new URL('../components/onboarding/ChannelShowcase.js',import.meta.url),'utf8');
assert.doesNotMatch(popup,/pinterest/i);
assert.match(popup,/https:\/\/t\.me\/pincraft_ai/); assert.match(popup,/https:\/\/www\.youtube\.com\/@PinCraftOfficial/);
assert.match(popup,/target="_blank"/);
assert.match(popup,/I joined/); assert.match(popup,/I subscribed/);
assert.doesNotMatch(popup,/localStorage|sessionStorage/, 'dismissal must be per page visit, not stored');
const layout=readFileSync(new URL('../app/layout.js',import.meta.url),'utf8');
assert.match(layout,/<ChannelShowcase \/>/);
const dash=readFileSync(new URL('../app/dashboard/page.js',import.meta.url),'utf8');
assert.match(dash,/<HowToWorkSection\/>/);
const how=readFileSync(new URL('../components/onboarding/HowToWorkSection.js',import.meta.url),'utf8');
assert.doesNotMatch(how,/onClick|useState/, 'How to Work must not be dismissible');
assert.match(how,/9GsuZqVCpI0/);
console.log('test-showcase-joins: all checks passed');
