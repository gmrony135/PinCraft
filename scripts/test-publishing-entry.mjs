// Pure review-entry regressions only. No cloud reads/writes, consent or posts.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {articleHTML} from '../lib/publishing/article-format.mjs';
import {articleToHTML,countArticleWordsFromHTML,externalSourceLinks,hasProfessionalArticleStructure,plainArticleToHTML} from '../lib/publishing/review-content.mjs';
import {defaultPublishingDestination,publishingReadiness} from '../lib/publishing/composer-state.mjs';
import {reviewedInput,automatedArticleInput} from '../lib/publishing/content.mjs';
const html='<p>A complete actual article must be reviewed by its owner before any publishing command is accepted.</p>';
const data={providers:{blogger:{configured:true}},profiles:[{id:'blogger',provider:'blogger',connected:true}],websites:[{id:'blogger_123456789012',connectionId:'blogger',connected:true,authorizationChanged:false}]};
const valid={data,includePin:true,connectionId:'blogger',websiteId:'blogger_123456789012',title:'An article supplied by the owner',html,wordCount:1200,relatedArticles:[{id:'223456789012301',title:'Useful related post one',url:'https://example.com/one'},{id:'223456789012302',title:'Useful related post two',url:'https://example.com/two'}],relatedLoaded:true,pinTitle:'A reviewed manual Pin',description:'Keep this useful article for later.',hashtags:'#UsefulArticle',imageReviewed:true,reviewed:true};

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
test('A fully valid review is ready; short articles and missing live-link selections block it',()=>{
 assert(publishingReadiness(valid).every(row=>row.ready));
 for(const title of ['', '<script>','A'.repeat(201)])assert(!publishingReadiness({...valid,title}).find(row=>row.id==='article').ready);
 assert(!publishingReadiness({...valid,wordCount:999}).find(row=>row.id==='article').ready);
 assert(!publishingReadiness({...valid,relatedLoaded:false}).find(row=>row.id==='internal-links').ready);
 assert(!publishingReadiness({...valid,relatedArticles:valid.relatedArticles.slice(0,1)}).find(row=>row.id==='internal-links').ready);
});
test('A one-time manual no-links confirmation only unlocks a verified cold-start review',()=>{
 const noLinks={...valid,includePin:false,relatedArticles:[],relatedLoaded:true,relatedCandidatesCount:0,relatedError:'Only 0 relevant live posts were found.'};
 assert(!publishingReadiness(noLinks).find(row=>row.id==='internal-links').ready);
 assert(publishingReadiness({...noLinks,allowNoInternalLinks:true}).find(row=>row.id==='internal-links').ready);
 assert(!publishingReadiness({...noLinks,allowNoInternalLinks:true,relatedFetchFailed:true}).find(row=>row.id==='internal-links').ready);
 assert(!publishingReadiness({...noLinks,allowNoInternalLinks:true,relatedCandidatesCount:2}).find(row=>row.id==='internal-links').ready);
 assert(!publishingReadiness({...noLinks,allowNoInternalLinks:true,relatedArticles:valid.relatedArticles.slice(0,1)}).find(row=>row.id==='internal-links').ready);
});

test('Manual no-link opt-out is explicit, empty-only and unavailable to recurring jobs',()=>{
 const html='<p>'+Array(1000).fill('word').join(' ')+'</p>',request={requestId:'12345678-1234-4234-8234-123456789abc',article:{title:'A New Blog Seed Article',html,wordCount:countArticleWordsFromHTML(html),relatedArticles:[],images:[]},bloggerConnectionId:'blogger',websiteId:'blogger_123456789012',blogPublishAtUTC:'now',timezone:'Asia/Dhaka',reviewed:true};
 assert.throws(()=>reviewedInput(request),error=>error.code==='article_internal_links_missing');
 const manual=reviewedInput({...request,allowNoInternalLinks:true});assert.equal(manual.allowNoInternalLinks,true);assert.deepEqual(manual.article.relatedArticles,[]);
 const oneLink={id:'223456789012301',title:'One relevant live article',url:'https://example.com/blog/one'},twoLinks=[oneLink,{id:'223456789012302',title:'Another relevant live article',url:'https://example.com/blog/two'}];
 assert.equal(reviewedInput({...request,article:{...request.article,relatedArticles:twoLinks}}).allowNoInternalLinks,false);
 assert.throws(()=>reviewedInput({...request,article:{...request.article,relatedArticles:[oneLink]}}),error=>error.code==='article_internal_links_missing');
 assert.throws(()=>reviewedInput({...request,allowNoInternalLinks:true,article:{...request.article,relatedArticles:[oneLink]}}),error=>error.code==='article_internal_links_missing');
 const automatic={...request};delete automatic.reviewed;automatic.allowNoInternalLinks=true;
 assert.throws(()=>automatedArticleInput(automatic),error=>error.code==='review_required');
});

