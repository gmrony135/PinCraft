import {EVERGREEN_TOPIC_BANK} from './evergreen-topic-bank.mjs';
import {guideTopicRejection,hasGuideCue,topicTokens} from './category-trends.mjs';

// Evergreen fallback: used only when no current category guide headline passes the filters.
// Per-blog history is kept separately from recentTopics, which only covers 7 days.
export const EVERGREEN_WINDOW_MS=30*86400000;
export const EVERGREEN_MAX_USES=600;

const time=value=>{
  if(value&&typeof value.toMillis==='function')return value.toMillis();
  const parsed=value instanceof Date?value.getTime():Date.parse(value);
  return Number.isFinite(parsed)?parsed:0;
};
const norm=value=>String(value||'').toLocaleLowerCase().replace(/\s+/g,' ').trim();
export const evergreenKey=(language,title)=>`evergreen:${language}:${norm(title)}`;

// Keeps only uses inside the 30-day window, newest last, bounded in size.
export function trimEvergreenUses(uses,now){
  return (Array.isArray(uses)?uses:[]).filter(use=>use&&time(use.at)>now-EVERGREEN_WINDOW_MS).slice(-EVERGREEN_MAX_USES);
}

// Picks one evergreen guide topic for a blog. Never returns null for a configured category.
// Order: unused in the last 30 days (rotating categories, focus-matching first); otherwise the
// oldest-used topic. Titles are re-checked against the same news and guide-cue rules at runtime.
export function pickEvergreenTopic({settings,uses=[],now=Date.now()}){
  const language=settings.language==='bn'?'bn':'en';
  const bank=EVERGREEN_TOPIC_BANK[language]||{};
  const categories=[...new Set(settings.categoryIds||[])].filter(id=>Array.isArray(bank[id])&&bank[id].length);
  if(!categories.length)return null;
  const history=trimEvergreenUses(uses,now);
  const lastUse=new Map(),usedAt=new Map();
  for(const use of history){
    const at=time(use.at);
    if(use.categoryId)lastUse.set(use.categoryId,Math.max(lastUse.get(use.categoryId)||0,at));
    if(use.key)usedAt.set(use.key,Math.max(usedAt.get(use.key)||0,at));
  }
  // Least recently used category first, configured order as tie-break.
  const rotation=categories.map((id,index)=>({id,index,last:lastUse.get(id)||0})).sort((a,b)=>a.last-b.last||a.index-b.index);
  const focus=topicTokens(settings.topic||'');
  const focusMatch=candidate=>!focus.length||topicTokens(candidate.title).some(token=>focus.includes(token));
  const candidates=rotation.flatMap(({id,index})=>bank[id].map((title,position)=>({
    title,categoryId:id,rank:index,position,key:evergreenKey(language,title),at:usedAt.get(evergreenKey(language,title))
  }))).filter(candidate=>!guideTopicRejection(candidate.title)&&hasGuideCue(candidate.title));
  const free=candidates.filter(candidate=>candidate.at===undefined||candidate.at<=now-EVERGREEN_WINDOW_MS);
  const chosen=free.find(focusMatch)||free[0]||[...candidates].sort((a,b)=>(focusMatch(a)?0:1)-(focusMatch(b)?0:1)||a.at-b.at||a.rank-b.rank||a.position-b.position)[0];
  if(!chosen)return null;
  return {...chosen,reused:chosen.at!==undefined,language};
}

export function evergreenEvidence(pick,settings,urls,now){
  return {
    signal:'evergreen_guide',
    topic:pick.title,
    topicKey:pick.key,
    topicTokens:topicTokens(pick.title),
    searchTerm:null,
    sources:[],
    feedURLs:urls,
    fetchedAt:new Date(now).toISOString(),
    region:settings.trendRegion,
    categoryIds:[pick.categoryId],
    focus:settings.topic,
    evergreen:true,
    reused:pick.reused,
    label:'Evergreen guide topic: curated and timeless, not a current news or search signal',
    limitations:'No current category guide headline passed the news and guide filters today, so a curated evergreen guide topic was used. It is not based on news, search volume or measured demand.'
  };
}
