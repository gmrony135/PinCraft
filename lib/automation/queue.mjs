import 'server-only';
import { manualPinterestMode } from '../publishing/mode.mjs';
import {createHash} from 'node:crypto';
import {transaction} from './db.mjs';
import {AutomationError} from './errors.mjs';
import {httpsURL,requestData,publicAddresses} from './http.mjs';
import {validJobId} from './images.mjs';
import {addLog,ensureSettings} from './repository.mjs';
import {accountRef,jobRef,jobsFor,data,ms,readAccount,writeAccount,writeJob,defaultJob} from './firestore.mjs';
export function queueInput(raw){
  const plain=(v,max,lines=false)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=max&&!(lines?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(v)?v.trim():null;
  const title=plain(raw.title,100),description=plain(raw.description,800,true);
  if(!title||!description||!validJobId(raw.requestKey))throw new AutomationError('invalid_pin','Enter a title (1–100 characters), description (1–800 characters) and a unique request key.');
  for(const k of ['imageUrl','destinationUrl'])if(typeof raw[k]!=='string'||raw[k].length>2000)throw new AutomationError('invalid_url','Enter public HTTPS image and destination URLs.');
  const imageUrl=httpsURL(raw.imageUrl).href,destinationUrl=httpsURL(raw.destinationUrl).href;
  const scheduledAt=raw.scheduledAt?new Date(raw.scheduledAt):new Date();
  if(!Number.isFinite(scheduledAt.getTime())||scheduledAt.getTime()<Date.now()-60000||scheduledAt.getTime()>Date.now()+366*86400000)throw new AutomationError('invalid_schedule','Choose a due time from now to one year in the future.');
  return {title,description,imageUrl,destinationUrl,scheduledAt,requestKey:raw.requestKey};
}
export async function verifyPublicPinImage(url,send=requestData){
  httpsURL(url);const bytes=await send(url,{provider:'Public Pin image',publicHost:true,format:'bytes',timeout:20000,maxBytes:5*1024*1024,contentTypes:['image/png','image/jpeg','image/webp']});
  const png=Buffer.isBuffer(bytes)&&bytes.length>24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg=Buffer.isBuffer(bytes)&&bytes.length>20&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const webp=Buffer.isBuffer(bytes)&&bytes.length>24&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(!png&&!jpeg&&!webp)throw new AutomationError('image_unavailable','The public HTTPS image URL did not return PNG, JPEG or WebP image bytes. Nothing was published.',{retryable:true});
}
const fingerprint=pin=>createHash('sha256').update(JSON.stringify([pin.title,pin.description,pin.imageUrl,pin.destinationUrl])).digest('hex');
const reused=()=>new AutomationError('request_key_reused','This request key is already used by a different Pin.',{status:409});
export async function addQueuedPin(db,userId,pin,{verifyImage=verifyPublicPinImage,resolve=publicAddresses}={}){
  if(manualPinterestMode())throw new AutomationError('pinterest_manual_mode','Pinterest uploads and scheduling are manual. Use the downloaded Pin pack in Pinterest; no API job was queued.',{status:409});
  await ensureSettings(db,userId);const requestRef=accountRef(db,userId).collection('requests').doc(pin.requestKey),hash=fingerprint(pin),exists=data(await requestRef.get());
  if(exists){if(exists.fingerprint!==hash||exists.kind!=='queued_pin')throw reused();return exists.job_id;}
  await resolve(httpsURL(pin.destinationUrl).hostname);await verifyImage(pin.imageUrl);
  return transaction(db,async tx=>{
    const s=await readAccount(tx,db,userId),repeated=data(await tx.get(requestRef));
    if(repeated){if(repeated.fingerprint!==hash||repeated.kind!=='queued_pin')throw reused();return repeated.job_id;}
    if(s.queue_count>=200)throw new AutomationError('queue_full','Your cloud queue can hold up to 200 pending Pins.',{status:409});
    const job=defaultJob(userId,{kind:'queued_pin',state:'queued',scheduled_at:pin.scheduledAt,topic:'Scheduled Pin',topic_metadata:{source:'user_queue',label:'Your scheduled Pin'},connection_version:s.connection_version,content:{title:pin.title,description:pin.description,hashtags:[],category:'Scheduled Pin'},image_url:pin.imageUrl,destination_url:pin.destinationUrl,request_key:pin.requestKey});
    writeJob(tx,db,s,null,job);s.next_queue_at=!s.next_queue_at||ms(pin.scheduledAt)<ms(s.next_queue_at)?pin.scheduledAt:s.next_queue_at;writeAccount(tx,db,s);
    tx.create(requestRef,{job_id:job.id,fingerprint:hash,kind:'queued_pin',created_at:new Date()});
    addLog(db,userId,job.id,'pin_queued','info','Pin saved to your private Firestore queue. It will publish only when Auto Mode is enabled, its due time has passed and your selected schedule permits it.',tx);return job.id;
  });
}
export async function removeQueuedPin(db,userId,id){
  if(!validJobId(id))throw new AutomationError('invalid_pin','Choose a valid queued Pin.');
  await transaction(db,async tx=>{
    const s=await readAccount(tx,db,userId),job=data(await tx.get(jobRef(db,id))),waiting=await tx.get(jobsFor(db,userId).where('state','==','queued').orderBy('scheduled_at').orderBy('created_at').limit(2));
    if(!job||job.user_id!==userId||job.state!=='queued')throw new AutomationError('queue_changed','This Pin is no longer waiting in your queue. A running or published Pin cannot be removed here.',{status:409});
    writeJob(tx,db,s,job,{...job,state:'cancelled'});s.next_queue_at=waiting.docs.map(data).find(j=>j.id!==id)?.scheduled_at||null;writeAccount(tx,db,s);
    addLog(db,userId,id,'queued_pin_removed','info','Waiting Pin removed from the schedule. Its saved draft remains in your private Cloud Library.',tx);
  });
}
