// Pure review-entry regressions only. No cloud reads/writes, consent or posts.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {articleHTML} from '../lib/publishing/article-format.mjs';
import {articleToHTML,plainArticleToHTML} from '../lib/publishing/review-content.mjs';
import {defaultPublishingDestination,publishingReadiness} from '../lib/publishing/composer-state.mjs';
const html='<p>A complete actual article must be reviewed by its owner before any publishing command is accepted.</p>';
const data={providers:{blogger:{configured:true}},profiles:[{id:'blogger',provider:'blogger',connected:true}],websites:[{id:'blogger_123456789012',connectionId:'blogger',connected:true,authorizationChanged:false}]};
const valid={data,includePin:true,connectionId:'blogger',websiteId:'blogger_123456789012',title:'An article supplied by the owner',html,pinTitle:'A reviewed manual Pin',description:'Keep this useful article for later.',hashtags:'#UsefulArticle',imageReviewed:true,reviewed:true};

test('Empty/loading status never invents a publishing destination',()=>{
 assert.deepEqual(defaultPublishingDestination(null),{connectionId:'',websiteId:''});
 assert.deepEqual(defaultPublishingDestination({profiles:[],websites:[]}),{connectionId:'',websiteId:''});
 assert(publishingReadiness({...valid,data:null}).some(row=>!row.ready));
});
test('One connected owned account/site is selected without pretending it was reviewed',()=>{
 assert.deepEqual(defaultPublishingDestination(data),{connectionId:'blogger',websiteId:'blogger_123456789012'});
 const pending=publishingReadiness({...valid,reviewed:false,imageReviewed:false}).filter(row=>!row.ready);
 assert.deepEqual(pending.map(row=>row.id),['artwork','review']);
});
test('Multiple accounts require an explicit choice unless an owned site hint resolves it',()=>{
 const many={...data,profiles:[...data.profiles,{id:'second',provider:'blogger',connected:true}],websites:[...data.websites,{id:'blogger_222222222222',connectionId:'second'}]};
 assert.deepEqual(defaultPublishingDestination(many),{connectionId:'',websiteId:''});
 assert.deepEqual(defaultPublishingDestination(many,'','','blogger_222222222222'),{connectionId:'second',websiteId:'blogger_222222222222'});
});
test('A website URL parameter cannot select another owner/account or override a chosen destination',()=>{
 assert.deepEqual(defaultPublishingDestination(data,'','','blogger_999999999999'),{connectionId:'blogger',websiteId:'blogger_123456789012'});
 const sites={...data,websites:[...data.websites,{id:'blogger_222222222222',connectionId:'blogger'}]};
 assert.deepEqual(defaultPublishingDestination(sites,'blogger','blogger_123456789012','blogger_222222222222'),{connectionId:'blogger',websiteId:'blogger_123456789012'});
 assert.deepEqual(defaultPublishingDestination(sites),{connectionId:'blogger',websiteId:''});
});
test('Disconnected profiles and stale website revisions cannot be auto-selected or pass review',()=>{
 const stale={...data,websites:[{...data.websites[0],authorizationChanged:true}]};
 assert.deepEqual(defaultPublishingDestination(stale),{connectionId:'blogger',websiteId:''});
 const check=publishingReadiness({...valid,data:stale}).find(row=>row.id==='website');assert(!check.ready);assert.match(check.message,/Re-verify/);
 const disconnected={...data,profiles:[{...data.profiles[0],connected:false}]};
 assert.deepEqual(defaultPublishingDestination(disconnected),{connectionId:'',websiteId:''});
 assert(!publishingReadiness({...valid,data:disconnected}).find(row=>row.id==='account').ready);
});
test('A fully valid review is ready, but an empty or marked-up title is not',()=>{
 assert(publishingReadiness(valid).every(row=>row.ready));
 for(const title of ['', '<script>','A'.repeat(201)])assert(!publishingReadiness({...valid,title}).find(row=>row.id==='article').ready);
});
test('Client and server use the same strict HTML boundary and reject unsafe/incomplete tags',()=>{
 assert.equal(articleHTML(html),html);
 for(const unsafe of [html+'<script>alert(1)</script>',html+'<!-- remote marker -->',html+'<p><em>wrong</p></em>',html+'<img src=x>',html+'<p class="x">attributes</p>']){
  assert.throws(()=>articleHTML(unsafe));assert(!publishingReadiness({...valid,html:unsafe}).find(row=>row.id==='article').ready);
 }
});
test('Article byte limits are UTF-8, including Bengali text, rather than JavaScript character counts',()=>{
 const text='<p>'+ 'বাংলা'.repeat(25)+'</p>';assert.equal(articleHTML(text),text);
 const oversized='<p>'+'আ'.repeat(34000)+'</p>';assert.throws(()=>articleHTML(oversized),/100 KB/);
});
test('Pasted text safely retains Markdown headings/lists and never executes user markup',()=>{
 const text='# Owner title\n\nA **thoughtful** introduction.\n\n## Start here\n- First idea\n- Second idea\n\n1. Ordered step\n2. Another step\n\n<script>alert("unsafe")</script>';
 const result=plainArticleToHTML(text,'Owner title');assert(!result.includes('<h2>Owner title'));
 for(const token of ['<strong>thoughtful</strong>','<h2>Start here</h2>','<ul><li>First idea</li>','<ol><li>Ordered step</li>','&lt;script&gt;'])assert(result.includes(token),token);
 assert.equal(articleHTML(result),result);
});
test('Plain saved articles are not silently replaced with empty or generated content',()=>{
 const article={title:'Actual saved text',plainText:'A real saved article body remains exactly user-supplied, with no synthetic introduction.\n\n## Its own heading\n\nKeep these original paragraphs.'};
 const result=articleToHTML(article);assert(result.includes('no synthetic introduction.'));assert(result.includes('<h2>Its own heading</h2>'));assert.equal(articleHTML(result),result);
});
test('Pin copy blockers expose missing descriptions, excess combined copy and invalid hashtags',()=>{
 for(const patch of [{description:''},{description:'a'.repeat(499),hashtags:'#Tag'},{hashtags:'#not-valid'},{hashtags:Array.from({length:11},(_,i)=>'#Tag'+i).join(' ')}])assert(!publishingReadiness({...valid,...patch}).find(row=>row.id==='pin-copy').ready);
 assert(publishingReadiness({...valid,description:'A line.\nAnother reviewed line.',hashtags:'#বাংলা'}).every(row=>row.ready));
});
test('Exact source content is preserved for structured generated/library articles',()=>{
 const a={title:'Existing generator output',intro:'Its own introductory paragraph long enough for the review boundary.',sections:[{heading:'Original heading',paragraphs:['First original paragraph.','Second **original** paragraph.']}],conclusion:'The owner-written final thought.'};
 const result=articleToHTML(a);assert.equal(result,'<p>Its own introductory paragraph long enough for the review boundary.</p>\n<h2>Original heading</h2>\n<p>First original paragraph.</p>\n<p>Second <strong>original</strong> paragraph.</p>\n<h2>Final thoughts</h2>\n<p>The owner-written final thought.</p>');assert.equal(articleHTML(result),result);
});


test('Blogger-only review needs no Pin copy, artwork or Pin target',()=>{
 const check=publishingReadiness({...valid,includePin:false,pinTitle:'',description:'',hashtags:'#not-valid',imageReviewed:false});
 assert(check.every(row=>row.ready));assert(!check.some(row=>['artwork','pin-copy'].includes(row.id)));
 assert.deepEqual(publishingReadiness({...valid,includePin:false,reviewed:false,imageReviewed:false}).filter(row=>!row.ready).map(row=>row.id),['review']);
});
test('Opting into a Pin pack restores its strict independent review gates',()=>{
 const check=publishingReadiness({...valid,includePin:true,pinTitle:'',imageReviewed:false,reviewed:false}).filter(row=>!row.ready);
 assert.deepEqual(check.map(row=>row.id),['pin-copy','artwork','review']);
});