test('Word counts use visible article content, excluding duplicate contents and related-link lists',()=>{
 const prose=Array(1000).fill('article').join(' '),html='<h2>In this guide</h2><ol><li><a href="#section-1">Repeated contents words</a></li></ol><h2 id="section-1">Section heading</h2><p>'+prose+'</p><p><strong>Q: A question</strong></p><p>A: A specific answer.</p><h2>Related articles</h2><ul><li><a href="https://example.com/post">Uncounted related link words</a></li></ul>';
 assert.equal(countArticleWordsFromHTML(html),1007);
 assert.equal(countArticleWordsFromHTML('<p>'+Array(999).fill('short').join(' ')+'</p>'),999);
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

test('A stopped job’s exact reviewed HTML is preserved, not reformatted or replaced with a blank draft',()=>{
 const recovered={title:'The actual original article',reviewedHTML:'<h2>Original heading</h2>\n<p>The saved owner article keeps its exact <strong>formatting</strong> and original text for a separate fresh review.</p>'};assert.equal(articleToHTML(recovered),recovered.reviewedHTML);
});
test('Recovered HTML has the same strict boundary and cannot inject a script or publication marker',()=>{
 for(const reviewedHTML of [html+'<script>alert(1)</script>',html+'<!-- pincraft-reviewed-job:injected -->',html+'<p class="unsafe">attributes</p>'])assert.throws(()=>articleToHTML({title:'Unsafe recovered content',reviewedHTML}));
});

test('External source candidates are disclosed and require a separate reviewer verification',()=>{
 const candidateHTML=html+'<p><a href="https://www.bhg.com/portable-lamps-walmart-12166615">Portable lamp source</a></p>',sources=externalSourceLinks(candidateHTML,valid.relatedArticles);
 assert.equal(sources.length,1);assert.equal(sources[0].hostname,'www.bhg.com');
 assert(!publishingReadiness({...valid,html:candidateHTML,externalSources:sources}).find(row=>row.id==='external-sources').ready);
 assert(publishingReadiness({...valid,html:candidateHTML,externalSources:sources,externalSourcesVerified:true}).find(row=>row.id==='external-sources').ready);
 assert.equal(externalSourceLinks(html+'<p><a href="https://example.com/blog/another-post">Our own blog</a></p>',valid.relatedArticles).length,0);
});
test('AI publishing readiness requires a short SEO title and the complete clickable article structure',()=>{
 const required=['section-1','section-2','section-3','section-4','article-tips','article-faq','article-conclusion'];
 const contents=`<h2>In this guide</h2><ol>${required.map(id=>`<li><a href="#${id}">${id}</a></li>`).join('')}</ol>`;
 const sections=[1,2,3,4].map(index=>`<h2 id="section-${index}">Section ${index}</h2><h3>Useful subheading</h3><p>Substantive paragraph text for this structured section.</p>`).join('');
 const structuredHTML=contents+sections+'<h2 id="article-tips">Tips</h2><ul><li>Tip</li></ul><h2 id="article-faq">Frequently asked questions</h2><p>FAQ</p><h2 id="article-conclusion">Final thoughts</h2><p>balcony garden layout, small balcony plants, balcony light and a container choices guide.</p>';
 assert(hasProfessionalArticleStructure(structuredHTML));
 const title='A Practical Balcony Garden Plan for Smaller Spaces',base={...valid,includePin:false,title,html:structuredHTML,requireSeo:true,metaDescription:'A'.repeat(150),focusKeyword:'balcony garden',secondaryKeywords:['balcony garden layout','small balcony plants','balcony light','container choices','balcony care routine'],slug:'practical-balcony-garden-plan'};
 assert(publishingReadiness(base).find(row=>row.id==='article-structure').ready);
 assert(publishingReadiness(base).find(row=>row.id==='seo').ready);
 assert(!publishingReadiness({...base,title:'A title that is too short'}).find(row=>row.id==='seo').ready);
 assert(!publishingReadiness({...base,html:'<p>A plain article body without its linked contents or organized sections.</p>'}).find(row=>row.id==='article-structure').ready);
});
