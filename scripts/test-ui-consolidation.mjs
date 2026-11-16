// Pure route/layout/consent regressions. No cloud, provider or billing access.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {CATEGORIES,PRODUCT_NAV,WORKSPACE_NAV} from '../lib/product.mjs';
import {STUDIO_TOOLS,WRITING_TOOLS,studioTool} from '../lib/studio-tools.mjs';
const source=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
async function javascript(dir){const rows=await readdir(new URL('../'+dir,import.meta.url),{withFileTypes:true});return (await Promise.all(rows.map(row=>row.isDirectory()?javascript(dir+'/'+row.name):row.name.endsWith('.js')?[dir+'/'+row.name]:[]))).flat();}

test('Product and workspace navigation remove Publishing Jobs and standalone Automation links',()=>{
 for(const nav of [PRODUCT_NAV,WORKSPACE_NAV]){
  assert(!nav.some(item=>item.href==='/automation'||item.href==='/jobs'||/automation setup/i.test(item.label)));
  assert.equal(new Set(nav.map(item=>item.href)).size,nav.length);
  assert(nav.some(item=>item.href==='/connector'));
 }
});
test('Old Automation bookmarks redirect to Connector and never mount a second setup UI',async()=>{
 const route=await source('app/automation/page.js');assert.match(route,/permanentRedirect\('\/connector#blogger-recurring'\)/);assert(!/<PageShell|<BlogAutomationSetup|<Automations/.test(route));
});
test('The historical AI Studio alias goes to the hub without a redirect loop',async()=>{
 const alias=await source('app/ai-studio/page.js'),hub=await source('app/content-studio/page.js');assert.match(alias,/permanentRedirect\('\/content-studio'\)/);assert.match(hub,/<ContentStudioHub/);assert(!hub.includes('permanentRedirect'));
});
test('Studio exposes exactly six distinct canonical tools and retains both separate writers',()=>{
 const all=[...WRITING_TOOLS,...STUDIO_TOOLS];assert.equal(all.length,6);assert.equal(new Set(all.map(tool=>tool.href)).size,6);
 assert.deepEqual(WRITING_TOOLS.map(tool=>tool.href),['/article-writer','/pin-generator']);assert.deepEqual(STUDIO_TOOLS.map(tool=>tool.id),['image','keywords','plan','quality']);assert.equal(STUDIO_TOOLS[0].label,'Blog featured image');
});
test('Tool lookup rejects unknown slugs rather than selecting a default generator',()=>{
 for(const tool of STUDIO_TOOLS)assert.equal(studioTool(tool.slug),tool);
 for(const slug of ['',undefined,'article-writer','../artwork','ArtWork','unknown'])assert.equal(studioTool(slug),undefined);
});
test('Content Studio is a selection hub with no generator, review, account or schedule forms',async()=>{
 const hub=await source('components/ai/ContentStudioHub.js');assert(hub.includes('WRITING_TOOLS.map')&&hub.includes('STUDIO_TOOLS.map'));
 assert(!/<form|<input|<textarea|<select|<AIStudio|<PublishComposer|generateWithAI|useBlogAutomation/.test(hub));
});
test('Each auxiliary route validates its slug and has a canonical metadata destination',async()=>{
 const page=await source('app/content-studio/[tool]/page.js');assert.match(page,/if\(!tool\)notFound\(\)/);assert.match(page,/canonical:tool.href/);assert.match(page,/<AIStudio key=\{tool.id\} tool=\{tool\}/);
});
test('A tool page has one fixed task, not another duplicated tool selector',async()=>{
 const ui=await source('components/ai/AIStudio.js');assert.match(ui,/const task=tool.id/);assert(!/setTask|role="tablist"|aria-label="AI tool"/.test(ui));assert.match(ui,/href="\/content-studio"/);
});
test('Pin Generator suggestions always use the ten canonical product categories',async()=>{
 const ui=await source('components/pin-generator/PinGenerator.js');assert.equal(CATEGORIES.length,10);assert.match(ui,/CATEGORIES\.map\(\(category\)/);assert.match(ui,/data-testid="pin-category-suggestion"/);assert.match(ui,/setTopic\(category\.label\)/);assert(!ui.includes('const EXAMPLES'));
});
test('Pin artwork is direct in Pin Generator; Content Studio Artwork is blog-featured only',async()=>{
 const files=await javascript('components'),renderers=[];for(const file of files)if((await source(file)).includes('<ImageGenerator'))renderers.push(file);
 assert.deepEqual(renderers,['components/ai/AIStudio.js','components/pin-generator/PinGenerator.js']);
 const pin=await source('components/pin-generator/PinGenerator.js'),studio=await source('components/ai/AIStudio.js'),writer=await source('components/article-writer/ArticleWriter.js');
 assert(pin.includes('data-testid="pin-artwork-section"'));assert(pin.indexOf('data-testid="pin-artwork-section"')<pin.indexOf('{pack && !loading'));
 assert(pin.includes('<ImageGenerator initialPrompt={artworkPrompt} useCase="pin" editable topic={topic}'));assert(pin.includes('language={language}'));assert(!pin.includes('postInfo={pack'));assert(!pin.includes('onRequestPostInfo'));assert(pin.includes('setArtworkPrompt(createPinArtworkPrompt(category.label, category.description))'));assert(pin.includes('setArtworkPrompt(generated.imageIdea?.prompt'));
 const imageGenerator=await source('components/ai/ImageGenerator.js'),postInfoRoute=await source('app/api/ai/pin-post-info/route.js');assert(imageGenerator.includes("generateWithAI('pin_info'"));assert(imageGenerator.includes('imageDataUrl: artwork.dataUrl'));assert(imageGenerator.includes('Regenerate Post Info'));assert(postInfoRoute.includes('generatePinPostInfo'));
 assert(pin.includes('Use topic for artwork prompt'));assert(pin.includes('Open Pin artwork generator'));assert(pin.includes('A verified account is required for AI artwork'));assert(pin.includes('onClick={openLogin}'));
 assert(studio.includes('useCase="featured"'));assert(studio.includes('Generate Pin artwork instead'));assert(!studio.includes('Image format'));assert(!studio.includes('value="pin"'));
 assert(writer.includes('async function generateArticleImages'));assert(writer.includes('Generate three AI images'));assert(!writer.includes('<ImageGenerator'));
});
test('Reviewed Blogger publishing has one canonical form, not forms inside writing or reader tools',async()=>{
 const files=await javascript('components'),renderers=[];for(const file of files)if((await source(file)).includes('<PublishComposer'))renderers.push(file);
 assert.deepEqual(renderers,['components/publishing/PublishingCenter.js']);
 const writer=await source('components/article-writer/ArticleWriter.js');assert.match(writer,/await saveCloudDraft\("article", article, saveRequest.current\)/);assert.match(writer,/router.push\('\/publish\?draft='/);assert(!writer.includes('/api/publish/jobs'));
});
test('Cloud and device Library readers enter that same review without issuing publishing commands',async()=>{
 const reader=await source('components/library/ArticleReader.js'),center=await source('components/publishing/PublishingCenter.js');assert(reader.includes("article.storage===\"cloud\"?'draft=':'deviceDraft='"));assert(!reader.includes('publishRequest'));
 assert.match(center,/partitionLibrary\(getLibrary\(\)\).articles.find\(row=>row.id===requestedDevice\)/);assert.match(center,/setPrepared\(\{owner:user.id,article:saved,source:'device'\}\)/);
});
test('Connector embeds the recurring editor only once and never nests WorkspaceFrame',async()=>{
 const connector=await source('components/workspace/Connector.js'),editor=await source('components/publishing/BlogAutomationSetup.js');assert.equal((connector.match(/<WorkspaceFrame/g)||[]).length,1);assert.equal((connector.match(/<BlogAutomationSetup/g)||[]).length,1);assert(!/<WorkspaceFrame|usePublisher\(/.test(editor));assert(!editor.includes('Automation Blogger account'));
});
test('Connector organizes Blogger, recurring posts and manual Pinterest into accessible tabs; Jobs route remains',async()=>{
 const connector=await source('components/workspace/Connector.js'),jobs=await source('app/jobs/page.js');assert.match(connector,/role="tablist" aria-label="Connector sections"/);assert.match(connector,/role="tab" id=\{`connector-tab-/);assert.equal((connector.match(/role="tabpanel"/g)||[]).length,3);assert.match(connector,/onKeyDown=\{handleTabKeyDown\}/);assert.match(connector,/ArrowRight/);assert.match(connector,/ArrowLeft/);assert.match(connector,/window\.location\.hash!=='#blogger-recurring'/);assert.match(connector,/setActiveTab\('recurring'\)/);assert.match(connector,/label:'Blogger'/);assert.match(connector,/label:'Recurring'/);assert.match(connector,/label:'Pinterest'/);assert.match(connector,/No Pinterest API connection required/);assert.match(jobs,/<PublishingJobs\/>/);
});
test('Recurring consent starts false, is cleared by edits, and uses the edited revision rather than silently following a poll',async()=>{
 const editor=await source('components/publishing/BlogAutomationSetup.js');assert.match(editor,/\[consent,setConsent\]=useState\(false\)/);assert.match(editor,/function change\(patch\).*setConsent\(false\)/);assert.match(editor,/expectedRevision:editRevision.current/);assert.match(editor,/observedRevision.current!==nextRevision\)setConsent\(false\)/);assert.match(editor,/Reload saved settings/);
});
test('Uncertain recurring saves keep the same request and lock edits; owner checks guard returned settings',async()=>{
 const editor=await source('components/publishing/BlogAutomationSetup.js');assert.match(editor,/pending.current=\{path,body,kind\}/);assert.match(editor,/persist\(saved.path,saved.body,saved.kind\)/);assert.match(editor,/if\(owner.current!==uid\|\|operation.current!==op\)return/);assert.match(editor,/snapshot.accountId===user.id/);assert.match(editor,/if\(saving.current\|\|uncertain\|\|stale\)return/);
});
test('A collapsed editor still exposes owner Pause and does not imply cancellation inside Blogger',async()=>{
 const editor=await source('components/publishing/BlogAutomationSetup.js');assert(editor.indexOf('Pause recurring posts')<editor.indexOf('{open&&data&&'));assert.match(editor,/posts already scheduled in Blogger must be managed there/);assert.match(editor,/No generator check-in has been confirmed/);
});
test('No product component links to the retired setup URL or uses the old setup label',async()=>{
 for(const file of [...await javascript('components'),...await javascript('app')]){
  const ui=await source(file);assert(!/href=["']\/automation(?:["'#?])|>Automation setup</.test(ui),file);
 }
});
