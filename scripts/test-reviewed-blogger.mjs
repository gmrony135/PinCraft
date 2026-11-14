// Node unit + real transactional Firestore/Auth emulator tests. ALL remote
// Blogger operations below are synthetic transports, never genuine publishing.
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import { getDatabase } from '../lib/automation/db.mjs';
import { firebaseAuth } from '../lib/firebase/admin.mjs';
import { data, accountRef, connectionRef, ownerKey } from '../lib/automation/firestore.mjs';
import { startOAuth, saveOAuthGrant, removeOAuthLocally } from '../lib/automation/oauth-store.mjs';
import { getAccessToken, maintainPinterestTokens } from '../lib/automation/oauth-tokens.mjs';
import { decryptCredentials, vaultReady } from '../lib/automation/vault.mjs';
import { oauthConfig, authorizationURL, tokenAudience } from '../lib/automation/oauth-config.mjs';
import { publishArticle, postPin } from '../lib/automation/providers.mjs';
import { runWorker, runJob } from '../lib/automation/worker.mjs';
import { addQueuedPin } from '../lib/automation/queue.mjs';
import { saveAutomation, toggleAutomation } from '../lib/automation/channels.mjs';
import { httpsURL, publicAddresses, requestData } from '../lib/automation/http.mjs';
import { AutomationError } from '../lib/automation/errors.mjs';
import { reviewedInput, articleHTML, reportedPinURL, redactedError } from '../lib/publishing/content.mjs';
import { localToUTC } from '../lib/publishing/time.mjs';
import { pinPackEntries, zipStore, crc32 } from '../lib/publishing/pin-pack.mjs';
import { BloggerPublisher, publicationMarker, articleURL } from '../lib/publishing/blogger.mjs';
import { FLOW, LEASE_MS, POLL_MS, createPublishingJob, listPublishingJobs, publishingStatus, processPublishingJob, retryPublishingJob, reviewPublishingJob, markManualPin, runReviewedPublisher } from '../lib/publishing/repository.mjs';
import { isolatedFirebase, resetFirebase, firebaseIdentity, grant, BLOG } from './automation-fixtures.mjs';
import { reviewedFixture, reviewedRequest, POST } from './reviewed-blogger-fixtures.mjs';

isolatedFirebase();
if (process.env.PINCRAFT_PUBLISHING_MODE === 'legacy_api') throw new Error('The new suite requires manual Pinterest mode.');
const db = getDatabase(), evidence = [];
const row = async id => data(await db.collection('publish_jobs').doc(id).get());
const run = (f, id, extra = {}) => processPublishingJob(db, id, { uid: f.uid, send: f.send, now: f.now, ...extra });
async function create(f, extra = {}) { return (await createPublishingJob(db, f.uid, reviewedRequest(extra), { now: f.now() })).job; }
async function complete(f, id) { let result; for (let i = 0; i < 3; i++) result = await run(f, id); return result.job; }
// Explicit, local-only Firestore fault injection. No production switch, API
// parameter or runtime repository hook can select this test proxy.
function databaseFault({ beforeWrite = () => {}, afterCommit = () => {} }) {
  return new Proxy(db, { get(target, key) {
    if (key === 'runTransaction') return async (task, options) => {
      let writes = [];
      const result = await target.runTransaction(async tx => {
        writes = [];
        const proxy = new Proxy(tx, { get(t, k) {
          if (k === 'set') return (reference, value, ...rest) => { beforeWrite(reference, value); writes.push({ reference, value }); t.set(reference, value, ...rest); return proxy; };
          const value = Reflect.get(t, k, t); return typeof value === 'function' ? value.bind(t) : value;
        } });
        return task(proxy);
      }, options);
      await afterCommit(writes); return result;
    };
    const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
  } });
}
const rejectCode = code => error => { assert.equal(error.code, code); return true; };
const check = (name, task) => test(name, async () => { try { await task(); evidence.push({ name, pass: true }); } catch (error) { evidence.push({ name, pass: false, error: error.message }); throw error; } });
before(async () => { await resetFirebase(); });
after(async () => { await mkdir('.shots', { recursive: true }); await writeFile('.shots/reviewed-blogger-tests.json', JSON.stringify({ mode: 'Guarded demo emulators + explicit Blogger doubles; no production authorization or publication.', passed: evidence.filter(r => r.pass).length, total: evidence.length, results: evidence }, null, 2) + '\n'); await db.terminate(); });

