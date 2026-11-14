import 'server-only';
import {AutomationError} from '../automation/errors.mjs';
import {accountRef,ownerKey,data,ms,dateKey} from '../automation/firestore.mjs';
import {BLOG_AUTOMATION_CONSENT,exceedsRollingBlogLimit,nextBlogSlot,prepareAt,MIN_PUBLISH_NOTICE_MS} from './blog-automation-policy.mjs';
import {fingerprint} from './content.mjs';
export const blogAutomationRef=(db,uid)=>db.collection('blog_automations').doc(ownerKey(uid));
export const blogSlotsRef=(db,uid)=>accountRef(db,uid).collection('blog_automation_slots');
export function blogSlotRef(db,uid,id){if(typeof id!=='string'||!/^\d{8}T\d{9}Z$/.test(id))throw new AutomationError('invalid_slot','Select a saved Blogger automation slot.');return blogSlotsRef(db,uid).doc(id);}
const denied=()=>{throw new AutomationError('automation_authorization_changed','This recurring authorization was paused, replaced or reconnected. No new Blogger mutation is authorized. Already registered Blogger schedules must be managed in Blogger.',{status:409});};
export function assertAutomationConsent(config,uid,revision){
 if(!config||config.ownerUID!==uid||config.enabled!==true||config.revision!==revision||config.consent?.version!==BLOG_AUTOMATION_CONSENT||config.consent?.ownerUID!==uid||config.consent.settingsFingerprint!==fingerprint(config.settings)||!config.consent.givenAt)denied();
}
function sameDestination(config,payload){const d=config.destination;return d&&d.bloggerConnectionId===payload.bloggerConnectionId&&d.bloggerRevision===payload.bloggerRevision&&d.bloggerAccountKey===payload.bloggerAccountKey&&d.websiteId===payload.websiteId&&d.blogId===payload.blogId&&d.blogURL===payload.blogURL;}
export async function automationSubmission(tx,db,uid,authorization,value,payload,now){
 const [configSnap,slotSnap]=await tx.getAll(blogAutomationRef(db,uid),blogSlotRef(db,uid,authorization.slotId));
 const config=data(configSnap),slot=data(slotSnap);
 assertAutomationConsent(config,uid,authorization.revision);
 if(!sameDestination(config,payload)||config.activeSlotId!==authorization.slotId||config.lease!==authorization.lease||ms(config.leaseUntilUTC)<=now||!slot||slot.ownerUID!==uid||slot.revision!==config.revision||slot.state!=='approved'||slot.jobId!==value.requestId||ms(slot.publishAtUTC)!==ms(value.blogAt)||slot.contentFingerprint!==fingerprint(value.article)||slot.editorialReview?.passed!==true||!Array.isArray(slot.evidence?.sources)||!slot.evidence.sources.length)denied();
 if(ms(value.blogAt)<now+MIN_PUBLISH_NOTICE_MS)throw new AutomationError('automation_slot_missed','This slot is too close or already missed. It will be skipped, not backdated or published in a burst.',{status:409});
 const at=ms(value.blogAt),reservations=(config.publicationReservations||[]).filter(r=>ms(r.at)>now-3*86400000);
 const exceedsRolling=exceedsRollingBlogLimit(reservations.map(r=>r.at),value.blogAt),local=reservations.filter(r=>dateKey(new Date(ms(r.at)),config.settings.timezone)===dateKey(value.blogAt,config.settings.timezone));
 if(exceedsRolling||local.length>=config.settings.dailyLimit||reservations.some(r=>Math.abs(ms(r.at)-at)<60*60000))throw new AutomationError('automation_daily_limit','The recurring Blogger daily ceiling or one-hour spacing is already reserved. Changing settings never resets it; this slot is skipped.',{status:429});
 return {config,slot,reservations:[...reservations,{jobId:value.requestId,at:value.blogAt}]};
}
export function commitAutomationSubmission(tx,db,uid,context,now){
 const {config,slot,reservations}=context,nextSlotUTC=nextBlogSlot(config.settings,Math.max(now,ms(slot.publishAtUTC))+1000);
 const topic={key:slot.evidence.topicKey,tokens:slot.evidence.topicTokens,title:slot.evidence.topic,at:new Date(now)};
 tx.set(blogSlotRef(db,uid,slot.id),{...slot,state:'queued',updatedAt:new Date(now),queuedAt:new Date(now),error:null});
 tx.set(blogAutomationRef(db,uid),{...config,publicationReservations:reservations,recentTopics:[...(config.recentTopics||[]).filter(t=>ms(t.at)>now-7*86400000&&t.key!==topic.key),topic].slice(-48),activeSlotId:null,nextSlotUTC,nextRunAtUTC:prepareAt(nextSlotUTC,now),lease:null,leaseUntilUTC:null,updatedAt:new Date(now),lastOutcome:{state:'queued',slotId:slot.id,jobId:slot.jobId,title:slot.title,publishAtUTC:slot.publishAtUTC,at:new Date(now),message:'Generated article passed the configured editorial gates and was queued. Blogger publication is not yet confirmed.'}});
}
export async function assertAutomatedMutation(tx,db,job,now){
 if(!job.automation)return;
 const [cfgSnap,slotSnap]=await tx.getAll(blogAutomationRef(db,job.ownerUID),blogSlotRef(db,job.ownerUID,job.automation.slotId));
 const config=data(cfgSnap),slot=data(slotSnap);
 assertAutomationConsent(config,job.ownerUID,job.automation.revision);
 if(!sameDestination(config,job.payload)||!slot||slot.ownerUID!==job.ownerUID||slot.jobId!==job.id||slot.state!=='queued'||slot.contentFingerprint!==fingerprint(job.payload.article)||slot.editorialReview?.passed!==true)denied();
 if(ms(job.publishAtUTC)<now+10000)throw new AutomationError('automation_slot_missed','The automatic publication slot is too close or was missed. No further automatic draft or publish mutation was sent. Any existing Blogger draft was retained.',{status:409});
}
