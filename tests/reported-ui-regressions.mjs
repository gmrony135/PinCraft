import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const b=await chromium.launch({headless:true});const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3102';
try{
 const c=await b.newContext();await c.route('**/api/auth/session',r=>r.fulfill({json:{user:null}}));const p=await c.newPage();
 await p.goto(base+'/pin-generator',{waitUntil:'networkidle'});await p.getByPlaceholder('e.g. Balcony garden ideas').fill('Balcony garden ideas');await p.getByRole('button',{name:'Pin ideas',exact:true}).click();
 await p.getByTestId('pin-ideas-result').waitFor();assert.equal(await p.getByTestId('pin-ideas-result').locator('li').count(),5);assert.ok((await p.getByTestId('pin-ideas-result').innerText()).includes('Description'));console.log('PASS: Pin ideas rendered inline with five titles and description');await c.close();
 const d=await b.newContext();await d.route('**/api/auth/session',async r=>{await new Promise(done=>setTimeout(done,800));await r.fulfill({json:{user:{id:'ui-test-user',name:'Test User'}}})});await d.route('**/api/pinterest/publishing',r=>r.fulfill({status:500,json:{error:'The request could not be completed. Please try again later. No success has been assumed.'}}));await d.route('**/api/publish/status',r=>r.fulfill({json:{accountId:'ui-test-user',profiles:[],websites:[],cron:{}}}));await d.route('**/api/publish/jobs',r=>r.fulfill({json:{accountId:'ui-test-user',jobs:[]}}));const q=await d.newPage();await q.goto(base+'/jobs',{waitUntil:'networkidle'});
 assert.equal(await q.locator('footer').getByRole('link',{name:'Create account',exact:true}).count(),0);assert.equal(await q.locator('footer').getByRole('link',{name:'Sign in',exact:true}).count(),0);assert.equal(await q.locator('nav[aria-label="Main navigation"] .lucide-circle-check-big').count(),0);
 await q.getByText('Pin jobs could not be loaded',{exact:true}).waitFor();assert.equal(await q.getByText('No Pinterest jobs yet',{exact:true}).count(),0);console.log('PASS: signed-in footer, no Library tick, failed Pin jobs not presented as empty');await d.close();
}finally{await b.close()}