check('Default mode permits Blogger only and advertises the exact canonical callback', async () => {
  assert.equal(oauthConfig('pinterest').configured, false);
  assert.equal(oauthConfig('blogger').redirectUri, 'https://pincraftly.vercel.app/api/blogger/callback');
  const url = new URL(authorizationURL('blogger', 'synthetic-state', 'synthetic-challenge'));
  for (const [key, value] of Object.entries({ access_type: 'offline', prompt: 'consent', code_challenge_method: 'S256', scope: 'https://www.googleapis.com/auth/blogger' })) assert.equal(url.searchParams.get(key), value);
  assert.throws(() => authorizationURL('pinterest', 'state'), rejectCode('pinterest_manual_mode'));
  assert.deepEqual(await maintainPinterestTokens(db, { send: () => { throw new Error('No request allowed'); } }), { checked: 0, renewed: 0 });
});
check('Google aliases and the existing vault key are strict, without rotating keys', () => {
  const previous = { GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI, TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY };
  try { process.env.GOOGLE_CLIENT_ID = 'synthetic-google.apps.googleusercontent.com'; process.env.GOOGLE_CLIENT_SECRET = 'synthetic-client-secret'; assert(oauthConfig('blogger').configured); process.env.GOOGLE_REDIRECT_URI = 'https://wrong.example.com/callback'; assert(!oauthConfig('blogger').configured); process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64'); assert(!vaultReady()); process.env.TOKEN_ENCRYPTION_KEY = process.env.AUTOMATION_ENCRYPTION_KEY; assert(vaultReady()); }
  finally { for (const [k, v] of Object.entries(previous)) if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});
check('Strict reviewed inputs reject provider credentials, old Pinterest API fields and unreviewed content', () => {
  for (const patch of [{ reviewed: false }, { pinterestConnectionId: 'pinterest' }, { boardId: '123' }, { pinPublishAtUTC: 'now' }, { sessionCookie: 'not-collected' }, { bloggerConnectionId: 'pinterest' }, { article: [] }]) assert.throws(() => reviewedInput(reviewedRequest(patch)));
  const good = reviewedInput(reviewedRequest()); assert.equal(good.pin.imageSource, 'local_download'); assert.equal(good.pin.imageUrl, null);
});
check('HTML is restricted to balanced article tags, with no script, event attributes, comments or image bytes', () => {
  const safe = '<p>This is a sufficiently long and safe plain text article paragraph.</p>';
  assert.equal(articleHTML(safe), safe);
  for (const value of [safe + '<script>alert(1)</script>', safe + '<img src=x onerror=alert(1)>', safe + '<p class="x">unsafe</p>', safe + '<!-- marker injection -->', safe + '<p><em>x</p></em>', safe + '<iframe></iframe>', '<p>' + 'x'.repeat(100001) + '</p>']) assert.throws(() => articleHTML(value));
});
check('Manual artwork accepts a local download or a public URL, not embedded bytes/private hosts', async () => {
  const request = reviewedRequest(); assert.equal(reviewedInput(request).pin.imageSource, 'local_download');
  for (const url of ['data:image/png;base64,abc', 'http://example.com/a.png', 'https://127.0.0.1/a.png', 'https://169.254.169.254/a.png', 'https://owner:password@example.com/a.png']) assert.throws(() => reviewedInput({ ...request, pin: { ...request.pin, imageSource: 'public_url', imageUrl: url } }));
  assert.throws(() => httpsURL('https://private.local/a'));
  await assert.rejects(publicAddresses('safe.example.com', async () => [{ address: '127.0.0.1', family: 4 }]));
});
check('UTC ordering and IANA/DST validation reject reversed targets and ambiguous/nonexistent local times', () => {
  const now = Date.now();
  assert.throws(() => reviewedInput(reviewedRequest({ blogPublishAtUTC: new Date(now + 3600000).toISOString(), pinReadyAtUTC: new Date(now + 1000).toISOString() }), now));
  assert.throws(() => reviewedInput(reviewedRequest({ timezone: 'Not/A_Timezone' })));
  assert.equal(localToUTC('2026-11-13T12:00', 'Asia/Dhaka'), '2026-11-13T06:00:00.000Z');
  assert.throws(() => localToUTC('2027-03-14T02:30', 'America/New_York'), /does not exist/);
  assert.throws(() => localToUTC('2027-11-07T01:30', 'America/New_York'), /happens twice/);
});
check('Pin copy preserves plain description newlines while invalid UTC calendar dates fail closed', () => {
  const raw=reviewedRequest();raw.pin.description='A short reviewed description.\nWith a second plain-text line.';
  assert.equal(reviewedInput(raw).pin.description,raw.pin.description);
  assert.throws(()=>reviewedInput({...raw,blogPublishAtUTC:'2027-02-31T12:00:00Z',pinReadyAtUTC:'2027-03-04T12:00:00Z'},Date.parse('2027-02-01T00:00:00Z')));
});
check('Creation is owner-scoped, idempotent and does not call any publishing provider', async () => {
  const f = await reviewedFixture(), raw = reviewedRequest(); const first = await createPublishingJob(db, f.uid, raw), again = await createPublishingJob(db, f.uid, raw);
  assert.equal(first.job.id, again.job.id); assert(again.replayed); assert.equal(f.calls.draft, 0); assert.equal(f.calls.publish, 0); assert.equal(first.job.status, 'queued');
  await assert.rejects(createPublishingJob(db, f.uid, { ...raw, article: { ...raw.article, title: 'Different reviewed title' } }), rejectCode('request_changed'));
  const other = await firebaseIdentity('other-' + randomUUID()); await assert.rejects(createPublishingJob(db, other.id, raw), rejectCode('not_found'));
  assert.equal((await listPublishingJobs(db, other.id)).jobs.length, 0); await assert.rejects(processPublishingJob(db, first.job.id, { uid: other.id }), rejectCode('not_found'));
});
check('Concurrent identical creation persists exactly one parent and one immutable manual-task ID', async () => {
  const f = await reviewedFixture(), raw = reviewedRequest(), results = await Promise.all([createPublishingJob(db, f.uid, raw), createPublishingJob(db, f.uid, raw)]);
  assert.equal(results[0].job.manualTaskId, results[1].job.manualTaskId); assert.equal((await listPublishingJobs(db, f.uid)).jobs.length, 1);
});
check('An accepted request can be replayed after time passes and after disconnection without creating a new job', async () => {
  const f = await reviewedFixture(), raw = reviewedRequest(), first = await createPublishingJob(db, f.uid, raw); await removeOAuthLocally(db, f.uid, 'blogger');
  const replay = await createPublishingJob(db, f.uid, raw, { now: f.now() + 2 * 86400000 }); assert.equal(replay.job.id, first.job.id); assert(replay.replayed);
});
check('Draft -> publish -> public verification uses one saved post and only then releases the manual pack', async () => {
  const f = await reviewedFixture(), job = await create(f); let result = await run(f, job.id);
  assert.equal(result.job.phase, 'publish'); assert.equal(result.job.remoteId, POST); assert.equal(result.job.resultURL, null); assert.equal((await listPublishingJobs(db, f.uid)).jobs.length, 1);
  const inserted = f.requests.find(r => r.url.includes('isDraft=true')); assert(JSON.parse(inserted.body).content.includes(publicationMarker(job.id))); assert.equal(JSON.parse(inserted.body).title, reviewedRequest().article.title);
  result = await run(f, job.id); assert.equal(result.job.status, 'waiting_live'); assert.equal(result.job.resultURL, null);
  result = await run(f, job.id); assert.equal(result.job.status, 'completed'); assert.equal(result.job.verification, 'blogger_live_verified'); assert.equal(result.job.attempts, 1);
  const manual = (await listPublishingJobs(db, f.uid)).jobs.find(j => j.type === 'manual_pin'); assert.equal(manual.bloggerJobId, job.id); assert.equal(manual.manualPin.articleURL, result.job.resultURL); assert.equal(manual.verification, null); assert.equal(manual.resultURL, null);
  assert.equal(f.calls.draft, 1); assert.equal(f.calls.publish, 1); assert.equal(f.calls.public, 1); assert.equal((await row(job.id)).reviewedRunAtUTC, undefined);
  await run(f, job.id); assert.equal(f.calls.draft, 1); assert.equal(f.calls.publish, 1);
});
check('Future publishDate is registered immediately, without a POST body, and SCHEDULED is never relabeled LIVE', async () => {
  const f = await reviewedFixture(), at = f.now() + 3600000, job = await create(f, { blogPublishAtUTC: new Date(at).toISOString(), pinReadyAtUTC: new Date(at + 1200000).toISOString() });
  await run(f, job.id); const result = await run(f, job.id); assert.equal(result.job.status, 'scheduled'); assert.equal(result.job.resultURL, null);
  const request = f.requests.find(r => r.url.includes('/publish')); assert.equal(new URL(request.url).searchParams.get('publishDate'), new Date(at).toISOString()); assert.equal(request.body, undefined);
  assert.equal((await run(f, job.id)).processed, false); assert.equal(f.calls.public, 0);
  f.advance(3600001); const live = await run(f, job.id); assert.equal(live.job.status, 'completed'); const manual = (await listPublishingJobs(db, f.uid)).jobs.find(j => j.type === 'manual_pin'); assert.equal(manual.status, 'awaiting_manual_time');
  f.advance(1200000); await run(f, manual.id); assert.equal((await row(manual.id)).status, 'ready_for_manual'); assert.equal(f.calls.publish, 1);
});
check('A still-SCHEDULED or future-dated remote post is polled, with no new insertion/publication', async () => {
  const f = await reviewedFixture({ stillScheduled: true }), at = f.now() + 60000, job = await create(f, { blogPublishAtUTC: new Date(at).toISOString(), pinReadyAtUTC: new Date(at).toISOString() });
  await run(f, job.id); await run(f, job.id); f.advance(60001); const result = await run(f, job.id); assert.equal(result.job.status, 'waiting_live'); assert.equal(result.job.resultURL, null); assert.equal(f.calls.draft, 1); assert.equal(f.calls.publish, 1); assert.equal(f.calls.public, 0);
});
check('LIVE in the admin API still needs a matching unauthenticated public page', async () => {
  const f = await reviewedFixture({ public: () => '<html><h1>Sign in to view this private blog</h1></html>' }), job = await create(f); const result = await complete(f, job.id);
  assert.equal(result.status, 'waiting_live'); assert.equal(result.resultURL, null); assert.equal((await listPublishingJobs(db, f.uid)).jobs.length, 1);
  const request = f.requests.find(r => r.publicHost); assert.equal(request.headers, undefined); assert.equal(request.body, undefined);
});
check('Public post URLs must belong to the verified blog, never a guessed slug or another host', () => {
  assert.equal(articleURL({ url: 'http://example.com/2026/post.html' }, 'https://example.com/'), 'https://example.com/2026/post.html');
  for (const url of ['https://elsewhere.example.com/post', 'https://example.com/', 'https://example.com/p?draft=true', 'https://127.0.0.1/post']) assert.throws(() => articleURL({ url }, 'https://example.com/'));
});
check('Concurrent processing of the same job sends only one draft mutation', async () => {
  let enter, release; const entered = new Promise(r => { enter = r; }), blocked = new Promise(r => { release = r; }); const f = await reviewedFixture({ draft: async () => { enter(); await blocked; } }), job = await create(f), pending = run(f, job.id); await entered; try { const second = await run(f, job.id); assert.equal(second.processed, false); assert.equal(f.calls.draft, 1); } finally { release(); await pending; } assert.equal((await row(job.id)).phase, 'publish');
});
check('A definite rejected publish retries the saved draft, preserving the logical three-attempt budget', async () => {
  const f = await reviewedFixture({ publish: ({ calls }) => { if (calls.publish === 1) throw new AutomationError('provider_request', 'Blogger returned HTTP 400. Check reviewed fields.', { retryable: true, upstreamStatus: 400 }); } }), job = await create(f);
  await run(f, job.id); const failed = await run(f, job.id); assert.equal(failed.job.status, 'retry'); assert.equal(failed.job.remoteId, POST); f.advance(POLL_MS); const next = await run(f, job.id); assert.equal(next.job.attempts, 2); await run(f, job.id); assert.equal(f.calls.draft, 1); assert.equal(f.calls.publish, 2); assert.equal((await row(job.id)).status, 'completed');
});
check('Three definite failures stop; explicit Retry cannot reset the attempt count', async () => {
  const f = await reviewedFixture({ verify: () => { throw new AutomationError('provider_request', 'Blogger is temporarily unavailable.', { retryable: true, upstreamStatus: 503 }); } }), job = await create(f);
  for (let attempt = 1; attempt <= 3; attempt++) { const result = await run(f, job.id); assert.equal(result.job.attempts, attempt); assert.equal(result.job.status, attempt === 3 ? 'failed' : 'retry'); f.advance(POLL_MS * 2 ** attempt); }
  await assert.rejects(retryPublishingJob(db, f.uid, job.id, {}), rejectCode('attempt_limit')); assert.equal(f.calls.draft, 0);
});
check('A timed-out/5xx draft mutation becomes needs_review and never automatically reinserts', async () => {
  const f = await reviewedFixture({ draft: () => { throw new AutomationError('provider_unavailable', 'The remote mutation could not be confirmed.', { uncertain: true, upstreamStatus: 503 }); } }), job = await create(f), result = await run(f, job.id);
  assert.equal(result.job.status, 'needs_review'); f.advance(86400000); await run(f, job.id); assert.equal(f.calls.draft, 1); await assert.rejects(retryPublishingJob(db, f.uid, job.id, {}), rejectCode('review_required'));
  assert.equal((await row(job.id)).mutationPending, 'blogger_draft');
});
check('Unexpected accepted draft receipts retain a usable remote ID for inspection', async () => {
  const f = await reviewedFixture({ draft: ({ post }) => ({ ...post, status: 'LIVE' }) }), job = await create(f), result = await run(f, job.id);
  assert.equal(result.job.status, 'needs_review'); assert.equal(result.job.remoteId, POST); assert.equal(f.calls.draft, 1);
});
check('An accepted publish with an invalid status is uncertain, not a fake successful schedule', async () => {
  const f = await reviewedFixture({ publish: ({ post }) => ({ ...post, status: 'DRAFT' }) }), job = await create(f); await run(f, job.id); const result = await run(f, job.id); assert.equal(result.job.status, 'needs_review'); assert.equal(result.job.resultURL, null); await run(f, job.id); assert.equal(f.calls.publish, 1);
});
check('Malformed and oversized accepted HTTP mutation bodies force inspection at draft and publish checkpoints', async () => {
  const original = getGlobalDispatcher(), mock = new MockAgent(); mock.disableNetConnect(); mock.enableNetConnect(/^(127\.0\.0\.1|localhost)(:\d+)?$/); setGlobalDispatcher(mock);
  try {
    for (const phase of ['draft', 'publish']) for (const receipt of [
      { label: 'malformed JSON', body: '{not-json' },
      { label: 'oversized declared length', body: '{}', headers: { 'content-length': '65' } },
      { label: 'oversized streamed body', body: 'x'.repeat(65) },
    ]) {
      const path = '/blogger/v3/isolated-accepted-receipt-' + randomUUID();
      mock.get('https://www.googleapis.com').intercept({ path, method: 'POST' }).reply(200, receipt.body, { headers: receipt.headers || {} });
      const f = await reviewedFixture({ [phase]: ({ init }) => requestData('https://www.googleapis.com' + path, { ...init, maxBytes: 64 }) }), job = await create(f);
      if (phase === 'publish') await run(f, job.id);
      const result = await run(f, job.id); assert.equal(result.job.status, 'needs_review', phase + ': ' + receipt.label); assert.equal(result.job.resultURL, null); assert.equal(f.posts.size, 1);
      f.advance(86400000); await run(f, job.id); await assert.rejects(retryPublishingJob(db, f.uid, job.id, {}), rejectCode('review_required')); assert.equal(f.calls.draft, 1); assert.equal(f.calls.publish, phase === 'publish' ? 1 : 0);
    }
    mock.assertNoPendingInterceptors();
  } finally { setGlobalDispatcher(original); await mock.close(); }
});
check('An accepted Blogger result followed by a rejected checkpoint preserves its ID and blocks another mutation', async () => {
  for (const phase of ['draft', 'publish']) {
    const f = await reviewedFixture(), job = await create(f); if (phase === 'publish') await run(f, job.id); let injected = false;
    const faulty = databaseFault({ beforeWrite: (reference, value) => { if (!injected && reference.path === 'publish_jobs/' + job.id && value.phase === (phase === 'draft' ? 'publish' : 'verify_live')) { injected = true; throw new Error('Explicit isolated rejected checkpoint write'); } } });
    const result = await processPublishingJob(faulty, job.id, { uid: f.uid, send: f.send, now: f.now }); assert(injected); assert.equal(result.job.status, 'needs_review'); assert.equal(result.job.remoteId, POST); assert.equal(result.job.resultURL, null);
    await run(f, job.id); assert.equal(f.calls.draft, 1); assert.equal(f.calls.publish, phase === 'publish' ? 1 : 0); assert.equal(data(await connectionRef(db, f.uid, 'blogger').get()).reviewed_publish_job, null);
  }
});
check('A lost successful Firestore checkpoint acknowledgement resumes only its saved next phase', async () => {
  const f = await reviewedFixture(), job = await create(f); let injected = false;
  const faulty = databaseFault({ afterCommit: writes => { if (!injected && writes.some(({ reference, value }) => reference.path === 'publish_jobs/' + job.id && value.phase === 'publish' && value.status === 'queued')) { injected = true; throw new Error('Explicit isolated lost commit acknowledgement'); } } });
  const result = await processPublishingJob(faulty, job.id, { uid: f.uid, send: f.send, now: f.now }); assert(injected); assert.equal(result.job.phase, 'publish'); assert.equal(result.job.remoteId, POST);
  await run(f, job.id); const complete = await run(f, job.id); assert.equal(complete.job.status, 'completed'); assert.equal(f.calls.draft, 1); assert.equal(f.calls.publish, 1);
});
check('If all post-send writes fail, the pre-send marker survives and lease recovery requires inspection', async () => {
  const f = await reviewedFixture(), job = await create(f); let injected = 0;
  const faulty = databaseFault({ beforeWrite: reference => { if (reference.path === 'publish_jobs/' + job.id && f.calls.draft > 0) { injected++; throw new Error('Explicit isolated Firestore outage after acceptance'); } } });
  await assert.rejects(processPublishingJob(faulty, job.id, { uid: f.uid, send: f.send, now: f.now })); assert(injected >= 2); const durable = await row(job.id); assert.equal(durable.status, 'processing'); assert.equal(durable.mutationPending, 'blogger_draft');
  f.advance(LEASE_MS + 1); const recovered = await run(f, job.id); assert.equal(recovered.job.status, 'needs_review'); assert.equal(recovered.job.resultURL, null); assert.equal(f.calls.draft, 1); await run(f, job.id); assert.equal(f.calls.draft, 1);
});
check('Inspection requires this job’s marker and an owned post, not just a supplied URL/ID', async () => {
  const f = await reviewedFixture({ draft: () => { throw new AutomationError('uncertain', 'Inspection required.', { uncertain: true }); } }), job = await create(f); await run(f, job.id);
  f.posts.get(POST).content = '<p>A different post</p>';
  await assert.rejects(reviewPublishingJob(db, f.uid, job.id, { action: 'verify', remoteId: POST, inspected: true }, { send: f.send, now: f.now() }), rejectCode('verification_failed'));
  f.posts.get(POST).content = publicationMarker(job.id) + '<p>Reviewed article</p>';
  const result = await reviewPublishingJob(db, f.uid, job.id, { action: 'verify', remoteId: POST, inspected: true }, { send: f.send, now: f.now() }); assert.equal(result.job.phase, 'publish'); assert.equal(result.job.remoteId, POST); assert.equal(f.calls.draft, 1); assert.equal(result.job.resultURL, null);
});
check('Owner-abandoned uncertainty never fabricates a publication or deletes a remote post', async () => {
  const f = await reviewedFixture({ draft: () => { throw new AutomationError('uncertain', 'Inspection required.', { uncertain: true }); } }), job = await create(f); await run(f, job.id);
  const result = await reviewPublishingJob(db, f.uid, job.id, { action: 'abandon', inspected: true }); assert.equal(result.job.status, 'cancelled'); assert.equal(result.job.resultURL, null); assert.equal(f.posts.size, 1);
});
check('Lease expiry before send prevents the mutation, without declaring publication success', async () => {
  let f; f = await reviewedFixture({ verify: () => f.advance(LEASE_MS + 1) }); const job = await create(f), result = await run(f, job.id); assert.equal(f.calls.draft, 0); assert.equal(result.job.status, 'failed'); assert.equal(result.job.error.code, 'job_changed');
});
check('Interrupted leases with mutation markers require review; no-mutation interruptions can retry', async () => {
  const f = await reviewedFixture();
  for (const pending of [null, 'blogger_draft']) { const job = await create(f); await db.collection('publish_jobs').doc(job.id).update({ status: 'processing', attempts: 1, attemptOpen: true, mutationPending: pending, lease: randomUUID(), leaseUntilUTC: new Date(f.now() - 1), reviewedRunAtUTC: new Date(f.now() - 1) }); const result = await run(f, job.id); assert.equal(result.job.status, pending ? 'needs_review' : 'retry'); }
  assert.equal(f.calls.draft, 0);
});
check('A late accepted response cannot overwrite another lease’s uncertainty state', async () => {
  let f; f = await reviewedFixture({ draft: async () => { f.advance(LEASE_MS + 1); await run(f, active); } }); const job = await create(f), active = job.id, result = await run(f, job.id); assert.equal(result.job.status, 'needs_review'); assert.equal(f.calls.draft, 1); assert.equal(result.job.resultURL, null);
});
check('Connection mutation locks serialize two jobs and reject OAuth replacement while a send is in flight', async () => {
  let enter, release; const entered = new Promise(r => { enter = r; }), blocked = new Promise(r => { release = r; });
  const f = await reviewedFixture({ draft: async () => { enter(); await blocked; } }), first = await create(f), second = await create(f); const pending = run(f, first.id); await entered;
  try { const result = await run(f, second.id); assert.equal(result.job.status, 'retry'); assert.equal(result.job.error.code, 'connection_busy'); assert.equal(f.calls.draft, 1); await assert.rejects(startOAuth(db, f.uid, 'blogger'), rejectCode('worker_busy')); await assert.rejects(saveOAuthGrant(db, f.uid, 'blogger', grant('blogger', f.uid), 2), rejectCode('worker_busy')); }
  finally { release(); await pending; }
  assert.equal(data(await connectionRef(db, f.uid, 'blogger').get()).reviewed_publish_job, null);
});
check('Disconnect wins locally during an in-flight send and cannot resurrect credentials', async () => {
  let enter, release; const entered = new Promise(r => { enter = r; }), blocked = new Promise(r => { release = r; });
  const f = await reviewedFixture({ draft: async () => { enter(); await blocked; } }), job = await create(f), pending = run(f, job.id); await entered;
  await removeOAuthLocally(db, f.uid, 'blogger'); let auth = data(await connectionRef(db, f.uid, 'blogger').get()); assert.equal(auth.status, 'disconnected'); assert.equal(auth.encrypted_tokens, null); assert.equal(auth.reviewed_publish_job, job.id);
  await assert.rejects(startOAuth(db, f.uid, 'blogger'), rejectCode('worker_busy')); release(); await pending;
  auth = data(await connectionRef(db, f.uid, 'blogger').get()); assert.equal(auth.encrypted_tokens, null); assert.equal(auth.reviewed_publish_job, null);
  const next = await run(f, job.id); assert.equal(next.job.status, 'failed'); assert.equal(f.calls.publish, 0);
});
check('Reconnection must preserve Google identity, re-verify the blog, and explicitly reconfirm Retry', async () => {
  const f = await reviewedFixture(), job = await create(f); await run(f, job.id); await saveOAuthGrant(db, f.uid, 'blogger', grant('blogger', f.uid), 2); let result = await run(f, job.id); assert.equal(result.job.status, 'failed'); assert.equal(result.job.error.code, 'oauth_changed');
  await assert.rejects(retryPublishingJob(db, f.uid, job.id, { reconfirmConnection: true })); await accountRef(db, f.uid).collection('websites').doc('blogger_' + BLOG).update({ connection_revision: 3 });
  await assert.rejects(retryPublishingJob(db, f.uid, job.id, {}), rejectCode('reconfirmation_required')); result = await retryPublishingJob(db, f.uid, job.id, { reconfirmConnection: true }, { now: f.now() }); assert.equal(result.job.attempts, 1); await run(f, job.id); assert.equal(f.calls.draft, 1); assert.equal(f.calls.publish, 1);
});
check('A different Google identity cannot take over a saved job even with a verified same blog', async () => {
  const f = await reviewedFixture(), job = await create(f); await saveOAuthGrant(db, f.uid, 'blogger', grant('blogger', 'other-original-identity'), 2); await accountRef(db, f.uid).collection('websites').doc('blogger_' + BLOG).update({ connection_revision: 3 }); await run(f, job.id);
  await assert.rejects(retryPublishingJob(db, f.uid, job.id, { reconfirmConnection: true })); assert.equal(f.calls.draft, 0);
});
check('A removed or URL-changed website stops a queued job before the first mutation', async () => {
  for (const patch of [{ removed: true }, { url: 'https://other.example.com/' }]) { const f = await reviewedFixture(), job = await create(f); await accountRef(db, f.uid).collection('websites').doc('blogger_' + BLOG).update(patch); const result = await run(f, job.id); assert.equal(result.job.status, 'failed'); assert.equal(result.job.error.code, 'website_verification_required'); assert.equal(f.calls.draft, 0); }
});
check('Website removal, reassignment and revision changes during preflight stop the next draft or publish send', async () => {
  for (const phase of ['draft', 'publish']) for (const patch of [{ removed: true }, { connection_id: 'blogger_other' }, { connection_revision: 999 }]) {
    const f = await reviewedFixture(), job = await create(f); if (phase === 'publish') await run(f, job.id);
    const site = accountRef(db, f.uid).collection('websites').doc('blogger_' + BLOG), publisher = new BloggerPublisher(db, { send: f.send, now: f.now });
    const method = phase === 'draft' ? 'verifyBlog' : 'access', original = publisher[method].bind(publisher); let changed = false;
    publisher[method] = async (...args) => { const result = await original(...args); if (!changed) { changed = true; await site.update(patch); } return result; };
    const result = await run(f, job.id, { publisher }); assert(changed); assert.equal(result.job.status, 'failed'); assert.equal(result.job.error.code, 'website_verification_required'); assert.equal(f.calls.draft, phase === 'draft' ? 0 : 1); assert.equal(f.calls.publish, 0);
  }
});
check('Website changes during an already-sent draft preserve its ID but block the following publish checkpoint', async () => {
  let f; f = await reviewedFixture({ draft: async () => { await accountRef(db, f.uid).collection('websites').doc('blogger_' + BLOG).update({ removed: true }); } }); const job = await create(f);
  const accepted = await run(f, job.id); assert.equal(accepted.job.remoteId, POST); assert.equal(accepted.job.phase, 'publish'); const result = await run(f, job.id); assert.equal(result.job.status, 'failed'); assert.equal(result.job.error.code, 'website_verification_required'); assert.equal(f.calls.draft, 1); assert.equal(f.calls.publish, 0); assert.equal((await listPublishingJobs(db, f.uid)).jobs.length, 1);
});
check('Subscription capacity is enforced again immediately before publication, not just during review', async () => {
  const f = await reviewedFixture(), first = accountRef(db, f.uid).collection('websites').doc('blogger_' + BLOG); await first.update({ created_at: new Date(f.now() - 1000) }); const original = data(await first.get());
  await accountRef(db, f.uid).collection('websites').doc('blogger_222222').set({ ...original, id: 'blogger_222222', blog_id: '222222', created_at: new Date(f.now()) });
  await assert.rejects(create(f, { websiteId: 'blogger_222222' }), rejectCode('subscription_required'));
  await db.collection('pincraft_subscriptions').doc(ownerKey(f.uid)).set({ status: 'active', limits: { pinterest: 2, websites: 2 }, approved_payment_id: 'explicit-test-approval', expires_at: new Date(Date.now() + 3600000) });
  const job = await create(f, { websiteId: 'blogger_222222' }); await db.collection('pincraft_subscriptions').doc(ownerKey(f.uid)).update({ expires_at: new Date(Date.now() - 1000) }); const result = await run(f, job.id); assert.equal(result.job.error.code, 'subscription_required'); assert.equal(f.calls.draft, 0);
});
check('Disabled or no-longer-verified managed owners cannot authorize scheduled mutations', async () => {
  const f = await reviewedFixture(), job = await create(f); await firebaseAuth().updateUser(f.uid, { disabled: true }); const result = await run(f, job.id); assert.equal(result.job.error.code, 'account_unavailable'); assert.equal(f.calls.draft, 0);
});
check('One 401 causes one refreshed-token retry; a second 401 requires reconnect', async () => {
  const f = await reviewedFixture({ verify: ({ calls }) => { if (calls.verify === 1) throw new AutomationError('provider_auth', 'Unauthorized.', { upstreamStatus: 401 }); } }), job = await create(f); await run(f, job.id); assert.equal(f.calls.refresh, 2); assert.equal(f.calls.draft, 1);
  const broken = await reviewedFixture({ verify: () => { throw new AutomationError('provider_auth', 'Unauthorized.', { upstreamStatus: 401 }); } }), next = await create(broken); const result = await run(broken, next.id); assert.equal(result.job.status, 'failed'); assert.equal(broken.calls.refresh, 2); assert.equal(data(await connectionRef(db, broken.uid, 'blogger').get()).status, 'reconnect_required');
});
check('Expired offline authorization is actionable and browser receipts never contain tokens', async () => {
  const f = await reviewedFixture(), job = await create(f); await connectionRef(db, f.uid, 'blogger').update({ refresh_expires_at: new Date(Date.now() - 1) }); const result = await run(f, job.id); assert.equal(result.job.status, 'failed'); assert.match(result.job.error.message, /reconnect|reauthor/i); assert.equal(f.calls.draft, 0);
  const raw = JSON.stringify({ status: await publishingStatus(db, f.uid), jobs: await listPublishingJobs(db, f.uid) }); for (const secret of ['isolated-reviewed-access', 'isolated-reviewed-rotated-refresh', 'encrypted_tokens', 'pkce_envelope', 'refreshToken', 'BEGIN PRIVATE KEY']) assert(!raw.includes(secret));
});
check('Google refresh grants remain per-owner encrypted and no access token is persisted', async () => {
  const f = await reviewedFixture(); await getAccessToken(db, f.uid, 'blogger', { send: f.send }); const saved = data(await connectionRef(db, f.uid, 'blogger').get()), secret = decryptCredentials(tokenAudience(f.uid, 'blogger'), saved.encrypted_tokens); assert.deepEqual(Object.keys(secret), ['refreshToken']); assert(!JSON.stringify(saved).includes('isolated-reviewed-access')); assert.throws(() => decryptCredentials(tokenAudience('another-owner', 'blogger'), saved.encrypted_tokens));
});
check('429 pauses the whole runner and an owner cannot bypass its recorded backoff', async () => {
  // Make only these parents due; other cases intentionally left queued work.
  for (const doc of (await db.collection('publish_jobs').get()).docs) if (data(doc).reviewedRunAtUTC) await doc.ref.update({ reviewedRunAtUTC: new Date(Date.now() + 86400000) });
  const f = await reviewedFixture({ verify: () => { throw new AutomationError('provider_request', 'Rate limit. Wait before retrying.', { retryable: true, upstreamStatus: 429, retryAfterSeconds: 300 }); } }), first = await create(f); f.advance(1); await create(f);
  const result = await runReviewedPublisher(db, { send: f.send, now: f.now }); assert.equal(result.outcome, 'rate_limited'); assert.equal(f.calls.verify, 1); assert.equal(f.calls.draft, 0); await assert.rejects(retryPublishingJob(db, f.uid, first.id, {}, { now: f.now() }), rejectCode('rate_limited'));
});
check('Manual Pin completion is only user-reported and cannot accept arbitrary/social-shortened URLs', async () => {
  const f = await reviewedFixture(), job = await create(f); await complete(f, job.id); const manual = (await listPublishingJobs(db, f.uid)).jobs.find(j => j.type === 'manual_pin');
  const saved = await markManualPin(db, f.uid, manual.id, { confirmedManual: true, pinURL: 'https://www.pinterest.com/pin/9876543210/' }); assert.equal(saved.job.status, 'manually_marked_done'); assert.equal(saved.job.verification, 'user_reported_not_verified'); assert.equal(saved.job.resultURL, null);
  for (const value of ['https://evil.example/pin/9876543210/', 'https://www.pinterest.com/pin/9876543210/?token=bad', 'https://pin.it/short']) assert.throws(() => reportedPinURL(value));
  await assert.rejects(markManualPin(db, f.uid, manual.id, { confirmedManual: false, pinURL: saved.job.reportedPinURL }), rejectCode('manual_confirmation_required'));
});
check('Manual export is a valid offline ZIP with copy and optional artwork, never a Pin receipt', async () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const entries = pinPackEntries({ ...reviewedRequest().pin, articleURL: 'https://example.com/real-live-post' }, new Uint8Array([137, 80, 78, 71])); const blob = zipStore(entries); assert.equal(blob.type, 'application/zip'); await mkdir('.shots', { recursive: true }); await writeFile('.shots/reviewed-manual-pack-test.zip', new Uint8Array(await blob.arrayBuffer()));
  const verify = spawnSync('python3', ['-c', "import zipfile,json; z=zipfile.ZipFile('.shots/reviewed-manual-pack-test.zip'); assert z.testzip() is None; assert set(z.namelist())=={'README.txt','pin-details.txt','pin-details.json','pin-image.png'}; assert json.loads(z.read('pin-details.json'))['destinationURL']=='https://example.com/real-live-post'"], { encoding: 'utf8' }); assert.equal(verify.status, 0, verify.stderr);
  assert.throws(() => pinPackEntries(reviewedRequest().pin));
});
check('Legacy entrypoints do not generate, refresh Pinterest or publish in the selected manual mode', async () => {
  const send = () => { throw new Error('No provider request allowed.'); }; await assert.rejects(postPin({}, {}, '', send), rejectCode('pinterest_manual_mode')); await assert.rejects(publishArticle({}, {}, send), rejectCode('reviewed_publishing_required')); const result = await runWorker(db, { dependencies: { send } }); assert.equal(result.processed, 0); assert.equal(result.status, 'disabled'); assert.equal((await runJob(null, null, { send })).status, 'disabled'); await assert.rejects(addQueuedPin(null, 'not-used', {}, { verifyImage: send, resolve: send }), rejectCode('pinterest_manual_mode')); await assert.rejects(saveAutomation(null, 'not-used', {}), rejectCode('reviewed_publishing_required')); await assert.rejects(toggleAutomation(null, 'not-used', { enabled: true }, null), rejectCode('reviewed_publishing_required'));
});
check('Errors, workflow and CLI guardrails do not disclose credentials or install a browser publisher', async () => {
  const error = new AutomationError('provider_request', 'Bearer ya29.synthetic-very-long-private-access-token'); assert(!redactedError(error).message.includes('ya29.'));
  const workflow = await readFile('.github/workflows/pincraft-reviewed-blogger.yml', 'utf8'); assert(workflow.includes("github.event.repository.private == false")); assert(workflow.includes("REVIEWED_BLOGGER_SCHEDULER_ENABLED == 'true'")); assert(workflow.includes('contents: read')); assert(!workflow.includes('id-token: write')); assert(!workflow.includes('pull_request:')); assert(!workflow.includes('PINTEREST_SESSION')); assert(!workflow.includes('GOOGLE_REFRESH_TOKEN')); assert(workflow.includes('--omit=dev --ignore-scripts')); assert.equal((workflow.match(/uses: actions\/[^@]+@[a-f0-9]{40}/g) || []).length, 2);
  const env = { ...process.env }; delete env.FIREBASE_EMULATORS; delete env.FIRESTORE_EMULATOR_HOST; delete env.FIREBASE_AUTH_EMULATOR_HOST; delete env.GITHUB_ACTIONS; const cli = spawnSync(process.execPath, ['--conditions=react-server', 'scripts/run-reviewed-blogger.mjs'], { env, encoding: 'utf8', timeout: 10000 }); assert.equal(cli.status, 1); assert.match(cli.stderr, /untrusted publishing context/);
});
check('Bounded runner records only its own summary heartbeat and never counts manual links as API results', async () => {
  for (const doc of (await db.collection('publish_jobs').get()).docs) if (data(doc).reviewedRunAtUTC) await doc.ref.update({ reviewedRunAtUTC: new Date(Date.now() + 86400000) });
  const f = await reviewedFixture(), job = await create(f); const result = await runReviewedPublisher(db, { send: f.send, now: f.now, maxSteps: 1 }); assert.equal(result.steps, 1); assert.equal(result.processed, 1); assert.equal(result.outcome, 'ok'); assert.equal((await row(job.id)).phase, 'publish'); const heartbeat = data(await db.doc('publisher_system/reviewed_blogger').get()); assert.equal(heartbeat.steps, 1); assert(!JSON.stringify(heartbeat).includes(f.uid)); assert(!JSON.stringify(heartbeat).includes('https://'));
  assert.equal(FLOW, 'blogger_manual_pin');
});

check('Direct Node CLI closes its client and returns only a zero-due summary under explicit local guards', async () => {
  for (const doc of (await db.collection('publish_jobs').get()).docs) if (data(doc).reviewedRunAtUTC) await doc.ref.update({ reviewedRunAtUTC: new Date(Date.now() + 86400000) });
  const cli = spawnSync(process.execPath, ['--conditions=react-server', '--import', './scripts/reviewed-blogger-http-fixtures.mjs', 'scripts/run-reviewed-blogger.mjs'], { env: { ...process.env, REVIEWED_BLOGGER_HTTP_FIXTURES: '1' }, encoding: 'utf8', timeout: 15000 });
  assert.equal(cli.status, 0, cli.stderr); const summary = JSON.parse(cli.stdout.trim().split('\n').at(-1)); assert.deepEqual(summary, { ok: true, mode: 'blogger_manual_pin', outcome: 'ok', dueCandidates: 0, steps: 0, processed: 0, failed: 0 });
  assert(!/refreshToken|encrypted_tokens|Bearer |isolated-reviewed-http-(?:access|refresh)/.test(cli.stdout + cli.stderr));
});
