// Actual production-build Next APIs + Chromium + guarded local Firebase.
// Start the server with reviewed-blogger-http-fixtures.mjs; every Blogger
// receipt is explicitly synthetic. No genuine OAuth, payment or external post.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { getDatabase } from '../lib/automation/db.mjs';
import { accountRef, connectionRef, data } from '../lib/automation/firestore.mjs';
import { isolatedFirebase, resetFirebase, firebaseIdentity, BLOG } from './automation-fixtures.mjs';
import { reviewedRequest } from './reviewed-blogger-fixtures.mjs';

isolatedFirebase();
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3001', origin = new URL(BASE).origin;
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin) || process.env.PINCRAFT_PUBLISHING_MODE === 'legacy_api') throw new Error('Only the explicit local manual-mode fixture server may run these checks.');
const db = getDatabase(), results = [], browserErrors = [], browserBodies = [], canonical = { origin: new URL(process.env.APP_URL).origin, 'x-forwarded-host': new URL(process.env.APP_URL).host, 'x-forwarded-proto': 'https' };
let session, foreignSession, owner, foreign, browser, context, page, browserJob;
async function test(name, task) { try { await task(); results.push({ name, pass: true }); console.log('PASS ' + name); } catch (error) { results.push({ name, pass: false, error: error.message }); console.error('FAIL ' + name + ': ' + error.message); } }
async function request(path, { token = session, body, headers = {}, method } = {}) { return fetch(BASE + path, { method: method || (body === undefined ? 'GET' : 'POST'), redirect: 'manual', headers: { ...(token ? { cookie: 'pincraft.session.v2=' + token } : {}), ...(body === undefined ? {} : { origin, 'content-type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
const cookieValue = (response, name) => response.headers.getSetCookie().find(v => v.startsWith(name + '='))?.split(';')[0].slice(name.length + 1);
async function login(identity) { const config = await (await request('/api/auth/config', { token: null })).json(), response = await request('/api/auth/firebase', { token: null, body: { idToken: identity.idToken, nonce: config.nonce }, headers: { cookie: 'pincraft.firebase.nonce=' + config.nonce } }); assert.equal(response.status, 200); const value = cookieValue(response, 'pincraft.session.v2'); assert(value); return value; }
async function jobs(token = session) { const response = await request('/api/publish/jobs', { token }); assert.equal(response.status, 200); return (await response.json()).jobs; }
const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
function watch(p) {
  p.on('pageerror', error => browserErrors.push(error.message));
  p.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  p.on('response', async response => { if (response.url().startsWith(BASE + '/api/')) try { const body = await response.text(); if (body.length < 400000) browserBodies.push(body); } catch {} });
}
try {
  const health = await request('/api/auth/config', { token: null }); assert.equal(health.status, 200, 'Start the guarded local Next fixture server before this suite.');
  await resetFirebase(); owner = await firebaseIdentity('publishing-ui-owner-' + randomUUID()); foreign = await firebaseIdentity('publishing-ui-foreign-' + randomUUID()); session = await login(owner); foreignSession = await login(foreign);
  await test('Unauthenticated publishing endpoints reject access instead of returning example jobs', async () => { for (const path of ['status', 'jobs', 'automation', 'connections/blogger/resources']) assert.equal((await request('/api/publish/' + path, { token: null })).status, 401); });
  await test('Cross-origin mutations and old Pinterest/session payloads are rejected by actual API routes', async () => { assert.equal((await request('/api/publish/jobs', { body: reviewedRequest(), headers: { origin: 'https://untrusted.example' } })).status, 403); assert.equal((await request('/api/publish/jobs', { body: { ...reviewedRequest(), pinterestSession: 'must-not-be-collected' } })).status, 400); const tooLarge = await request('/api/publish/jobs', { body: { input: 'x'.repeat(145001) } }); assert.equal(tooLarge.status, 413); });
  await test('Pinterest consent and callback are disabled in manual mode; no API/session connection is required', async () => { const start = await request('/api/integrations/pinterest/start', { body: {}, headers: canonical }); assert.equal(start.status, 409); assert.equal((await request('/api/pinterest/callback?code=not-used')).status, 410); const status = await (await request('/api/publish/status')).json(); assert.equal(status.providers.pinterest.mode, 'manual'); assert.equal(status.providers.pinterest.configured, false); });
  await test('Retained Pinterest queue and automation routes cannot enqueue or enable API publishing in manual mode', async () => {
    const queued = await request('/api/automation/queue', { body: { action: 'queue', requestKey: randomUUID(), title: 'Manual upload only', description: 'An explicitly reviewed manual Pin.', imageUrl: 'https://example.com/image.png', destinationUrl: 'https://example.com/real-post' } }); assert.equal(queued.status, 409); assert.equal((await queued.json()).code, 'pinterest_manual_mode');
    for (const body of [{ action: 'save_automation' }, { action: 'toggle_automation', id: randomUUID(), enabled: true, publishingConsent: true }]) { const response = await request('/api/workspace', { body }); assert.equal(response.status, 409); assert.equal((await response.json()).code, 'reviewed_publishing_required'); }
  });
  let oauthStart, oauthNonce, state;
  await test('Blogger OAuth start uses offline+PKCE consent and a callback-scoped HttpOnly cookie', async () => { oauthStart = await request('/api/integrations/blogger/start', { body: {}, headers: canonical }); assert.equal(oauthStart.status, 200); const body = await oauthStart.json(), url = new URL(body.authorizationUrl); state = url.searchParams.get('state'); assert.equal(url.hostname, 'accounts.google.com'); assert.equal(url.searchParams.get('access_type'), 'offline'); assert.equal(url.searchParams.get('code_challenge_method'), 'S256'); assert.equal(url.searchParams.get('redirect_uri'), 'https://pincraftly.vercel.app/api/blogger/callback'); oauthNonce = oauthStart.headers.getSetCookie()[0].split(';')[0]; assert.match(oauthStart.headers.getSetCookie()[0], /Path=\/api\/blogger\/callback/i); assert.match(oauthStart.headers.getSetCookie()[0], /HttpOnly/i); });
  await test('The canonical Blogger callback exchanges synthetic consent once, clears its exact cookie, then rejects replay', async () => { const path = '/api/blogger/callback?state=' + encodeURIComponent(state) + '&code=explicit-isolated-reviewed-code'; const headers = { cookie: 'pincraft.session.v2=' + session + '; ' + oauthNonce }; const response = await request(path, { headers }); assert.equal(response.status, 303); assert.equal(new URL(response.headers.get('location')).searchParams.get('result'), 'connected'); assert.match(response.headers.getSetCookie()[0], /Path=\/api\/blogger\/callback/i); assert.match(response.headers.getSetCookie()[0], /Max-Age=0/i); const replay = await request(path, { headers }); assert.equal(new URL(replay.headers.get('location')).searchParams.get('result'), 'expired'); });
  await test('Actual resource and website APIs return only the authorized owned Blogger destination', async () => { const response = await request('/api/publish/connections/blogger/resources?connectionId=blogger'); assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.items[0].id, BLOG); const added = await request('/api/publish/websites', { body: { connectionId: 'blogger', blogId: body.items[0].id } }); assert.equal(added.status, 200); const status = await request('/api/publish/status'); assert.match(status.headers.get('cache-control'), /no-store/); assert.equal((await status.json()).websites.length, 1); });
  let apiJob;
  await test('Actual reviewed-create API is immutable and idempotent, with owner-only access', async () => { const raw = reviewedRequest(), first = await request('/api/publish/jobs', { body: raw }); assert.equal(first.status, 201); apiJob = (await first.json()).job; const second = await request('/api/publish/jobs', { body: raw }); assert.equal((await second.json()).job.id, apiJob.id); assert.equal((await jobs()).length, 1); assert.equal((await request('/api/publish/jobs', { body: { ...raw, timezone: 'UTC' } })).status, 409); assert.equal((await request(`/api/publish/jobs/${apiJob.id}/process`, { token: foreignSession, body: {} })).status, 404); assert.equal((await jobs(foreignSession)).length, 0); });
  await test('Real API checkpoint calls use synthetic draft+publish+public verification, releasing a separate manual task', async () => { const states = []; for (let i = 0; i < 3; i++) { const response = await request(`/api/publish/jobs/${apiJob.id}/process`, { body: {} }); assert.equal(response.status, 200); const result = await response.json(); states.push(result.job.status); apiJob = result.job; } assert.deepEqual(states, ['queued', 'waiting_live', 'completed']); assert.equal(apiJob.attempts, 1); assert.equal(apiJob.verification, 'blogger_live_verified'); const manual = (await jobs()).find(j => j.type === 'manual_pin'); assert.equal(manual.manualPin.articleURL, apiJob.resultURL); assert.equal(manual.verification, null); });
  await test('Actual future-publish API records SCHEDULED without inventing a live article or a Pin', async () => { const at = new Date(Date.now() + 7200000).toISOString(), response = await request('/api/publish/jobs', { body: reviewedRequest({ blogPublishAtUTC: at, pinReadyAtUTC: at }) }), created = (await response.json()).job; await request(`/api/publish/jobs/${created.id}/process`, { body: {} }); const scheduled = await (await request(`/api/publish/jobs/${created.id}/process`, { body: {} })).json(); assert.equal(scheduled.job.status, 'scheduled'); assert.equal(scheduled.job.resultURL, null); assert(!(await jobs()).some(j => j.bloggerJobId === created.id)); });
  await test('A synthetic lost draft response stops at needs_review; Retry cannot blindly insert another post', async () => { const raw = reviewedRequest(); raw.article.title = 'Synthetic uncertain receipt for safe inspection'; const created = (await (await request('/api/publish/jobs', { body: raw })).json()).job, response = await request(`/api/publish/jobs/${created.id}/process`, { body: {} }), result = await response.json(); assert.equal(result.job.status, 'needs_review'); assert.equal((await request(`/api/publish/jobs/${created.id}/retry`, { body: {} })).status, 409); assert.equal((await request(`/api/publish/jobs/${created.id}/review`, { token: foreignSession, body: { action: 'abandon', inspected: true } })).status, 404); });
  browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] }); context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
  await context.addCookies([{ name: 'pincraft.session.v2', value: session, url: origin, httpOnly: true, sameSite: 'Lax' }]);
  // A fixture browser does not visit any real external service or CDN.
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') || /^(blob:|data:)/.test(route.request().url()) ? route.continue() : route.abort());
  page = await context.newPage(); page.setDefaultTimeout(10000); watch(page);
  await test('Connector presents Blogger consent and manual Pinterest instructions, with no boards or Trial controls', async () => { await page.goto(BASE + '/connector', { waitUntil: 'networkidle' }); await page.getByRole('heading', { name: 'Pinterest · manual upload', exact: true }).waitFor(); assert(await page.getByRole('button', { name: 'Reconnect Blogger', exact: true }).isEnabled()); assert.equal(await page.getByRole('button', { name: 'Connect Pinterest', exact: true }).count(), 0); const body = await page.locator('main').innerText(); assert(!body.includes('Trial API Pins')); assert(body.includes('No Pinterest API connection required')); });
  const articleTitle = 'A reviewed small balcony garden for everyday living';
  await test('Existing offline article generation still works without activating publishing', async () => { await page.goto(BASE + '/article-writer', { waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'Offline template', exact: true }).click(); await page.getByLabel('Enter your pin title', { exact: true }).fill(articleTitle); const before = (await jobs()).length; await page.getByRole('button', { name: 'Generate Article', exact: true }).click(); await page.getByTestId('reviewed-publish-composer').waitFor(); assert.equal((await jobs()).length, before); });
  await test('The composer defaults to Blogger-only: no Pin artwork gate, and still requires final authorization', async () => { await page.getByRole('button', { name: /Publish to Blogger · optional Pin pack/ }).click(); const composer = page.getByTestId('reviewed-publish-composer'); assert(await composer.getByRole('button', { name: 'Publish blog now', exact: true }).isDisabled()); assert.equal(await page.getByLabel('Blogger account', { exact: true }).inputValue(), 'blogger'); assert.equal(await page.getByLabel('Verified blog', { exact: true }).inputValue(), 'blogger_' + BLOG); assert.match(await page.getByTestId('publish-readiness').innerText(), /final review/); assert.equal(await composer.getByLabel('Include optional manual Pin pack',{exact:true}).isChecked(),false); assert.equal(await composer.getByLabel('Review downloaded Pin artwork',{exact:true}).count(),0); assert.equal(await composer.getByLabel('Public Pin image URL', { exact: true }).count(), 0); assert.equal(await composer.getByText('Trial', { exact: true }).count(), 0); assert.equal(await page.getByRole('checkbox', { name: /^I reviewed this specific HTML article/ }).isChecked(), false); assert.equal(await page.locator('iframe[title="Reviewed HTML article preview"]').getAttribute('sandbox'), ''); });
  await test('Final Blogger authorization alone enables both publication commands; opting into a Pin pack restores its review gates',async()=>{const consent=page.getByRole('checkbox',{name:/^I reviewed this specific HTML article/});await consent.check();assert(await page.getByRole('button',{name:'Publish blog now',exact:true}).isEnabled());assert(await page.getByRole('button',{name:'Schedule Blogger post',exact:true}).isEnabled());await page.getByLabel('Include optional manual Pin pack',{exact:true}).check();assert.equal(await consent.isChecked(),false);assert.match(await page.getByTestId('publish-readiness').innerText(),/artwork/);assert(await page.getByRole('button',{name:'Publish blog now',exact:true}).isDisabled());});
  await mkdir('.shots', { recursive: true }); const pngPath = '.shots/reviewed-local-artwork.png'; await sharp({ create: { width: 400, height: 600, channels: 3, background: '#b7cfad' } }).png().toFile(pngPath);
  await test('Local artwork can be previewed and downloaded as a real PNG without uploading its bytes to an API', async () => { await page.getByLabel('Review downloaded Pin artwork', { exact: true }).setInputFiles(pngPath); const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download PNG for Pinterest', exact: true }).click(); const download = await downloadPromise; assert.equal(download.suggestedFilename(), 'pincraft-pin-image.png'); await download.saveAs('.shots/reviewed-browser-pin.png'); const image = await sharp('.shots/reviewed-browser-pin.png').metadata(); assert.equal(image.format, 'png'); assert.equal(image.width, 400); await page.getByRole('checkbox', { name: /^I reviewed and saved my Pin artwork/ }).and(page.locator('input:checked')).waitFor(); assert(await page.getByRole('checkbox', { name: /^I reviewed and saved my Pin artwork/ }).isChecked()); });
  await test('Editing content invalidates previous review consent before any publication button activates', async () => { const checkbox = page.getByRole('checkbox', { name: /^I reviewed this specific HTML article/ }); await checkbox.check(); assert(await page.getByRole('button', { name: 'Publish blog now', exact: true }).isEnabled()); await page.getByLabel('Reviewed Pin title', { exact: true }).fill('Balcony garden ideas reviewed for manual upload'); assert.equal(await checkbox.isChecked(), false); assert(await page.getByRole('button', { name: 'Publish blog now', exact: true }).isDisabled()); });
  await test('Explicit review publishes only this blog through saved checkpoints; Pinterest remains manual', async () => { await page.getByRole('checkbox', { name: /^I reviewed this specific HTML article/ }).check(); await page.getByRole('button', { name: 'Publish blog now', exact: true }).click(); await page.getByText('Blogger confirmed live.', { exact: true }).waitFor(); const all = await jobs(); browserJob = all.find(j => j.title === articleTitle && j.type === 'blogger'); assert(browserJob); assert.equal(browserJob.status, 'completed'); assert(all.some(j => j.bloggerJobId === browserJob.id && j.type === 'manual_pin')); assert.equal(await page.getByRole('link', { name: 'View Pin', exact: true }).count(), 0); });
  await test('Jobs separates verified live articles from unverified manual Pin packs and offers copy/export', async () => { await page.goto(BASE + '/jobs', { waitUntil: 'networkidle' }); const row = page.getByRole('row').filter({ hasText: 'Balcony garden ideas reviewed for manual upload' }); await row.getByRole('button', { name: 'Manual Pin pack', exact: true }).click(); assert(await page.getByRole('button', { name: 'Copy real destination URL to clipboard', exact: true }).isEnabled()); assert(await page.getByText(/no Pinterest publication is claimed/i).count() > 0); assert.equal(await page.getByRole('link', { name: 'User-reported Pin', exact: true }).count(), 0); });
  await test('Jobs displays immutable job and saved Blogger post IDs so existing results can be inspected without duplicate submissions',async()=>{const row=page.getByTestId('publishing-job-'+browserJob.id);assert((await row.innerText()).includes('Job ID: '+browserJob.id));assert((await row.innerText()).includes('Blogger post ID: '+browserJob.remoteId));});
  await test('Copy destination writes the confirmed Blogger URL to the real browser clipboard', async () => { await context.grantPermissions(['clipboard-read','clipboard-write'],{origin}); await page.getByRole('button',{name:'Copy real destination URL to clipboard',exact:true}).click(); await page.getByRole('button',{name:'Copied to clipboard',exact:true}).waitFor(); assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),browserJob.resultURL); });
  await test('The manual pack ZIP contains real reviewed copy, the verified URL and locally attached PNG', async () => { await page.getByLabel('Artwork for manual Pin ZIP', { exact: true }).setInputFiles(pngPath); const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download copy + PNG ZIP', exact: true }).click(); const download = await downloadPromise; await download.saveAs('.shots/reviewed-browser-manual-pack.zip'); const verify = spawnSync('python3', ['-c', "import zipfile,json; z=zipfile.ZipFile('.shots/reviewed-browser-manual-pack.zip'); assert z.testzip() is None; d=json.loads(z.read('pin-details.json')); assert d['title']=='Balcony garden ideas reviewed for manual upload'; assert d['destinationURL'].startswith('https://example.com/post-'); assert z.read('pin-image.png').startswith(b'\\x89PNG'); assert 'not a Pinterest publication receipt' in d['verification']"], { encoding: 'utf8' }); assert.equal(verify.status, 0, verify.stderr); });
  await test('Manual completion needs owner confirmation and is visibly labeled user-reported, not API verified', async () => { await page.getByText('Already uploaded? Record your own Pin link', { exact: true }).click(); assert(await page.getByRole('button', { name: 'Save my reported Pin link', exact: true }).isDisabled()); await page.getByLabel('Actual Pinterest Pin URL', { exact: true }).fill('https://www.pinterest.com/pin/9876543210123/'); await page.getByRole('checkbox', { name: /^I personally published this Pin and checked this URL/ }).check(); await page.getByRole('button', { name: 'Save my reported Pin link', exact: true }).click(); await page.getByRole('link', { name: 'User-reported Pin', exact: true }).waitFor(); assert(await page.getByText('Not API-verified or visibility-guaranteed', { exact: true }).isVisible()); const saved = (await jobs()).find(j => j.bloggerJobId === browserJob.id); assert.equal(saved.verification, 'user_reported_not_verified'); assert.equal(saved.resultURL, null); });
  const pastedTitle='Owner supplied existing article through the direct publish entry';
  let pastedCount, savedDraftId;
  await test('Verified Connector websites have a direct publishing action instead of silently queuing content', async () => {
    await page.goto(BASE+'/connector',{waitUntil:'networkidle'});
    assert(await page.locator(`a[href="/publish?website=blogger_${BLOG}"]`).isVisible());
    pastedCount=(await jobs()).length;
    await page.locator(`a[href="/publish?website=blogger_${BLOG}"]`).click();
    await page.getByRole('heading',{name:'Connect. Review. Publish.',exact:true}).waitFor();
    assert.equal((await jobs()).length,pastedCount);
  });
  await test('Direct publish accepts real pasted text, opens review and auto-selects only the owned blog without submitting', async () => {
    await page.getByRole('button',{name:'Review this article',exact:true}).click();
    assert(await page.getByText('Enter your article title, up to 200 characters.',{exact:true}).isVisible());
    await page.getByLabel('Existing article title',{exact:true}).fill(pastedTitle);
    await page.getByLabel('Complete existing article',{exact:true}).fill('This is the complete text supplied for the isolated entry regression, not a generated replacement.\n\n## Original heading\n\nKeep the owner-supplied paragraphs exactly as reviewed.');
    await page.getByRole('button',{name:'Review this article',exact:true}).click();
    await page.getByLabel('Article publishing title',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Article publishing title',{exact:true}).inputValue(),pastedTitle);
    await page.waitForFunction(()=>document.querySelector('[aria-label="Blogger account"]')?.value==='blogger');
    assert.equal(await page.getByLabel('Blogger account',{exact:true}).inputValue(),'blogger');
    assert.equal(await page.getByLabel('Verified blog',{exact:true}).inputValue(),'blogger_'+BLOG);
    assert(await page.getByRole('button',{name:'Publish blog now',exact:true}).isDisabled());
    assert.equal(await page.getByRole('checkbox',{name:/^I reviewed this specific HTML article/}).isChecked(),false);
    assert.match(await page.getByTestId('publish-blocked-reason').innerText(),/final review/);
    assert.equal((await jobs()).length,pastedCount);
  });
  await test('Direct Blogger-only publishing needs final authorization but no artwork, then shows the real saved job ID', async () => {
    await page.getByRole('checkbox',{name:/^I reviewed this specific HTML article/}).check();
    await page.getByRole('button',{name:'Publish blog now',exact:true}).click();
    await page.getByText('Blogger confirmed live.',{exact:true}).waitFor();
    const job=(await jobs()).find(row=>row.type==='blogger'&&row.title===pastedTitle);assert(job);assert.equal(job.status,'completed');assert.equal(job.hasManualPin,false);assert.equal(job.manualTaskId,null);assert(!(await jobs()).some(row=>row.bloggerJobId===job.id));
    assert.equal((await jobs()).length,pastedCount+1);
    assert.match(await page.getByTestId('saved-publishing-job-id').innerText(),new RegExp(job.id));
  });
  await test('Broken HTML shows a specific visible blocker before any create/publish request is possible', async () => {
    await page.goto(BASE+'/publish',{waitUntil:'networkidle'});
    await page.getByLabel('Existing article title',{exact:true}).fill('Review invalid formatting without queuing an article');
    await page.getByLabel('Complete existing article',{exact:true}).fill('An actual complete paragraph is supplied here to open the exact review screen without a publication request.');
    await page.getByRole('button',{name:'Review this article',exact:true}).click();
    await page.getByText('Review or edit article HTML',{exact:true}).click();
    await page.getByLabel('Article HTML',{exact:true}).fill('<p>A complete paragraph with intentionally invalid closing order for this isolated review test.</h2>');
    await page.getByRole('checkbox',{name:/^I reviewed this specific HTML article/}).check();
    assert(await page.getByRole('button',{name:'Publish blog now',exact:true}).isDisabled());
    assert.match(await page.getByTestId('publish-blocked-reason').innerText(),/Close the article formatting tags in order/);
    assert.equal((await jobs()).length,pastedCount+1);
  });
  await test('A private saved article opens directly in review without regenerating or queueing it', async () => {
    const content={title:'Private saved article preserved in the publishing entry regression',intro:'An explicit isolated saved article introduction, preserved rather than regenerated.',sections:[{heading:'The actual saved heading',paragraphs:['This is the complete paragraph of the explicit local Library fixture used only by the regression suite.']}],conclusion:'This is its original saved conclusion.',plainText:'An explicit isolated saved article introduction. The actual saved heading. This is the complete saved paragraph and conclusion.',category:'Saved publishing entry regression'};
    const response=await request('/api/library',{body:{action:'save',kind:'article',content,requestKey:randomUUID()}});assert.equal(response.status,200);
    savedDraftId=(await response.json()).id;assert(savedDraftId);
    await page.goto(BASE+'/publish?draft='+encodeURIComponent(savedDraftId),{waitUntil:'networkidle'});
    await page.getByLabel('Article publishing title',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Article publishing title',{exact:true}).inputValue(),content.title);
    assert.equal(await page.getByRole('checkbox',{name:/^I reviewed this specific HTML article/}).isChecked(),false);
    assert.equal((await jobs()).length,pastedCount+1);
    await page.goto(BASE+'/library',{waitUntil:'networkidle'});
    const cloud=page.getByTestId('cloud-library');await cloud.getByRole('button',{name:'Cloud Articles',exact:true}).click();
    assert.equal(await cloud.getByRole('link',{name:'Review & publish',exact:true}).getAttribute('href'),'/publish?draft='+savedDraftId);
  });
  await test('A foreign owner cannot open that Library draft by changing the publishing URL', async () => {
    await context.addCookies([{name:'pincraft.session.v2',value:foreignSession,url:origin,httpOnly:true,sameSite:'Lax'}]);
    try{
      await page.goto(BASE+'/publish?draft='+encodeURIComponent(savedDraftId),{waitUntil:'networkidle'});
      assert.equal(await page.getByTestId('reviewed-publish-composer').count(),0);
      assert.equal(await page.getByText('Private saved article preserved in the publishing entry regression',{exact:true}).count(),0);
      assert.equal((await jobs(foreignSession)).length,0);
    }finally{await context.addCookies([{name:'pincraft.session.v2',value:session,url:origin,httpOnly:true,sameSite:'Lax'}]);}
  });
  await test('Dashboard and Automation setup expose recurring Blogger settings without requiring a Pinterest account', async () => { await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' }); assert(await page.getByRole('heading', { name: 'Reviewed content. Real blog results.', exact: true }).isVisible()); assert.equal(await page.getByText('Pins published', { exact: true }).count(), 0); await page.goto(BASE + '/automation', { waitUntil: 'networkidle' }); assert(await page.getByRole('heading', { name: 'Your category. Fresh topics. A real schedule.', exact: true }).isVisible()); assert.equal(await page.getByRole('button', { name: 'Start automation', exact: true }).count(), 0); });
  const automationSettings={bloggerConnectionId:'blogger',websiteId:'blogger_'+BLOG,categoryIds:['home-decor'],topic:'',language:'en',trendRegion:'BD',timezone:'Asia/Dhaka',dailyLimit:6,postingTimes:['08:00','10:30','13:00','15:30','18:00','20:30']};
  await test('Actual recurring APIs require owner auth, same origin, strict input and separate recurring consent',async()=>{
    assert.equal((await request('/api/publish/automation',{token:null})).status,401);
    const raw={requestId:randomUUID(),expectedRevision:null,settings:automationSettings,enabled:true,consent:false};
    assert.equal((await request('/api/publish/automation',{body:raw,headers:{origin:'https://untrusted.example'}})).status,403);
    assert.equal((await request('/api/publish/automation',{body:raw})).status,400);
    assert.equal((await request('/api/publish/automation',{body:{...raw,enabled:false,ownerUID:foreign.id}})).status,400);
    const workload=await request('/api/internal/blog-automation/tick',{body:{}});assert.equal(workload.status,401);
    assert.equal((await request('/api/publish/automation',{body:{...raw,consent:true}})).status,503);
    assert.equal((await (await request('/api/publish/automation')).json()).automation,null);
  });
  await test('Paused automation settings persist through the real API without a generation, Pin or publication',async()=>{
    const before=(await jobs()).length,raw={requestId:randomUUID(),expectedRevision:null,settings:automationSettings,enabled:false,consent:false};
    const saved=await request('/api/publish/automation',{body:raw});assert.equal(saved.status,200);const result=await saved.json();assert.equal(result.automation.enabled,false);
    const replay=await request('/api/publish/automation',{body:raw});assert.equal((await replay.json()).automation.revision,result.automation.revision);
    const current=await (await request('/api/publish/automation')).json();assert.deepEqual(current.slots,[]);assert.equal(current.automation.settings.dailyLimit,6);assert.equal((await jobs()).length,before);
    const other=await (await request('/api/publish/automation',{token:foreignSession})).json();assert.equal(other.automation,null);assert.deepEqual(other.slots,[]);
  });
  await test('Automation setup shows actual paused state, six editable slots and an unchecked recurring authorization',async()=>{
    await page.goto(BASE+'/automation',{waitUntil:'networkidle'});await page.getByTestId('blog-automation-status').waitFor();
    assert.match(await page.getByTestId('blog-automation-status').innerText(),/Paused/);assert.equal(await page.getByLabel('Authorize recurring generation and Blogger publication',{exact:true}).isChecked(),false);
    assert.equal(await page.getByLabel(/Automation posting time [1-6]/).count(),6);assert.equal(await page.getByLabel('Automation audience timezone',{exact:true}).inputValue(),'Asia/Dhaka');
    assert.equal(await page.getByLabel('Automation Blogger account',{exact:true}).inputValue(),'blogger');assert.equal(await page.getByLabel('Automation verified blog',{exact:true}).inputValue(),'blogger_'+BLOG);
    assert(await page.getByRole('button',{name:'Enable recurring Blogger automation',exact:true}).isDisabled());assert.match(await page.getByTestId('automation-server-blocker').innerText(),/guarded production scheduler/);
  });
  await test('Editing automation clears recurring consent; save-paused persists category, language, region and exact times',async()=>{
    const consent=page.getByLabel('Authorize recurring generation and Blogger publication',{exact:true});await consent.check();await page.getByLabel('Automation posting time 1',{exact:true}).fill('08:05');assert.equal(await consent.isChecked(),false);
    await page.getByLabel('Automation article language',{exact:true}).selectOption('bn');await page.getByLabel('Automation trend region',{exact:true}).selectOption('BD');await page.getByLabel('Automation topic focus',{exact:true}).fill('small apartments');
    await page.getByRole('button',{name:'Save paused settings',exact:true}).click();await page.getByText('Settings saved in paused mode. No recurring generation or publication is authorized.',{exact:true}).waitFor();
    const saved=await (await request('/api/publish/automation')).json();assert.equal(saved.automation.enabled,false);assert.equal(saved.automation.settings.language,'bn');assert.equal(saved.automation.settings.postingTimes[0],'08:05');assert.equal(saved.automation.settings.topic,'small apartments');assert.deepEqual(saved.slots,[]);
  });
  await test('A stale settings revision cannot overwrite the real saved automation',async()=>{
    const raw={requestId:randomUUID(),expectedRevision:null,settings:automationSettings,enabled:false,consent:false},response=await request('/api/publish/automation',{body:raw});assert.equal(response.status,409);assert.equal((await response.json()).code,'automation_changed');
  });
  await test('Home, footer and policies clearly describe manual Pinterest rather than promise automatic Pin uploads', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' }); assert(await page.getByText('Blogger automatic · Pinterest manual', { exact: true }).isVisible()); const footer = await page.locator('footer').innerText(); assert(footer.includes('No Pinterest API, login session or automatic Pin uploads.')); assert(!footer.includes('Maximum six Pins')); assert(!((await page.title()).includes('Pinterest Automation Machine')));
    await page.goto(BASE + '/privacy', { waitUntil: 'networkidle' }); assert((await page.locator('main').innerText()).includes('This mode does not ask for Pinterest authorization, passwords, login sessions or cookies.'));
    await page.goto(BASE + '/terms', { waitUntil: 'networkidle' }); assert((await page.locator('main').innerText()).includes('Pinterest is manual in this mode.')); assert((await page.locator('main').innerText()).includes('A manual Pin target is a reminder, not an automatic upload'));
  });
  await test('Subscription retains reviewer-gated capacity without selling automatic Pinterest uploads', async () => {
    await page.goto(BASE + '/subscription', { waitUntil: 'networkidle' }); assert(await page.getByRole('heading', { name: 'Additional Blogger websites', exact: true }).isVisible()); assert(await page.getByText('Payments are not open.', { exact: true }).isVisible()); const body = await page.locator('main').innerText(); assert(body.includes('does not use Pinterest API slots')); assert(!body.includes('1–6 Pins per account per day'));
  });
  for (const width of [320, 390, 768, 1440]) await test(`Reviewed publishing surfaces remain contained at ${width}px`, async () => { await page.setViewportSize({ width, height: 1000 }); for (const path of ['/', '/connector', '/publish', '/jobs', '/dashboard', '/automation', '/subscription']) { await page.goto(BASE + path, { waitUntil: 'networkidle' }); assert(await fits(), path + ' overflows at ' + width); } });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(BASE + '/jobs', { waitUntil: 'networkidle' }); await page.screenshot({ path: '.shots/reviewed-publishing-jobs.png', fullPage: true });
  await test('A late owner jobs response cannot leak into a different signed-in account in the same tab', async () => {
    let release, captured; const held = new Promise(r => { release = r; }), ready = new Promise(r => { captured = r; }); let intercept = true;
    await page.route('**/api/publish/jobs', async route => { if (!intercept || route.request().method() !== 'GET') return route.continue(); intercept = false; const response = await route.fetch(); captured(); await held; await route.fulfill({ response }); });
    await page.getByRole('button', { name: 'Refresh workspace', exact: true }).click(); await ready;
    await context.addCookies([{ name: 'pincraft.session.v2', value: foreignSession, url: origin, httpOnly: true, sameSite: 'Lax' }]); await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    try { await page.getByRole('heading', { name: 'No reviewed jobs yet', exact: true }).waitFor(); } finally { release(); }
    await page.waitForLoadState('networkidle'); assert.equal(await page.getByText(articleTitle, { exact: true }).count(), 0); assert.equal((await jobs(foreignSession)).length, 0); await page.unroute('**/api/publish/jobs');
  });
  await test('Browser-facing API receipts never include raw grants, ciphertext, session values or uploaded image bytes', () => { for (const body of browserBodies) for (const secret of ['isolated-reviewed-http-access', 'isolated-reviewed-http-refresh', 'encrypted_tokens', 'pkce_envelope', 'refreshToken', 'BEGIN PRIVATE KEY', 'data:image/']) assert(!body.includes(secret), 'Private metadata leaked: ' + secret); });
  await test('The configured production-build browser pages have no uncaught runtime or unexpected console errors', () => assert.deepEqual(browserErrors, []));
} finally {
  await browser?.close(); await db.terminate(); await mkdir('.shots', { recursive: true });
  await writeFile('.shots/reviewed-publishing-ui-tests.json', JSON.stringify({ passed: results.filter(r => r.pass).length, total: results.length, mode: 'Production-build Next APIs, Chromium and local demo Firebase only. OAuth/Blogger/public-page receipts are explicit process-local doubles. No real owner consent or external publication.', browserErrors, results }, null, 2) + '\n');
}
console.log(`\n${results.filter(r => r.pass).length}/${results.length} reviewed publishing API/UI checks passed`);
if (results.some(r => !r.pass)) process.exitCode = 1;
