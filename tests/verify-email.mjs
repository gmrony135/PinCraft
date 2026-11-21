// Checks for the verification-mail button fix and deliverability changes (owner order 2026-11-21).
// Run: node --conditions=react-server tests/verify-email.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { firebaseVerificationTemplate, firebaseVerificationText } from '../lib/email/templates.mjs';
import { messageForSend, htmlForSend } from '../lib/email/verification.mjs';
import { buildRawMessage } from '../lib/email/gmail.mjs';

const LINK = 'https://pincraftly.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=AbC123-xyz_9&apiKey=FAKEKEY&continueUrl=https%3A%2F%2Fpincraftly.vercel.app%2Flogin&lang=en';
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };
const decodeAttr = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
let calls = 0;
const auth = { generateEmailVerificationLink: async () => { calls++; return LINK; } };
const row = { template: 'verify', to: 'newuser@example.com', subject: 'Verify your email for PinCraft', html: firebaseVerificationTemplate() };

const { html, text } = await messageForSend(row, { auth });

check('button href is the same link as the printed fallback link', () => {
  const verifyHrefs = [...html.matchAll(/<a href="([^"]+)"/g)].map(m => decodeAttr(m[1])).filter(h => h.includes('oobCode'));
  assert.equal(verifyHrefs.length, 2, 'button and printed link');
  assert.deepEqual([...new Set(verifyHrefs)], [LINK], 'both hrefs decode to the exact fresh link');
});
check('button is a block-level tap target with its colour on the link itself', () => {
  const button = html.match(/<a href="[^"]*oobCode[^"]*" style="([^"]+)">Verify email<\/a>/);
  assert.ok(button, 'button markup present');
  assert.match(button[1], /display:block/);
  assert.match(button[1], /background-color:#be123c/);
  assert.match(button[1], /text-align:center/);
});
check('one fresh link is generated per send and used in both parts', () => {
  assert.equal(calls, 1, 'single generateEmailVerificationLink call');
  assert.ok(text.includes(LINK), 'plain-text part carries the same link unescaped');
  assert.ok(!text.includes('&amp;'), 'plain text is not HTML-escaped');
});
check('plain-text part is real text: no tags, has the fallback sentence and the ignore notice', () => {
  assert.ok(!/<[a-z!/][^>]*>/i.test(text), 'no HTML tags');
  assert.match(text, /verify your email address/);
  assert.match(text, /safely ignore this email/);
  assert.ok(!text.includes('%LINK%'), 'no placeholder left');
  assert.ok(!html.includes('%LINK%'), 'no placeholder left in html');
});
check('html keeps the in-page ignore notice and the placeholder-free result', () => {
  assert.match(html, /safely ignore this email/);
});
check('non-verify rows are untouched and have no text part', async () => {
  const welcome = await messageForSend({ template: 'welcome', html: '<p>x</p>' }, { auth });
  assert.deepEqual(welcome, { html: '<p>x</p>' });
  assert.equal(await htmlForSend(row, { auth }), html, 'htmlForSend still returns the html part');
});
check('MIME: with text, multipart/alternative with text/plain first and text/html second, both decode exactly', () => {
  const raw = buildRawMessage({ to: 'newuser@example.com', subject: 'Verify your email for PinCraft', html, text });
  const mime = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(mime, /^From: PinCraft <dream\.boost154@gmail\.com>\r\n/);
  const boundary = mime.match(/boundary="([^"]+)"/)[1];
  const parts = mime.split(`--${boundary}`).slice(1, -1).map(part => part.split('\r\n\r\n').slice(1).join('\r\n\r\n'));
  assert.equal(parts.length, 2);
  const [plain, rich] = parts.map(p => Buffer.from(p.replace(/\s+/g, ''), 'base64').toString('utf8'));
  assert.equal(plain, text, 'text/plain part decodes exactly');
  assert.equal(rich, html, 'text/html part decodes exactly');
  assert.match(mime, /Content-Type: text\/plain; charset=UTF-8/);
  assert.match(mime, /Content-Type: text\/html; charset=UTF-8/);
});
check('MIME: without text the message is still the single html part (existing emails unchanged)', () => {
  const mime = Buffer.from(buildRawMessage({ to: 'a@example.com', subject: 's', html: '<p>x</p>' }), 'base64url').toString('utf8');
  assert.match(mime, /Content-Type: text\/html; charset=UTF-8/);
  assert.ok(!/multipart/.test(mime));
});
check('tick sends the same message object (html and text) to Gmail', () => {
  const tick = readFileSync(new URL('../app/api/internal/email/tick/route.js', import.meta.url), 'utf8');
  assert.match(tick, /messageForSend\(row/);
  assert.match(tick, /sendGmail\(\{ refreshToken, to: row\.to, subject: row\.subject, html, text \}\)/);
});
check('signup/verify screen shows the spam-folder notice only in the verify step', () => {
  const form = readFileSync(new URL('../components/auth/AccountForm.js', import.meta.url), 'utf8');
  assert.match(form, /verification && <p data-testid="verify-spam-notice"/);
  assert.match(form, /Check your Spam or Promotions folder/);
});

check('expiry: both parts warn the link expires in 1 hour, and the button and fallback link are unchanged', () => {
  const line = 'This link expires in 1 hour \u2014 please click it soon.';
  assert.equal(html.split(line).length - 1, 1, 'html has the expiry line exactly once');
  assert.equal(text.split(line).length - 1, 1, 'text part has the expiry line exactly once');
  const verifyHrefs = [...html.matchAll(/href="([^"]*)"/g)].map(m => decodeAttr(m[1])).filter(h => h === LINK);
  assert.equal(verifyHrefs.length, 2, 'button and printed fallback still point at the fresh link');
  assert.match(html, /Verify email<\/a>/);
});
console.log(`\n${passed} verification-mail checks passed`);
