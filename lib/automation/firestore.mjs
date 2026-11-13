import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {DEFAULT_TOPICS,DEFAULT_TIMEZONE} from './shared.mjs';
import {AutomationError} from './errors.mjs';
export const ACTIVE=['pending','generating','generated','publishing','blog_published','posting','retry'];
export const MUTATING=new Set(['publishing','posting']);
export const ownerKey=uid=>{if(typeof uid!=='string'||!uid||uid.length>128)throw new AutomationError('invalid_owner','A verified Firebase user is required.',{status:401});return createHash('sha256').update(uid).digest('hex');};
export const accountRef=(db,uid)=>db.collection('pincraft_accounts').doc(ownerKey(uid));
export const connectionRef=(db,uid,provider)=>accountRef(db,uid).collection('connections').doc(provider);
export const attemptRef=(db,uid,provider)=>accountRef(db,uid).collection('oauthAttempts').doc(provider);
export const jobRef=(db,id)=>db.collection('pincraft_jobs').doc(id);
export const jobsFor=(db,uid)=>db.collection('pincraft_jobs').where('user_id','==',uid);
export function unpack(value){if(value&&typeof value.toDate==='function')return value.toDate();if(value instanceof Date)return value;if(Array.isArray(value))return value.map(unpack);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,unpack(v)]));return value;}
export const data=snapshot=>snapshot?.exists?unpack(snapshot.data()):null;
export const ms=value=>value?new Date(value).getTime():0;
export const iso=value=>value?new Date(value).toISOString():null;
export function defaultSettings(uid){return {user_id:uid,enabled:false,timezone:DEFAULT_TIMEZONE,topics:[...DEFAULT_TOPICS],topic_source:'rotation',trend_region:'BD',topic_index:0,interval_minutes:120,daily_limit:10,posting_mode:'queue',next_run_at:null,next_queue_at:null,worker_due_at:null,active_job_id:null,active_due_at:null,last_success_at:null,last_error:null,credentials:null,connection_summary:null,connection_version:0,pinterest_board_id:null,pinterest_board_name:null,blogger_blog_id:null,blogger_blog_name:null,blogger_blog_url:null,verify_started_at:null,total_success:0,total_articles:0,failed_count:0,queue_count:0,attention_count:0,created_at:new Date(),updated_at:new Date()};}
export async function readAccount(tx,db,uid){const row=data(await tx.get(accountRef(db,uid)))||defaultSettings(uid);if(row.user_id!==uid)throw new AutomationError('invalid_owner','Account ownership could not be verified.',{status:403});return row;}
export function recalculateDue(s){s.worker_due_at=!s.enabled?null:s.active_job_id?s.active_due_at||new Date():s.posting_mode==='generated'?s.next_run_at||new Date():s.queue_count&&s.next_queue_at?new Date(Math.max(ms(s.next_run_at),ms(s.next_queue_at))):null;return s;}
export function writeAccount(tx,db,s){s.updated_at=new Date();recalculateDue(s);tx.set(accountRef(db,s.user_id),s);}
export function writeJob(tx,db,s,previous,next){
  const failure=j=>Boolean(j&&['retry','failed','attention'].includes(j.state)&&j.error_code);
  for(const [field,test]of [['total_success',j=>j?.state==='success'],['total_articles',j=>Boolean(j?.blog_id)],['failed_count',failure],['queue_count',j=>j?.state==='queued'],['attention_count',j=>j?.state==='attention']])s[field]=Math.max(0,(s[field]||0)+Number(Boolean(test(next)))-Number(Boolean(test(previous))));
  const value={...next,has_content:Boolean(next.content),updated_at:new Date()};delete value.account;
  tx.set(jobRef(db,next.id),value);
  return value;
}
export function defaultJob(uid,extra={}){return {id:randomUUID(),user_id:uid,kind:'generated',state:'pending',scheduled_at:new Date(),day_key:'',topic:'',topic_metadata:null,connection_version:0,content:null,has_content:false,image_url:null,destination_url:null,board_id:null,blog_target_id:null,blog_target_url:null,request_key:null,uncertain_step:null,blog_id:null,blog_url:null,pin_id:null,pin_url:null,completed_at:null,attempts:0,retry_at:null,lease_token:null,lease_until:null,error_code:null,error_message:null,created_at:new Date(),updated_at:new Date(),...extra};}
export function assertLease(row,job){if(!row||row.user_id!==job.user_id||row.lease_token!==job.lease_token||ms(row.lease_until)<=Date.now())throw new AutomationError('lease_lost','The job lease expired; no further external request was started.');}
export function assertAccountActive(s,job){if(!s.enabled)throw new AutomationError('paused','Auto Mode is paused.');if(s.connection_version!==job.connection_version)throw new AutomationError('connections_changed','Connections changed. Restore the saved authorization before continuing.');if(job.board_id!==s.pinterest_board_id||(job.kind==='generated'&&job.blog_target_id!==s.blogger_blog_id))throw new AutomationError('destinations_changed','Restore this saved job’s original authorized board/blog before retrying.');}
export function dateKey(now,timezone){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const get=t=>parts.find(p=>p.type===t).value;return `${get('year')}-${get('month')}-${get('day')}`;}
export function localDay(now,timezone){
 const key=dateKey(now,timezone),t=ms(now);
 // Binary-search local calendar boundaries: supports DST and non-hour offsets.
 let lo=t-48*3600000,hi=t;while(hi-lo>1){const mid=Math.floor((lo+hi)/2);if(dateKey(mid,timezone)<key)lo=mid;else hi=mid;}const start=new Date(hi);
 lo=t;hi=t+48*3600000;while(hi-lo>1){const mid=Math.floor((lo+hi)/2);if(dateKey(mid,timezone)<=key)lo=mid;else hi=mid;}return {key,start,tomorrow:new Date(hi)};
}
export function maintenanceAt(provider,expiresAt,refreshExpiresAt){if(provider!=='pinterest')return null;const access=ms(expiresAt)-5*60000,refresh=refreshExpiresAt?ms(refreshExpiresAt)-7*86400000:Infinity;return new Date(Math.min(access,refresh));}
export const connected=row=>Boolean(row?.status==='connected'&&row.encrypted_tokens&&(!row.refresh_expires_at||ms(row.refresh_expires_at)>Date.now()));
