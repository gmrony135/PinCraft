// GitHub Actions runner: posts at most one queued pin to @SlimGlowLifex, using the saved session.
// Fail-closed: any doubt about the signed-in account means no post.
import {chromium} from 'playwright';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const APP = process.env.PINCRAFT_APP_URL, TOKEN = process.env.PINCRAFT_RUNNER_TOKEN;
const HANDLE = 'SlimGlowLifex', PROFILE = `https://www.pinterest.com/${HANDLE}/`, BLOCKED = ['smallapartmentnestx', 'vibespark'];
if (!APP || !TOKEN) { console.error('Missing PINCRAFT_APP_URL or PINCRAFT_RUNNER_TOKEN.'); process.exit(1); }

const log = (...args) => console.log(new Date().toISOString(), ...args);
const pause = (min = 1500, max = 4000) => new Promise(resolve => setTimeout(resolve, min + Math.random() * (max - min)));

async function api(path, body) {
  const response = await fetch(`${APP}/api/internal/pinterest-browser/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {authorization: `Bearer ${TOKEN}`, ...(body !== undefined ? {'content-type': 'application/json'} : {})},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return {status: response.status, json: await response.json().catch(() => ({}))};
}

// Downloads the owner's image to a temp file. https only, images only, 10 MB max.
async function downloadImage(url, dir) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`image download failed (${response.status})`);
  const type = response.headers.get('content-type') || '';
  if (!type.startsWith('image/')) throw new Error('image URL did not return an image');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 10 * 1024 * 1024) throw new Error('image is larger than 10 MB');
  const path = join(dir, 'pin' + (type.includes('png') ? '.png' : '.jpg'));
  writeFileSync(path, bytes);
  return path;
}

async function main() {
  const session = await api('session');
  if (session.status === 404) { log('No session uploaded yet. Nothing to do.'); return; }
  if (session.status !== 200) throw new Error(`session fetch failed (${session.status})`);

  const browser = await chromium.launch({headless: true});
  const context = await browser.newContext({storageState: session.json.storageState, viewport: {width: 1365, height: 900}});
  const page = await context.newPage();
  const dir = mkdtempSync(join(tmpdir(), 'pin-'));
  let job = null;
  try {
    await page.goto(PROFILE, {waitUntil: 'domcontentloaded', timeout: 60000});
    await pause();
    // Signed out: a login page or a visible "Log in" control.
    const loginControls = await page.getByRole('link', {name: /^log in$/i}).count() + await page.getByRole('button', {name: /^log in$/i}).count();
    if (page.url().includes('/login') || loginControls > 0) {
      await api('status', {state: 'expired', detail: 'Pinterest asked for a sign-in.'});
      log('Session expired. Owner must export and upload a new session.');
      return;
    }
    // Owner check: only the account owner sees "Edit profile" on the profile page. Fail closed otherwise.
    const path = new URL(page.url()).pathname.toLowerCase();
    const ownerControl = await page.getByRole('link', {name: /edit profile/i}).count();
    if (!path.startsWith(`/${HANDLE.toLowerCase()}`) || ownerControl === 0) {
      await api('status', {state: 'unverified', detail: `Signed-in account could not be confirmed as @${HANDLE}.`});
      log('Account not confirmed. No post made.');
      return;
    }
    await api('status', {state: 'verified', detail: `Confirmed signed in as @${HANDLE}.`});
    await api('session', {storageState: await context.storageState()});

    const next = await api('next', {});
    if (!next.json.job) { log('No pin due:', next.json.reason); return; }
    job = next.json.job;
    if (BLOCKED.some(name => job.boardName?.toLowerCase().includes(name))) throw new Error('board belongs to a blocked account');

    const image = await downloadImage(job.imageURL, dir);
    await page.goto('https://www.pinterest.com/pin-builder/', {waitUntil: 'domcontentloaded', timeout: 60000});
    await pause();
    // UNVERIFIED SELECTORS: Pinterest changes these. Each step tries several fallbacks.
    await page.locator('input[type="file"]').first().setInputFiles(image);
    await pause(2000, 4000);
    await page.getByLabel(/title/i).or(page.getByPlaceholder(/add a title/i)).first().fill(job.title);
    await pause(500, 1200);
    await page.getByLabel(/description/i).or(page.getByPlaceholder(/tell everyone/i)).first().fill(job.description || '');
    await pause(500, 1200);
    await page.getByLabel(/destination link|link/i).or(page.getByPlaceholder(/link/i)).first().fill(job.link);
    await pause(500, 1200);
    await page.getByRole('button', {name: /board/i}).first().click();
    await pause(800, 1500);
    const boardOption = page.getByRole('option', {name: job.boardName, exact: true}).or(page.getByText(job.boardName, {exact: true})).first();
    if (await boardOption.count() === 0) throw new Error(`board "${job.boardName}" not found`);
    await boardOption.click();
    await pause();
    await page.getByRole('button', {name: /^(publish|save)$/i}).first().click();
    await page.waitForURL(/pinterest\.com\/pin\/\d+/, {timeout: 90000});
    const pinURL = page.url().split('?')[0].replace(/\/?$/, '/');
    await api('complete', {jobId: job.id, state: 'posted', pinURL});
    log('Posted:', pinURL);
  } catch (error) {
    log('Run failed:', error.message);
    if (job) await api('complete', {jobId: job.id, state: 'failed', error: error.message});
    await api('status', {state: 'error', detail: error.message});
  } finally {
    await api('session', {storageState: await context.storageState()}).catch(() => {});
    await browser.close();
    rmSync(dir, {recursive: true, force: true});
  }
}

main().catch(error => { console.error(error); process.exit(1); });
