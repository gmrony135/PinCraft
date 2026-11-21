// Order E checks: Telegram is required at the first action, not at sign-in. Pure checks, no emulator.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requireTelegramVerified } from '../lib/showcase/gate.mjs';
import { publicError } from '../lib/automation/errors.mjs';
import { TELEGRAM_REQUIRED_CODE, TELEGRAM_REQUIRED_EVENT } from '../lib/showcase/telegram-required.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log(`ok - ${name}`); };
const fakeDb = (docs) => ({ collection: () => ({ doc: (id) => ({ get: async () => ({ data: () => docs[id] }) }) }) });

await check('(c) unverified user is refused with a Telegram-named error, before any action runs', async () => {
  const db = fakeDb({ 'uid-new': { telegramJoined: false, youtubeSubscribed: false } });
  await assert.rejects(requireTelegramVerified(db, 'uid-new'), (error) => {
    assert.equal(error.code, TELEGRAM_REQUIRED_CODE);
    assert.equal(error.status, 403);
    return true;
  });
  const missing = await requireTelegramVerified.call(null, fakeDb({}), 'uid-none').catch((e) => e);
  assert.equal(missing.code, TELEGRAM_REQUIRED_CODE, 'no showcase doc counts as unverified');
});
await check('refusal body names Telegram verification as missing and carries the code', async () => {
  const error = await requireTelegramVerified(fakeDb({}), 'uid-x').catch((e) => e);
  const body = publicError(error);
  assert.equal(body.code, TELEGRAM_REQUIRED_CODE);
  assert.match(body.error, /Telegram verification is missing/);
  assert.match(body.error, /@pincraft_ai/);
  assert.match(body.error, /no AI request was used/);
});
await check('(d) verified user passes the gate', async () => {
  const status = await requireTelegramVerified(fakeDb({ 'uid-ok': { telegramJoined: true } }), 'uid-ok');
  assert.deepEqual(status, { telegramJoined: true, youtubeSubscribed: false });
});
await check('the flag must be exactly true (a string or a missing field does not pass)', async () => {
  await assert.rejects(requireTelegramVerified(fakeDb({ 'u': { telegramJoined: 'true' } }), 'u'));
});

const gated = [
  ['app/api/ai/generate/route.js', 'requireTelegramVerified(getDatabase(), user.id)', 'generateForUser('],
  ['app/api/ai/pin-post-info/route.js', 'requireTelegramVerified(db, user.id)', 'generatePinPostInfo('],
  ['app/api/trend-finder/ideas/route.js', 'requireTelegramVerified(getDatabase(), user.id)', null],
  ['app/api/pin-queue/route.js', "['add', 'posted'].includes(body.action)", 'addPin('],
  ['app/api/pinterest-browser/jobs/route.js', 'requireTelegramVerified(getDatabase(),user.id)', 'queuePin('],
  ['app/api/pinterest/publishing/route.js', 'requireTelegramVerified(getDatabase(), user.id)', null],
  ['app/api/publish/[...path]/route.js', "key!=='automation/pause'", 'createPublishingJob('],
  ['app/api/automation/settings/route.js', "body.action!=='remove_ai'", 'verifyAI('],
  ['app/api/automation/queue/route.js', "['queue','retry'].includes(body.action)", 'addQueuedPin('],
  ['app/api/automation/review/route.js', "body.action!=='abandon'", null],
  ['app/api/workspace/route.js', "requireTelegramVerified(db, user.id)", 'addWebsite('],
];
for (const [file, gateText, actionText] of gated) {
  await check(`(c) ${file} checks Telegram before its action`, () => {
    const src = read(file);
    assert.ok(src.includes(gateText), 'gate present');
    assert.ok(src.includes("import { requireTelegramVerified } from '@/lib/showcase/gate.mjs';"), 'imported');
    if (actionText) assert.ok(src.indexOf(gateText) < src.indexOf(actionText), 'gate runs before the action');
  });
}
await check('AI generation: gate runs before any AI request or quota reservation', () => {
  const src = read('app/api/ai/generate/route.js');
  assert.ok(src.indexOf('requireTelegramVerified') < src.indexOf('generateForUser('));
});
await check('browsing and safety exits stay free: pause, abandon, remove, mode-off, remove_ai are not gated', () => {
  assert.match(read('app/api/publish/[...path]/route.js'), /key!=='automation\/pause'/);
  assert.match(read('app/api/automation/settings/route.js'), /body\.action==='mode'&&body\.enabled===false/);
  assert.match(read('app/api/automation/review/route.js'), /body\.action!=='abandon'/);
  assert.doesNotMatch(read('app/api/subscription/route.js'), /requireTelegramVerified/, 'payments unchanged');
  assert.doesNotMatch(read('app/api/showcase/route.js'), /requireTelegramVerified/, 'status read stays free');
});
await check('the browser prompt is closable, opens only on the refused-action event, and is not a sign-in gate', () => {
  const src = read('components/onboarding/ChannelShowcase.js');
  assert.match(src, /addEventListener\(TELEGRAM_REQUIRED_EVENT/);
  assert.match(src, /aria-label="Close"/); assert.match(src, /Not now/); assert.match(src, /Escape/);
  assert.match(src, /if \(!uid \|\| !open\) return null;/);
  assert.doesNotMatch(src, /channel-showcase-check/, 'no sign-in cover');
  assert.doesNotMatch(src, /Required to continue/, 'no required wording');
  assert.match(src, /Join &amp; Verify|Join & Verify/);
});
await check('the watcher fires the same event code on a refused /api response', () => {
  const src = read('lib/showcase/telegram-watch.js');
  assert.match(src, /TELEGRAM_REQUIRED_EVENT/); assert.match(src, /TELEGRAM_REQUIRED_CODE/);
  assert.match(src, /startsWith\("\/api\/"\)/);
  assert.equal(TELEGRAM_REQUIRED_EVENT, 'pincraft:telegram-required');
});
await check('layout still mounts the prompt, but it renders nothing unless opened (no sign-in cover)', () => {
  assert.match(read('app/layout.js'), /<ChannelShowcase \/>/);
});
await check('email-already-in-use wording and the Reload sign-in settings button', () => {
  const src = read('lib/firebase/client.js');
  assert.ok(src.includes("'auth/email-already-in-use': 'An account with this email already exists. Please sign in, or reset your password to continue.'"));
  assert.doesNotMatch(src, /This account could not be created/);
});
console.log(`\n${passed} Telegram action-gate checks passed`);
