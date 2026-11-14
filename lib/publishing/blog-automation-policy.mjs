// Shared, credential-free product and schedule policy. Never activates anything.
import {CATEGORY_IDS} from '../product.mjs';
import {nextScheduledAt,suggestedTimes} from '../automation/schedule.mjs';
export const BLOG_AUTOMATION_CONSENT='blog-trend-generation-publication-v1';
export const BLOG_AUTOMATION_MAX_DAILY=6;
export const BLOG_TREND_REGIONS=['BD','US','GB','IN','CA','AU'];
export const PREPARE_AHEAD_MS=90*60000,MIN_FIRST_NOTICE_MS=45*60000,MIN_PUBLISH_NOTICE_MS=5*60000;
export {suggestedTimes};
export function blogAutomationSettings(raw){
 const allowed=['bloggerConnectionId','websiteId','categoryIds','topic','language','trendRegion','timezone','dailyLimit','postingTimes'];
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!allowed.includes(k)))throw new Error('Use only the Blogger destination, categories, topic, language, region and schedule settings.');
 if(!(raw.bloggerConnectionId==='blogger'||/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(raw.bloggerConnectionId||''))||!/^blogger_\d{3,40}$/.test(raw.websiteId||''))throw new Error('Choose your connected Blogger account and verified website.');
 if(!Array.isArray(raw.categoryIds)||!raw.categoryIds.length||raw.categoryIds.length>3||new Set(raw.categoryIds).size!==raw.categoryIds.length||raw.categoryIds.some(id=>!CATEGORY_IDS.includes(id)))throw new Error('Choose one to three categories for your current-trend articles.');
 const topic=typeof raw.topic==='string'?raw.topic.trim():'';
 if(raw.topic!==undefined&&typeof raw.topic!=='string'||topic.length>120||/[<>\u0000-\u001f\u007f]/.test(topic))throw new Error('Use an optional plain-text topic focus of at most 120 characters. It narrows trends; it is not an instruction or a fixed-topic fallback.');
 if(!['en','bn'].includes(raw.language)||!BLOG_TREND_REGIONS.includes(raw.trendRegion))throw new Error('Choose English or Bengali and a supported trend region.');
 try{if(typeof raw.timezone!=='string'||raw.timezone.length>100)throw new Error();new Intl.DateTimeFormat('en',{timeZone:raw.timezone}).format();}catch{throw new Error('Choose a valid IANA audience timezone.');}
 if(!Number.isInteger(raw.dailyLimit)||raw.dailyLimit<1||raw.dailyLimit>BLOG_AUTOMATION_MAX_DAILY)throw new Error('Choose one to six Blogger posts per day. This is a ceiling, not a promise of six successes.');
 if(!Array.isArray(raw.postingTimes)||raw.postingTimes.length!==raw.dailyLimit||raw.postingTimes.some(t=>typeof t!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t))||new Set(raw.postingTimes).size!==raw.dailyLimit)throw new Error('Choose one unique HH:MM time for each daily Blogger slot.');
 const postingTimes=[...raw.postingTimes].sort(),minutes=postingTimes.map(t=>Number(t.slice(0,2))*60+Number(t.slice(3)));
 for(let i=1;i<minutes.length;i++)if(minutes[i]-minutes[i-1]<60)throw new Error('Leave at least one hour between Blogger slots.');
 if(minutes.length>1&&1440-minutes.at(-1)+minutes[0]<60)throw new Error('Leave at least one hour between the last and first daily Blogger slots.');
 return {bloggerConnectionId:raw.bloggerConnectionId,websiteId:raw.websiteId,categoryIds:[...raw.categoryIds],topic,language:raw.language,trendRegion:raw.trendRegion,timezone:raw.timezone,dailyLimit:raw.dailyLimit,postingTimes};
}
export const nextBlogSlot=(settings,after)=>nextScheduledAt(after,settings.timezone,settings.postingTimes);
export const prepareAt=(slot,now)=>new Date(Math.max(now,new Date(slot).getTime()-PREPARE_AHEAD_MS));
export const automationSlotId=value=>new Date(value).toISOString().replace(/[-:.]/g,'');

// Evaluate every 24-hour window, including already reserved future instants.
// Looking only backwards from a newly moved slot would permit a seventh post.
export function exceedsRollingBlogLimit(reservedInstants,newInstant){
 const times=[...reservedInstants.map(v=>new Date(v).getTime()),new Date(newInstant).getTime()].sort((a,b)=>a-b);
 if(times.some(t=>!Number.isFinite(t)))return true;
 return times.some((t,i)=>i+BLOG_AUTOMATION_MAX_DAILY<times.length&&times[i+BLOG_AUTOMATION_MAX_DAILY]-t<86400000);
}
