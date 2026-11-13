import 'server-only';
import { randomUUID } from 'node:crypto';
import { transaction } from './db.mjs';
import { AutomationError } from './errors.mjs';
import { httpsURL,requestData,publicAddresses } from './http.mjs';
import { validJobId } from './images.mjs';
import { addLog,ensureSettings } from './repository.mjs';
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
  httpsURL(url);
  const data=await send(url,{provider:'Public Pin image',publicHost:true,format:'bytes',timeout:20000,maxBytes:5*1024*1024,contentTypes:['image/png','image/jpeg','image/webp']});
  const png=Buffer.isBuffer(data)&&data.length>24&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg=Buffer.isBuffer(data)&&data.length>20&&data[0]===255&&data[1]===216&&data[2]===255;
  const webp=Buffer.isBuffer(data)&&data.length>24&&data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP';
  if(!png&&!jpeg&&!webp)throw new AutomationError('image_unavailable','The public HTTPS image URL did not return PNG, JPEG or WebP image bytes. Nothing was published.',{retryable:true});
}
export async function addQueuedPin(database,userId,pin,{verifyImage=verifyPublicPinImage,resolve=publicAddresses}={}){
  await ensureSettings(database,userId);
  // Duplicate browser retries do not re-fetch an image or create another Pin.
  const exists=(await database.query('SELECT * FROM pincraft_auto_jobs WHERE user_id=$1 AND request_key=$2',[userId,pin.requestKey])).rows[0];
  if(exists){if(exists.content?.title!==pin.title||exists.content?.description!==pin.description||exists.image_url!==pin.imageUrl||exists.destination_url!==pin.destinationUrl)throw new AutomationError('request_key_reused','This request key is already used by a different Pin.',{status:409});return exists.id;}
  await resolve(httpsURL(pin.destinationUrl).hostname);
  await verifyImage(pin.imageUrl);
  return transaction(database,async(client)=>{
    const settings=(await client.query('SELECT * FROM pincraft_auto_settings WHERE user_id=$1 FOR UPDATE',[userId])).rows[0];
    const repeated=(await client.query('SELECT * FROM pincraft_auto_jobs WHERE user_id=$1 AND request_key=$2',[userId,pin.requestKey])).rows[0];if(repeated){if(repeated.content?.title!==pin.title||repeated.content?.description!==pin.description||repeated.image_url!==pin.imageUrl||repeated.destination_url!==pin.destinationUrl)throw new AutomationError('request_key_reused','This request key is already used by a different Pin.',{status:409});return repeated.id;}
    if((await client.query("SELECT count(*)::int AS n FROM pincraft_auto_jobs WHERE user_id=$1 AND state='queued'",[userId])).rows[0].n>=200)throw new AutomationError('queue_full','Your cloud queue can hold up to 200 pending Pins.',{status:409});
    const id=randomUUID();
    await client.query("INSERT INTO pincraft_auto_jobs(id,user_id,kind,state,scheduled_at,day_key,topic,topic_metadata,connection_version,content,image_url,destination_url,request_key) VALUES($1,$2,'queued_pin','queued',$3,($3::timestamptz AT TIME ZONE $4)::date,'Scheduled Pin',$5::jsonb,$6,$7::jsonb,$8,$9,$10)",[id,userId,pin.scheduledAt,settings.timezone,JSON.stringify({source:'user_queue',label:'Your scheduled Pin'}),settings.connection_version,JSON.stringify({title:pin.title,description:pin.description,hashtags:[],category:'Scheduled Pin'}),pin.imageUrl,pin.destinationUrl,pin.requestKey]);
    await addLog(client,userId,id,'pin_queued','info','Pin saved to the server queue. It will publish only when Auto Mode is enabled, its due time has passed and your selected schedule permits it.');
    return id;
  });
}
export async function removeQueuedPin(database,userId,id){
  if(!validJobId(id))throw new AutomationError('invalid_pin','Choose a valid queued Pin.');
  await transaction(database,async(client)=>{
    await client.query('SELECT user_id FROM pincraft_auto_settings WHERE user_id=$1 FOR UPDATE',[userId]);
    const removed=await client.query("UPDATE pincraft_auto_jobs SET state='cancelled',updated_at=now() WHERE id=$1 AND user_id=$2 AND state='queued' RETURNING id",[id,userId]);
    if(!removed.rowCount)throw new AutomationError('queue_changed','This Pin is no longer waiting in the queue. A running or published Pin cannot be removed here.',{status:409});
    await addLog(client,userId,id,'queued_pin_removed','info','Waiting Pin removed from the schedule. Its saved draft remains in the cloud Library.');
  });
}
