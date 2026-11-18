import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true });
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3101';
async function setup(path='/',user=null,result='granted') {
 const context=await browser.newContext();
 await context.addInitScript(({result})=>{
  window.__permissionCalls=0;let permission='default';
  Object.defineProperty(window,'Notification',{value:{get permission(){return permission},requestPermission(){window.__permissionCalls++;permission=result;return Promise.resolve(result)}}});
 },{result});
 await context.route('**/api/auth/session',r=>r.fulfill({json:{user}}));
 await context.route(/https:\/\/(nap5k\.com|5gvci\.com|n6wxm\.com)\//,r=>r.fulfill({contentType:'application/javascript',body:'/* vendor stub: gating test only */'}));
 const page=await context.newPage();await page.goto(base+path,{waitUntil:'networkidle'});
 return {context,page};
}
const zones=p=>p.locator('script[data-monetag-zone]').evaluateAll(ss=>ss.map(s=>s.dataset.monetagZone).sort());
try {
 let {context,page}=await setup();
 await page.getByRole('button',{name:'Allow ad cookies',exact:true}).waitFor();
 assert.deepEqual(await zones(page),[]);assert.equal(await page.evaluate(()=>window.__permissionCalls),0);
 await page.getByRole('button',{name:'Allow ad cookies',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('script[data-monetag-zone]').length===2);
 assert.deepEqual(await zones(page),['12287927','12290345']);assert.equal(await page.evaluate(()=>window.__permissionCalls),0);
 assert.equal(await page.getByRole('button',{name:'Enable ad notifications',exact:true}).count(),0);
 await page.evaluate(()=>window.dispatchEvent(new Event('pincraft:manage-monetag-preferences')));
 await page.getByRole('button',{name:'Reject ad cookies',exact:true}).click();
 await page.waitForLoadState('networkidle');assert.deepEqual(await zones(page),[]);
 await context.close();console.log('PASS: guest page-ad consent, zones, no guest Push prompt, revocation');
 ({context,page}=await setup('/about'));await page.getByRole('button',{name:'Allow ad cookies',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('script[data-monetag-zone]').length===1);
 assert.deepEqual(await zones(page),['12287927']);await context.close();console.log('PASS: about IPP only');
 for (const [path,user] of [['/privacy',null],['/',{id:'test-user',email:'test@example.com'}]]) {
  ({context,page}=await setup(path,user));assert.deepEqual(await zones(page),[]);
  assert.equal(await page.getByRole('button',{name:'Allow ad cookies',exact:true}).count(),0);
  await context.close();
 }
 console.log('PASS: excluded route and authenticated user');
} finally {await browser.close()}
