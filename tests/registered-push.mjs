import {chromium} from 'playwright';import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3103';const browser=await chromium.launch();
const user={id:'push-test',name:'Push Test'};
try{
 for(const result of ['granted','default','denied']){
  const c=await browser.newContext({viewport:{width:1440,height:900}});
  await c.addInitScript(({result})=>{let p='default';window.__calls=0;window.__clock=0;const realNow=Date.now;Date.now=()=>realNow()+window.__clock;Object.defineProperty(window,'Notification',{value:{get permission(){return p},requestPermission(){window.__calls++;p=result;return Promise.resolve(result)}}});},{result});
  await c.route('**/api/auth/session',r=>r.fulfill({json:{user}}));
  await c.route('**/api/showcase',r=>r.fulfill({json:{telegramJoined:false,youtubeSubscribed:false,telegram:{configured:false},youtube:{configured:false}}}));
  await c.route('**/5gvci.com/**',r=>r.fulfill({contentType:'application/javascript',body:'/* vendor stub */'}));
  await c.route(/https:\/\/(nap5k\.com|n6wxm\.com)\//,r=>r.fulfill({contentType:'application/javascript',body:'/* vendor stub */'}));
  const p=await c.newPage();await p.goto(base,{waitUntil:'networkidle'});await p.getByTestId('registered-monetag-push').waitFor();assert.equal(await p.evaluate(()=>window.__calls),0);
  await p.getByRole('button',{name:'Enable ad notifications',exact:true}).click();
  assert.equal(await p.evaluate(()=>window.__calls),1);
  if(result==='granted'){
   await p.waitForFunction(()=>!!document.querySelector('script[data-monetag-zone="12290352"]'));await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));assert.equal(await p.getByTestId('registered-monetag-push').count(),0);
  }else{
   assert.equal(await p.locator('script[data-monetag-zone="12290352"]').count(),0);assert.equal(await p.getByTestId('registered-monetag-push').count(),0);
   await p.evaluate(()=>{window.__clock=5*60*60*1000-60000;document.dispatchEvent(new Event('visibilitychange'))});assert.equal(await p.getByTestId('registered-monetag-push').count(),0);
   await p.evaluate(()=>{window.__clock=5*60*60*1000+1000;document.dispatchEvent(new Event('visibilitychange'))});await p.getByTestId('registered-monetag-push').waitFor();assert.equal(await p.evaluate(()=>window.__calls),1);
   if(result==='denied')assert.equal(await p.getByRole('button',{name:'Enable ad notifications',exact:true}).count(),0);
  }
  await c.close();console.log('PASS registered Push '+result+', correct five-hour reminder/native permission rules');
 }
 const c=await browser.newContext({viewport:{width:1440,height:900}});let authRequests=0;
 await c.route('**/api/auth/session',async r=>{authRequests++;await new Promise(done=>setTimeout(done,600));await r.fulfill({json:{user}})});
 const p=await c.newPage();await p.goto(base,{waitUntil:'domcontentloaded'});
 assert.equal(await p.locator('footer').getByRole('link',{name:'Sign in',exact:true}).count(),0);await p.getByRole('button',{name:'Account: Push Test'}).waitFor();await p.getByRole('button',{name:'Not now',exact:true}).click();await p.evaluate(()=>window.__sentinel='same-document');
 const started=Date.now();await p.locator('nav[aria-label="Main navigation"]').getByRole('link',{name:'Pin Generator',exact:true}).click();await p.waitForURL('**/pin-generator');/* Monetag tags now load during the guest flash, so the boundary guard performs a full navigation here by design (ad code must not follow client routing into excluded pages). */assert.equal(authRequests,1);console.log('PASS delayed-auth guest flash guard and client navigation without reload; click ms',Date.now()-started);await c.close();
}finally{await browser.close()}
