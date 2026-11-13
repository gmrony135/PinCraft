// Public/guest safety + responsive acceptance for real server-side Full Auto.
// No real identity, provider credentials or publication are simulated here.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const BASE=(process.env.BASE_URL||"http://127.0.0.1:3000").replace(/\/$/,"");
const OUT=path.resolve(__dirname,"../.shots");const results=[],errors=[];
function check(name,pass){results.push({name,pass:!!pass});console.log(`${pass?'PASS':'FAIL'} ${name}`);}
async function run(){fs.mkdirSync(OUT,{recursive:true});const browser=await chromium.launch();try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  let response=await page.goto(BASE+'/dashboard',{waitUntil:'networkidle'});await page.getByTestId('auto-status').filter({hasText:'Setup required'}).waitFor();
  check('Dashboard returns HTTP 200',response.status()===200);
  check('Title/canonical and a single correct H1',(await page.title())==='Automation Dashboard · PinCraft'&&(await page.locator('link[rel="canonical"]').getAttribute('href')).endsWith('/dashboard')&&await page.getByRole('heading',{level:1,name:'Automation Dashboard',exact:true}).count()===1);
  check('Guest state is Setup required, never Active',await page.getByTestId('auto-status').getAttribute('data-state')==='setup'&&await page.getByText('AUTO MODE IS RUNNING',{exact:true}).count()===0);
  check('Requested 2-hour and 10/day cadence is explicit',await page.getByText('Every 2 Hours, Daily 10 Pins',{exact:true}).isVisible());
  check('Last Auto Post has no invented successful timestamp',await page.getByText('No posts yet',{exact:true}).isVisible());
  check('No fabricated views/clicks/earnings dashboard numbers',!(await page.locator('main').innerText()).includes('45,200')&&!(await page.locator('main').innerText()).includes('$42.50'));
  const topics=(await page.getByLabel('Rotating topics',{exact:true}).inputValue()).split('\n');
  check('Exactly 20 rotating topics including the requested five',topics.length===20&&['Sad Quotes','Love Quotes','Motivation','Good Morning','Islamic Quotes'].every(x=>topics.includes(x)));
  check('Default timezone is visible and editable',await page.getByLabel('Timezone',{exact:true}).inputValue()==='Asia/Dhaka');
  check('Rotation is not mislabeled live trending',await page.getByLabel('Topic source',{exact:true}).inputValue()==='rotation'&&await page.getByRole('option',{name:'20-topic rotation (not live trends)',exact:true}).count()===1);
  await page.getByLabel('Topic source',{exact:true}).selectOption('google_trends');
  check('Live source explicitly identifies Google RSS, not Pinterest measurements',await page.getByText(/not Pinterest trend measurements/).isVisible()&&await page.getByLabel('Trend region',{exact:true}).inputValue()==='BD');
  check('Guest preferences cannot be saved as fake server settings',await page.getByRole('button',{name:'Save preferences',exact:true}).isDisabled());
  await page.getByLabel('Topic source',{exact:true}).selectOption('rotation');
  check('Pinterest uses its own OAuth consent button, not pasted tokens',await page.getByRole('button',{name:'Connect Pinterest',exact:true}).isVisible()&&await page.getByLabel('Paste Your Pinterest API Key Here',{exact:true}).count()===0);
  check('Dashboard has no account email or password collection fields',await page.locator('main input[type=password],main input[type=email]').count()===0);
  check('Blogger connection has a real OAuth action and honest status',await page.getByRole('button',{name:'Connect Blogger',exact:true}).isVisible()&&await page.getByTestId('connection-blogger').getByText('Not Connected',{exact:true}).isVisible());
  check('Queue save is unavailable until sign-in and cloud setup',await page.getByRole('button',{name:'Save Pin to cloud queue',exact:true}).isDisabled());
  check('Thirty-minute worker and one-hour retries are disclosed',(await page.locator('main').innerText()).includes('checks every 30 minutes')&&(await page.locator('main').innerText()).includes('retry after 1 hour'));
  check('Requested status metrics are visible',await page.getByText('Next Post Time',{exact:true}).isVisible()&&await page.getByText('Total Published',{exact:true}).isVisible()&&await page.getByText('Failed Posts',{exact:true}).isVisible());
  check('No sample activity or success log entries',await page.getByText('No activity yet',{exact:true}).isVisible()&&await page.getByText('Your first pipeline starts here',{exact:true}).isVisible());
  const toggle=page.getByRole('switch',{name:'Full Auto Mode',exact:true});await toggle.click();const dialog=page.getByRole('dialog');await dialog.waitFor();
  check('Guest switch opens sign-in rather than enabling locally',await toggle.getAttribute('aria-checked')==='false'&&await dialog.getByText('Google Login needs setup',{exact:true}).isVisible());
  await dialog.getByRole('button',{name:'Close login popup',exact:true}).click();
  check('No local-only automation preference was written',await page.evaluate(()=>localStorage.getItem('pincraft.automation.v1'))===null);
  await page.evaluate(()=>localStorage.setItem('pincraft.automation.v1',JSON.stringify({enabled:true,pinsPerDay:20,postTime:'Night'})));await page.reload({waitUntil:'networkidle'});
  check('Old localStorage ON preferences cannot activate the server',await toggle.getAttribute('aria-checked')==='false'&&await page.getByTestId('auto-status').getAttribute('data-state')==='setup');
  const status=await context.request.get(BASE+'/api/automation');const data=await status.json();
  check('Guest API exposes no account content/connections',status.status()===200&&data.authenticated===false&&data.recent.length===0&&data.connections===null&&data.enabled===false);
  check('Private status responses are never cached',/no-store/.test(status.headers()['cache-control']||''));
  const forbidden=await context.request.post(BASE+'/api/automation/settings',{headers:{origin:'https://attacker.invalid'},data:{action:'mode',enabled:true}});
  check('Cross-origin publishing settings are rejected',forbidden.status()===403);
  const unauth=await context.request.post(BASE+'/api/automation/settings',{headers:{origin:new URL(BASE).origin},data:{action:'mode',enabled:true}});
  check('Same-origin guests cannot mutate server automation',unauth.status()===401);
  check('Cloud Library requires real authentication',(await context.request.get(BASE+'/api/library')).status()===401);
  const worker=await context.request.post(BASE+'/api/internal/automation/tick');
  check('Public browser requests cannot invoke the worker',[401,503].includes(worker.status()));
  check('Unsigned Pin images cannot be enumerated',(await context.request.get(BASE+'/api/automation/image/00000000-0000-4000-8000-000000000001')).status()===404);
  await page.getByRole('button',{name:'Refresh server status',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('button[aria-label="Refresh server status"]')?.disabled);
  check('Refresh reads real server setup without inventing activity',await page.getByTestId('auto-status').getAttribute('data-state')==='setup');
  for(const width of [320,390,640,768,1024,1440]){await page.setViewportSize({width,height:900});await page.reload({waitUntil:'networkidle'});check(`${width}px dashboard has no horizontal overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));}
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(OUT,'automation-dashboard-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(OUT,'automation-dashboard-mobile.png'),fullPage:true});
  check('Zero public Dashboard browser runtime/console errors',errors.length===0);
  fs.writeFileSync(path.join(OUT,'dashboard-verification.json'),JSON.stringify({base:BASE,scope:'Guest safety only; configured backend is tested separately with isolated Firebase Auth/Firestore emulators and provider doubles.',results,errors},null,2));
  console.log(`\n${results.filter(x=>x.pass).length}/${results.length} dashboard checks passed`);if(results.some(x=>!x.pass))process.exitCode=1;
}finally{await browser.close();}}
run().catch(e=>{console.error(e);process.exitCode=1;});
