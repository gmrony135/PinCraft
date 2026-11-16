import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import sharp from 'sharp';
import { SignJWT, generateKeyPair } from 'jose';
import {
  PIN_JOB_COLLECTION, PIN_IMAGE_COLLECTION, PIN_SETTINGS_COLLECTION, PIN_RATE_COLLECTION,
  consumePinterestRateLimit, confirmPinterestSaved, listPinterestJobs, markPinterestOpened,
  markPinterestPublished, normalizePinterestImage, preparePinterestJob, reportedPinterestPinURL,
  retryPinterestValidation, runPinterestValidationWorker, savePinterestSettings,
} from '../lib/publishing/pinterest-workflow.mjs';
import { claimPinterestDelivery, pinterestWorkloadConfig, verifyPinterestWorkload } from '../lib/publishing/pinterest-workload.mjs';

process.env.APP_URL = 'https://pincraftly.vercel.app';
process.env.AUTOMATION_ENCRYPTION_KEY = Buffer.alloc(32, 17).toString('base64');
process.env.TOKEN_ENCRYPTION_KEY = process.env.AUTOMATION_ENCRYPTION_KEY;

function clone(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)]));
  return value;
}
class Snap {
  constructor(ref, value) { this.ref = ref; this.exists = value !== undefined; this._value = value === undefined ? undefined : clone(value); this.id = ref.id; }
  data() { return this.exists ? clone(this._value) : undefined; }
}
class Doc {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split('/').at(-1); }
  async get() { return new Snap(this, this.db.docs.get(this.path)); }
  async set(value) { this.db.docs.set(this.path, clone(value)); }
  async create(value) { if (this.db.docs.has(this.path)) { const error = new Error('exists'); error.code = 6; throw error; } this.db.docs.set(this.path, clone(value)); }
  async update(patch) { const current = this.db.docs.get(this.path); if (!current) throw new Error('missing'); this.db.docs.set(this.path, { ...current, ...clone(patch) }); }
  async delete() { this.db.docs.delete(this.path); }
}
class Query {
  constructor(db, collection, filters = [], sort = null, max = 1000) { Object.assign(this, { db, collection, filters, sort, max }); }
  where(field, op, value) { return new Query(this.db, this.collection, [...this.filters, [field, op, value]], this.sort, this.max); }
  orderBy(field, direction = 'asc') { return new Query(this.db, this.collection, this.filters, [field, direction], this.max); }
  limit(max) { return new Query(this.db, this.collection, this.filters, this.sort, max); }
  async get() {
    let rows = [...this.db.docs.entries()].filter(([path]) => path.startsWith(this.collection + '/'));
    rows = rows.filter(([, value]) => this.filters.every(([field, op, expected]) => op === '==' ? value?.[field] === expected : op === '<=' ? new Date(value?.[field]).getTime() <= new Date(expected).getTime() : false));
    if (this.sort) { const [field, direction] = this.sort; rows.sort((a, b) => { const av = a[1]?.[field] instanceof Date ? a[1][field].getTime() : String(a[1]?.[field] || ''), bv = b[1]?.[field] instanceof Date ? b[1][field].getTime() : String(b[1]?.[field] || ''); return (av < bv ? -1 : av > bv ? 1 : 0) * (direction === 'desc' ? -1 : 1); }); }
    const docs = rows.slice(0, this.max).map(([path, value]) => new Snap(new Doc(this.db, path), value));
    return { docs, size: docs.length, empty: !docs.length };
  }
}
class Tx {
  constructor(db) { this.db = db; this.writes = []; }
  async get(ref) { return ref instanceof Query ? ref.get() : ref.get(); }
  set(ref, value) { this.writes.push(['set', ref, clone(value)]); return this; }
  create(ref, value) { this.writes.push(['create', ref, clone(value)]); return this; }
  async commit() { for (const [kind, ref, value] of this.writes) { if (kind === 'create') await ref.create(value); else await ref.set(value); } }
}
class FakeDB {
  constructor() { this.docs = new Map(); }
  collection(name) { return { doc: id => new Doc(this, `${name}/${id}`), where: (...args) => new Query(this, name).where(...args), orderBy: (...args) => new Query(this, name).orderBy(...args), limit: max => new Query(this, name).limit(max) }; }
  doc(path) { return new Doc(this, path); }
  async runTransaction(task) { const tx = new Tx(this), result = await task(tx); await tx.commit(); return result; }
}
const db = new FakeDB();
const a = 'workflow-owner-a', b = 'workflow-owner-b';
const png = await sharp({ create: { width: 900, height: 1200, channels: 3, background: '#c3d5a4' } }).png().toBuffer();
const imageDataUrl = `data:image/png;base64,${png.toString('base64')}`;
const input = (overrides = {}) => ({ action: 'prepare', requestId: randomUUID(), title: 'A Calm Balcony Garden', description: 'A practical, image-led idea for planning a calmer balcony garden with leafy plants and natural light.', destinationURL: 'https://example.com/balcony-garden', imageDataUrl, consent: true, ...overrides });
const code = name => error => error?.code === name;
async function makeReportedPinterestJob(testDB, title) {
  const prepared = await preparePinterestJob(testDB, a, input({ title }));
  await markPinterestOpened(testDB, a, prepared.job.id);
  await confirmPinterestSaved(testDB, a, prepared.job.id, { action: 'confirm', confirmedSaved: true });
  const published = await markPinterestPublished(testDB, a, prepared.job.id, { action: 'published', pinURL: 'https://www.pinterest.com/pin/123456789012345/', confirmedPublic: true });
  return { id: prepared.job.id, job: published.job };
}

