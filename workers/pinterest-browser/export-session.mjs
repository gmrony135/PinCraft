// RUN ON YOUR OWN COMPUTER. You sign in to SlimGlow Life yourself in the window that opens.
// The script never sees or stores your password. It only saves the session cookies to a file.
import {chromium} from 'playwright';
import {createInterface} from 'node:readline/promises';
import {writeFileSync} from 'node:fs';

const OUT = 'slimglow-session.json';
const rl = createInterface({input: process.stdin, output: process.stdout});
const browser = await chromium.launch({headless: false});
const context = await browser.newContext();
const page = await context.newPage();
await page.goto('https://www.pinterest.com/login/');
console.log('\n1) Sign in to @SlimGlowLifex in the window (password, 2FA, CAPTCHA: all yours).');
await rl.question('2) When you see your SlimGlow Life home page, press Enter here... ');
await page.goto('https://www.pinterest.com/SlimGlowLifex/', {waitUntil: 'domcontentloaded'});
const owner = await page.getByRole('link', {name: /edit profile/i}).count();
if (owner === 0) {
  console.log('\nNot signed in as @SlimGlowLifex. Nothing was saved. Run the script again.');
} else {
  const state = await context.storageState();
  writeFileSync(OUT, JSON.stringify({cookies: state.cookies, origins: state.origins}, null, 2), {mode: 0o600});
  console.log(`\nSaved ${OUT}. Upload it in PinCraft (Pinterest automation > Upload session), then DELETE the file.`);
}
rl.close();
await browser.close();
