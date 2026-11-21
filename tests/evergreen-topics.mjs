// Pure checks (no Firebase, no network): evergreen fallback per category, 30-day no-repeat,
// oldest-reuse when exhausted, news rejection still in force. Run with --conditions=react-server.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CATEGORIES} from '../lib/product.mjs';
import {EVERGREEN_TOPIC_BANK} from '../lib/publishing/evergreen-topic-bank.mjs';
import {guideTopicRejection,hasGuideCue,selectCategoryTrend,parseCategoryNews} from '../lib/publishing/category-trends.mjs';
import {pickEvergreenTopic,evergreenEvidence,trimEvergreenUses,EVERGREEN_WINDOW_MS} from '../lib/publishing/evergreen-topics.mjs';

const DAY=86400000,NOW=Date.parse('2026-11-22T01:00:00Z');
const settingsFor=(categoryIds,language='en',topic='')=>({categoryIds,language,topic,trendRegion:'BD'});
const emptyRss='<?xml version="1.0"?><rss><channel></channel></rss>';
const emptySend=async()=>emptyRss;

test('the bank covers all 10 categories with at least 20 passing guide topics in English and Bengali', ()=>{
  const ids=CATEGORIES.map(c=>c.id);
  for(const lang of ['en','bn'])for(const id of ids){
    const list=EVERGREEN_TOPIC_BANK[lang][id];
    assert.ok(Array.isArray(list)&&list.length>=20,`${lang} ${id} has ${list?.length}`);
    assert.equal(new Set(list).size,list.length,`${lang} ${id} has duplicates`);
    for(const title of list){
      assert.equal(guideTopicRejection(title),null,`${title} rejected`);
      assert.equal(hasGuideCue(title),true,`${title} has no guide cue`);
    }
  }
});

test('an empty feed returns an evergreen topic for every category (English and Bengali)', async()=>{
  for(const language of ['en','bn'])for(const {id} of CATEGORIES){
    await assert.rejects(selectCategoryTrend(settingsFor([id],language),[],{send:emptySend,now:NOW}),{code:'category_trends_unavailable'});
    const pick=pickEvergreenTopic({settings:settingsFor([id],language),uses:[],now:NOW});
    assert.ok(pick,`no topic for ${language} ${id}`);
    assert.equal(pick.categoryId,id);
    assert.equal(pick.language,language);
    const evidence=evergreenEvidence(pick,settingsFor([id],language),{},NOW);
    assert.equal(evidence.evergreen,true);
    assert.equal(evidence.signal,'evergreen_guide');
    assert.deepEqual(evidence.sources,[]);
    assert.deepEqual(evidence.categoryIds,[id]);
    assert.ok(evidence.topicTokens.length>=2);
  }
});

test('the same blog never repeats an evergreen topic within 30 days while unused topics remain', ()=>{
  const settings=settingsFor(['home-decor']);
  const uses=[];
  const seen=new Set();
  for(let slot=0;slot<EVERGREEN_TOPIC_BANK.en['home-decor'].length;slot++){
    const at=NOW+slot*3600000;
    const pick=pickEvergreenTopic({settings,uses,now:at});
    assert.equal(pick.reused,false,`slot ${slot} reused early`);
    assert.ok(!seen.has(pick.key),`slot ${slot} repeated ${pick.title}`);
    seen.add(pick.key);
    uses.push({key:pick.key,categoryId:pick.categoryId,title:pick.title,at:new Date(at)});
  }
  // Still inside 30 days: the bank is exhausted, so the next pick must reuse the oldest-used topic.
  const last=new Date(NOW+EVERGREEN_TOPIC_BANK.en['home-decor'].length*3600000);
  const reuse=pickEvergreenTopic({settings,uses,now:last});
  assert.equal(reuse.reused,true);
  assert.equal(reuse.key,uses[0].key,'did not reuse the oldest-used topic');
});

test('a topic used 30 days ago is available again, and older history is trimmed', ()=>{
  const settings=settingsFor(['food-recipes']);
  const first=pickEvergreenTopic({settings,uses:[],now:NOW});
  const uses=[{key:first.key,categoryId:first.categoryId,title:first.title,at:new Date(NOW-EVERGREEN_WINDOW_MS+60000)}];
  // Still blocked just inside the window: the next pick is a different topic.
  const blocked=pickEvergreenTopic({settings,uses,now:NOW});
  assert.notEqual(blocked.key,first.key);
  // Once the window passes, the topic is free again, and it is the first unused entry again.
  const freed=pickEvergreenTopic({settings,uses,now:NOW+120000});
  assert.equal(freed.key,first.key);
  assert.equal(trimEvergreenUses(uses,NOW).length,1);
  assert.equal(trimEvergreenUses(uses,NOW+EVERGREEN_WINDOW_MS).length,0);
});

test('multi-category blogs rotate categories instead of exhausting one first', ()=>{
  const settings=settingsFor(['home-decor','food-recipes']);
  const uses=[];
  const order=[];
  for(let i=0;i<4;i++){
    const pick=pickEvergreenTopic({settings,uses,now:NOW+i*3600000});
    order.push(pick.categoryId);
    uses.push({key:pick.key,categoryId:pick.categoryId,title:pick.title,at:new Date(NOW+i*3600000)});
  }
  assert.deepEqual(order,['home-decor','food-recipes','home-decor','food-recipes']);
});

test('news and dated-event headlines are still rejected, including with a category term', ()=>{
  const news=[
    'Ashley Furniture opens new store in Khulna with home decor deals',
    'Ashley Furniture store opening near Dhaka brings new bedroom furniture',
    'IKEA launches new living room furniture collection this week',
    'Interior design brand announces new home decor showroom in Chattogram',
    'Garden centre closing after 20 years, shoppers near Sylhet react',
  ];
  for(const title of news)assert.ok(guideTopicRejection(title),`not rejected: ${title}`);
  // Pure news items never become guide topics even when the feed is non-empty.
  const xml=`<rss><channel><item><title>Ashley Furniture opens new home decor store near Khulna - Daily News</title><link>https://example.com/a</link><pubDate>${new Date(NOW).toUTCString()}</pubDate><source url="https://example.com">Daily News</source></item></channel></rss>`;
  assert.deepEqual(parseCategoryNews(xml,settingsFor(['home-decor']),NOW),[]);
});

test('an evergreen fallback is never a rejected or news headline', ()=>{
  for(const {id} of CATEGORIES){
    for(let i=0;i<40;i++){
      const pick=pickEvergreenTopic({settings:settingsFor([id]),uses:[],now:NOW+i});
      assert.equal(guideTopicRejection(pick.title),null);
    }
  }
});