test('bounded image processing accepts a single portrait PNG, normalizes format and strips metadata', async () => {
  const result = await normalizePinterestImage(imageDataUrl);
  assert.equal(result.mimeType, 'image/webp'); assert.equal(result.width, 1000); assert.equal(result.height, 1500);
  assert(result.byteSize <= 650000); assert.equal(result.metadataStripped, true); assert.equal(result.sourceFormat, 'png');
  const metadata = await sharp(result.bytes).metadata(); assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, 1000); assert.equal(metadata.height, 1500); assert.equal(metadata.exif, undefined);
});

test('image, text and URL validation rejects animation, unsupported input, unsafe URL and markup', async () => {
  await assert.rejects(() => normalizePinterestImage('data:image/svg+xml;base64,PHN2Zz4='), code('invalid_pin_image'));
  await assert.rejects(() => preparePinterestJob(db, a, input({ destinationURL: 'http://127.0.0.1/private' })), code('invalid_destination_url'));
  await assert.rejects(() => preparePinterestJob(db, a, input({ title: '<script>bad</script>' })), code('invalid_pin_content'));
  await assert.rejects(() => preparePinterestJob(db, a, input({ consent: false })), code('invalid_pin_request'));
});

test('prepare creates one owner-scoped job, stores only normalized bytes, and suppresses duplicate submissions', async () => {
  const request = input({ rememberDestination: true });
  const first = await preparePinterestJob(db, a, request, { now: 1700000000000 });
  assert.equal(first.duplicate, false); assert.equal(first.job.status, 'pin_prepared'); assert.equal(first.job.validationStatus, 'pending');
  assert.match(first.job.imageURL, /^https:\/\/pincraftly\.vercel\.app\/api\/pinterest\/publishing\/image\//);
  const create = new URL(first.job.pinterestCreateURL);
  assert.equal(create.origin, 'https://www.pinterest.com'); assert.equal(create.pathname, '/pin/create/button/');
  assert.equal(create.searchParams.get('url'), request.destinationURL); assert.equal(create.searchParams.get('description'), request.description); assert(create.searchParams.get('media').includes('/api/pinterest/publishing/image/'));
  assert.equal(create.searchParams.has('title'), false);
  const storedImage = (await db.collection(PIN_IMAGE_COLLECTION).doc(first.job.id).get()).data();
  assert.equal(storedImage.ownerUID, a); assert(Buffer.isBuffer(storedImage.bytes)); assert.equal(storedImage.mimeType, 'image/webp'); assert(!storedImage.bytes.equals(png));
  const second = await preparePinterestJob(db, a, input({ requestId: randomUUID(), rememberDestination: true }), { now: 1700000001000 });
  assert.equal(second.duplicate, true); assert.equal(second.job.id, first.job.id);
  const listA = await listPinterestJobs(db, a), listB = await listPinterestJobs(db, b);
  assert.equal(listA.jobs.length, 1); assert.equal(listA.settings.defaultDestinationURL, request.destinationURL);
  assert.equal(listB.jobs.length, 0); assert.equal(listB.settings.defaultDestinationURL, '');
  await assert.rejects(() => preparePinterestJob(db, b, input({ requestId: first.job.id, title: 'Different User Content' })), code('pin_job_not_found'));
});

test('a reused idempotency key cannot replace saved Pin content', async () => {
  const request = input(); const first = await preparePinterestJob(db, a, request);
  await assert.rejects(() => preparePinterestJob(db, a, input({ requestId: request.requestId, title: 'Another different Pin title' })), code('pin_request_reused'));
  assert.equal((await listPinterestJobs(db, a)).jobs.find(job => job.id === first.job.id).title, request.title);
});

test('manual lifecycle requires each explicit step and never invents API-verified publication', async () => {
  const prepared = await preparePinterestJob(db, a, input()); const id = prepared.job.id;
  await assert.rejects(() => confirmPinterestSaved(db, a, id, { action: 'confirm', confirmedSaved: true }), code('pin_job_transition'));
  await assert.rejects(() => markPinterestOpened(db, b, id), code('pin_job_not_found'));
  const opened = await markPinterestOpened(db, a, id); assert.equal(opened.job.status, 'pinterest_opened'); assert.equal(opened.job.reportedPinURL, null);
  const confirmed = await confirmPinterestSaved(db, a, id, { action: 'confirm', confirmedSaved: true }); assert.equal(confirmed.job.status, 'user_confirmed'); assert.equal(confirmed.job.reportedPinURL, null);
  await assert.rejects(() => markPinterestPublished(db, a, id, { action: 'published', pinURL: 'https://www.pinterest.com/', confirmedPublic: true }), code('invalid_pinterest_pin_url'));
  const published = await markPinterestPublished(db, a, id, { action: 'published', pinURL: 'https://www.pinterest.com/pin/123456789012345/', confirmedPublic: true });
  assert.equal(published.job.status, 'published'); assert.equal(published.job.reportedPinURL, 'https://www.pinterest.com/pin/123456789012345/');
  assert.match(published.job.activity.at(-1).message, /not Pinterest API-verified/);
  assert.equal((await markPinterestPublished(db, a, id, { action: 'published', pinURL: published.job.reportedPinURL, confirmedPublic: true })).job.status, 'published');
  await assert.rejects(() => markPinterestPublished(db, b, id, { action: 'published', pinURL: published.job.reportedPinURL, confirmedPublic: true }), code('pin_job_not_found'));
});

test('Node validation worker audits bounded private jobs and records owner-visible status/activity only', async () => {
  const prepared = await preparePinterestJob(db, a, input({ title: 'Workflow Integrity Audit Pin' }));
  const result = await runPinterestValidationWorker(db, { now: () => Date.now(), limit: 10 });
  assert(result.processed >= 1); assert(result.verified >= 1);
  const refreshed = (await listPinterestJobs(db, a)).jobs.find(job => job.id === prepared.job.id);
  assert.equal(refreshed.status, 'pin_prepared'); assert.equal(refreshed.validationStatus, 'passed');
  assert(refreshed.activity.some(entry => entry.event === 'workflow_validated'));
  assert.equal((await db.collection(PIN_IMAGE_COLLECTION).doc(prepared.job.id).get()).data().ownerUID, a);
});

test('temporary image-store failures are logged, retried only within the attempt limit, and can be explicitly retried by the owner', async () => {
  const prepared = await preparePinterestJob(db, a, input({ title: 'Transient Image Store Retry Pin' }));
  let failOnce = true, now = Date.now();
  const transientDB = new Proxy(db, { get(target, key) {
    if (key === 'collection') return name => {
      const collection = target.collection(name);
      if (name !== PIN_IMAGE_COLLECTION) return collection;
      return { doc: id => {
        const ref = collection.doc(id);
        return new Proxy(ref, { get(inner, prop) {
          if (prop === 'get') return async () => { if (id === prepared.job.id && failOnce) { failOnce = false; throw new Error('synthetic temporary Firestore outage'); } return inner.get(); };
          const value = Reflect.get(inner, prop, inner); return typeof value === 'function' ? value.bind(inner) : value;
        } });
      } };
    };
    const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
  } });
  const first = await runPinterestValidationWorker(transientDB, { now: () => now, limit: 10 });
  assert(first.retried >= 1);
  let job = (await listPinterestJobs(db, a)).jobs.find(row => row.id === prepared.job.id);
  assert.equal(job.status, 'failed'); assert.equal(job.validationStatus, 'pending'); assert.equal(job.attempts, 1); assert.equal(job.canRetry, true);
  const retried = await retryPinterestValidation(db, a, prepared.job.id, { action: 'retry' }, { now: now + 1000 });
  assert.equal(retried.job.id, prepared.job.id); assert.equal(retried.job.attempts, 1);
  now += 1000;
  await runPinterestValidationWorker(db, { now: () => now, limit: 10 });
  job = (await listPinterestJobs(db, a)).jobs.find(row => row.id === prepared.job.id);
  assert.equal(job.status, 'pin_prepared'); assert.equal(job.validationStatus, 'passed'); assert.equal(job.attempts, 2);
});

test('temporary worker failures and explicit retries never regress a user-reported Published milestone', async () => {
  const isolated = new FakeDB(), saved = await makeReportedPinterestJob(isolated, 'Published Status Retry Integrity Pin');
  let failOnce = true, now = Date.now();
  const transientDB = new Proxy(isolated, { get(target, key) {
    if (key === 'collection') return name => {
      const collection = target.collection(name);
      if (name !== PIN_IMAGE_COLLECTION) return collection;
      return { doc: id => {
        const ref = collection.doc(id);
        return new Proxy(ref, { get(inner, prop) {
          if (prop === 'get') return async () => { if (id === saved.id && failOnce) { failOnce = false; throw new Error('synthetic temporary Firestore outage'); } return inner.get(); };
          const value = Reflect.get(inner, prop, inner); return typeof value === 'function' ? value.bind(inner) : value;
        } });
      } };
    };
    const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
  } });
  const first = await runPinterestValidationWorker(transientDB, { now: () => now, limit: 10 });
  assert.equal(first.retried, 1);
  let job = (await listPinterestJobs(isolated, a)).jobs.find(row => row.id === saved.id);
  assert.equal(job.status, 'published'); assert.equal(job.validationStatus, 'pending'); assert.equal(job.canRetry, true); assert.equal(job.reportedPinURL, saved.job.reportedPinURL);
  const retry = await retryPinterestValidation(isolated, a, saved.id, { action: 'retry' }, { now: now + 1000 });
  assert.equal(retry.job.status, 'published'); assert.equal(retry.job.reportedPinURL, saved.job.reportedPinURL);
  now += 1000;
  const second = await runPinterestValidationWorker(isolated, { now: () => now, limit: 10 });
  assert.equal(second.verified, 1);
  job = (await listPinterestJobs(isolated, a)).jobs.find(row => row.id === saved.id);
  assert.equal(job.status, 'published'); assert.equal(job.validationStatus, 'passed'); assert.equal(job.reportedPinURL, saved.job.reportedPinURL);
});

test('permanent integrity errors and an exhausted worker lease preserve reported publication and log failure', async () => {
  const isolated = new FakeDB(), saved = await makeReportedPinterestJob(isolated, 'Published Status Integrity Failure Pin');
  const imageRef = isolated.collection(PIN_IMAGE_COLLECTION).doc(saved.id), image = (await imageRef.get()).data();
  await imageRef.set({ ...image, sha256: '0'.repeat(64) });
  const failed = await runPinterestValidationWorker(isolated, { limit: 10 });
  assert.equal(failed.failed, 1);
  let job = (await listPinterestJobs(isolated, a)).jobs.find(row => row.id === saved.id);
  assert.equal(job.status, 'published'); assert.equal(job.validationStatus, 'failed'); assert.equal(job.canRetry, false); assert.equal(job.reportedPinURL, saved.job.reportedPinURL);
  await assert.rejects(() => retryPinterestValidation(isolated, a, saved.id, { action: 'retry' }), code('pin_retry_unavailable'));

  const capped = new FakeDB(), cappedJob = await makeReportedPinterestJob(capped, 'Published Status Exhausted Lease Pin');
  const ref = capped.collection(PIN_JOB_COLLECTION).doc(cappedJob.id), current = (await ref.get()).data(), now = Date.now();
  await ref.set({ ...current, validationStatus: 'processing', validationLease: randomUUID(), validationLeaseUntilUTC: new Date(now - 1000), attempts: 3 });
  const exhausted = await runPinterestValidationWorker(capped, { now: () => now, limit: 10 });
  assert.equal(exhausted.failed, 1); assert.equal(exhausted.processed, 1);
  job = (await listPinterestJobs(capped, a)).jobs.find(row => row.id === cappedJob.id);
  assert.equal(job.status, 'published'); assert.equal(job.validationStatus, 'failed'); assert.equal(job.reportedPinURL, cappedJob.job.reportedPinURL); assert.equal(job.error.retryable, false);
});

test('bounded retry preserves job ID and never resets its attempt count', async () => {
  const prepared = await preparePinterestJob(db, a, input()); const ref = db.collection(PIN_JOB_COLLECTION).doc(prepared.job.id);
  await ref.set({ ...(await ref.get()).data(), status: 'failed', validationStatus: 'failed', attempts: 1, error: { code: 'pin_validation_unavailable', message: 'Temporary validation problem.', retryable: true } });
  const retry = await retryPinterestValidation(db, a, prepared.job.id, { action: 'retry' });
  assert.equal(retry.job.id, prepared.job.id); assert.equal(retry.job.status, 'pin_prepared'); assert.equal(retry.job.attempts, 1); assert.equal(retry.job.validationStatus, 'pending');
  await ref.set({ ...(await ref.get()).data(), attempts: 3 });
  await assert.rejects(() => retryPinterestValidation(db, a, prepared.job.id, { action: 'retry' }), code('pin_retry_unavailable'));
});

test('settings are per-account, public Pin URLs are strict, and rate limits are per-user', async () => {
  await savePinterestSettings(db, a, { action: 'settings', defaultDestinationURL: 'https://example.com/new' });
  await savePinterestSettings(db, b, { action: 'settings', defaultDestinationURL: '' });
  assert.equal((await listPinterestJobs(db, a)).settings.defaultDestinationURL, 'https://example.com/new');
  assert.equal((await listPinterestJobs(db, b)).settings.defaultDestinationURL, '');
  assert.equal(reportedPinterestPinURL('https://www.pinterest.com/pin/1234567890/'), 'https://www.pinterest.com/pin/1234567890/');
  assert.throws(() => reportedPinterestPinURL('https://www.pinterest.com.evil.test/pin/1234567890/'), code('invalid_pinterest_pin_url'));
  const start = Date.now(); for (let i = 0; i < 6; i++) await consumePinterestRateLimit(db, a, 'prepare', { now: start });
  await assert.rejects(() => consumePinterestRateLimit(db, a, 'prepare', { now: start + 10 }), code('pin_rate_limited'));
  await consumePinterestRateLimit(db, b, 'prepare', { now: start + 10 });
  assert.equal(db.collection(PIN_RATE_COLLECTION) !== null, true);
});

test('OIDC validation pins the exact production commit/workflow/ref, rejects other claims and blocks replay', async () => {
  const original = { VERCEL_ENV: process.env.VERCEL_ENV, APP_URL: process.env.APP_URL, VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA };
  process.env.VERCEL_ENV = 'production'; process.env.APP_URL = 'https://pincraftly.vercel.app'; process.env.VERCEL_GIT_COMMIT_SHA = 'a'.repeat(40);
  try {
    const config = pinterestWorkloadConfig(), { privateKey, publicKey } = await generateKeyPair('RS256');
    const payload = { repository_id: '1456649831', repository: 'gmrony135/PinCraft', repository_visibility: 'public', ref: 'refs/heads/main', workflow_ref: config.workflow, sha: config.deploymentSHA, event_name: 'workflow_dispatch', run_id: '41234567890', run_attempt: '1', jti: randomUUID() };
    const make = claims => new SignJWT({ ...payload, ...claims }).setProtectedHeader({ alg: 'RS256' }).setIssuer('https://token.actions.githubusercontent.com').setAudience(config.audience).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    const token = await make({}); const identity = await verifyPinterestWorkload(`Bearer ${token}`, { config, resolveKey: publicKey });
    assert.equal(identity.executionId, 'github-pinterest-validation:41234567890:1');
    const wrongRepo = await make({ repository: 'attacker/PinCraft' });
    const wrongSHA = await make({ sha: 'b'.repeat(40) });
    const wrongWorkflow = await make({ workflow_ref: 'gmrony135/PinCraft/.github/workflows/pincraft-automation.yml@refs/heads/main' });
    await assert.rejects(() => verifyPinterestWorkload(`Bearer ${wrongRepo}`, { config, resolveKey: publicKey }), code('worker_unauthorized'));
    await assert.rejects(() => verifyPinterestWorkload(`Bearer ${wrongSHA}`, { config, resolveKey: publicKey }), code('worker_unauthorized'));
    await assert.rejects(() => verifyPinterestWorkload(`Bearer ${wrongWorkflow}`, { config, resolveKey: publicKey }), code('worker_unauthorized'));
    await claimPinterestDelivery(db, identity);
    await assert.rejects(() => claimPinterestDelivery(db, identity), code('worker_replayed'));
  } finally { for (const [key, value] of Object.entries(original)) value === undefined ? delete process.env[key] : process.env[key] = value; }
});

test('prepared jobs never store Pinterest authorization, browser session, cookie or account credentials', async () => {
  const prepared = await preparePinterestJob(db, a, input());
  const row = (await db.collection(PIN_JOB_COLLECTION).doc(prepared.job.id).get()).data();
  const image = (await db.collection(PIN_IMAGE_COLLECTION).doc(prepared.job.id).get()).data();
  const serialized = JSON.stringify({ row, image: { ...image, bytes: '[private image bytes]' } });
  for (const field of ['accessToken', 'refreshToken', 'cookie', 'sessionCookie', 'password', 'encrypted_tokens', 'board_id']) assert.equal(serialized.includes(field), false);
  assert.equal(row.ownerUID, a); assert.equal(image.ownerUID, a);
  assert.equal(createHash('sha256').update(image.bytes).digest('hex'), image.sha256);
});
