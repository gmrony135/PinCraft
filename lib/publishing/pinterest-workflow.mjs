import 'server-only';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';
import { AutomationError } from '../automation/errors.mjs';
import { httpsURL } from '../automation/http.mjs';
import { transaction } from '../automation/db.mjs';
import { ownerKey, data } from '../automation/firestore.mjs';
import { vaultReady } from '../automation/vault.mjs';

export const PIN_JOB_COLLECTION = 'pincraft_pinterest_publish_jobs';
export const PIN_IMAGE_COLLECTION = 'pincraft_pinterest_images';
export const PIN_SETTINGS_COLLECTION = 'pincraft_pinterest_settings';
export const PIN_RATE_COLLECTION = 'pincraft_pinterest_rate_limits';
export const PIN_DEDUPE_COLLECTION = 'pincraft_pinterest_dedupe';
export const PIN_MAX_IMAGE_BYTES = 650000;
export const PIN_MAX_SOURCE_BYTES = 680000;
export const PIN_MAX_ATTEMPTS = 3;
export const PIN_WORKER_LEASE_MS = 2 * 60 * 1000;
export const PIN_DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const PIN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const imageCollection = db => db.collection(PIN_IMAGE_COLLECTION);
const jobCollection = db => db.collection(PIN_JOB_COLLECTION);
const jobRef = (db, id) => {
  if (typeof id !== 'string' || !PIN_ID.test(id)) throw new AutomationError('invalid_pin_job', 'Select one of your saved Pin jobs.');
  return jobCollection(db).doc(id.toLowerCase());
};
const settingsRef = (db, uid) => db.collection(PIN_SETTINGS_COLLECTION).doc(ownerKey(uid));
const iso = value => {
  if (!value) return null;
  try { return (typeof value.toDate === 'function' ? value.toDate() : new Date(value)).toISOString(); } catch { return null; }
};
const plainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const invalid = (code, message, status = 400) => { throw new AutomationError(code, message, { status }); };

function normalizeText(value, { min, max, label, multiline = false }) {
  if (typeof value !== 'string') invalid('invalid_pin_content', `Enter a ${label} using ${min}–${max} characters.`);
  const text = value.trim();
  if (text.length < min || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text) || /<\/?[A-Za-z][^>]*>/.test(text) || (!multiline && /[\r\n]/.test(text))) {
    invalid('invalid_pin_content', `Enter a plain-text ${label} using ${min}–${max} characters, without HTML or control characters.`);
  }
  return text;
}

function destinationURL(value) {
  if (typeof value !== 'string' || value.trim().length > 2048) invalid('invalid_destination_url', 'Enter a public HTTPS destination URL no longer than 2,048 characters.');
  let url;
  try { url = httpsURL(value.trim()); } catch { invalid('invalid_destination_url', 'Use a public HTTPS destination URL without credentials, a fragment, private address or custom port.'); }
  return url.href;
}

function parseImageDataURL(value) {
  if (typeof value !== 'string' || value.length > 930000) invalid('invalid_pin_image', 'Choose a PNG, JPEG or WebP Pin image smaller than 680 KB.');
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) invalid('invalid_pin_image', 'Choose a PNG, JPEG or WebP Pin image. Animated images and unsupported formats are not accepted.');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length < 100 || bytes.length > PIN_MAX_SOURCE_BYTES || bytes.toString('base64') !== match[2]) invalid('invalid_pin_image', 'The selected image is empty, malformed or larger than the 680 KB processing limit.');
  return { bytes, declaredFormat: match[1] === 'jpeg' ? 'jpeg' : match[1] };
}

export async function normalizePinterestImage(dataURL) {
  const input = parseImageDataURL(dataURL);
  try {
    const source = sharp(input.bytes, { limitInputPixels: 16000000, animated: false, failOn: 'error' });
    const metadata = await source.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || metadata.format !== input.declaredFormat || !Number.isInteger(metadata.width) || !Number.isInteger(metadata.height) || metadata.width < 400 || metadata.height < 600 || metadata.width > 4096 || metadata.height > 4096 || metadata.width * metadata.height > 16000000 || (metadata.pages || 1) !== 1 || metadata.width / metadata.height < 0.4 || metadata.width / metadata.height > 1.0) {
      invalid('invalid_pin_image', 'Use one still, portrait image at least 400 × 600 pixels, no larger than 4,096 pixels per side.');
    }
    const render = quality => source.clone().rotate().resize(1000, 1500, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } }).webp({ quality, effort: 4 }).toBuffer();
    let bytes = await render(82);
    if (bytes.length > PIN_MAX_IMAGE_BYTES) bytes = await render(65);
    if (bytes.length < 100 || bytes.length > PIN_MAX_IMAGE_BYTES) invalid('pin_image_too_large', 'The normalized Pin image is still above 650 KB. Choose a simpler or smaller source image.');
    const output = await sharp(bytes, { limitInputPixels: 1600000, animated: false, failOn: 'error' }).metadata();
    if (output.format !== 'webp' || output.width !== 1000 || output.height !== 1500 || (output.pages || 1) !== 1 || output.exif || output.iptc || output.xmp) invalid('pin_image_invalid_output', 'The processed Pin image did not pass its format, dimension and metadata checks.', 422);
    return {
      bytes,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      mimeType: 'image/webp',
      width: 1000,
      height: 1500,
      byteSize: bytes.length,
      metadataStripped: true,
      sourceFormat: metadata.format,
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
    };
  } catch (error) {
    if (error instanceof AutomationError) throw error;
    throw new AutomationError('invalid_pin_image', 'The selected image could not be decoded safely. Choose a valid PNG, JPEG or WebP and try again.', { status: 422 });
  }
}

function validatePrepareInput(raw) {
  const allowed = ['action', 'requestId', 'title', 'description', 'destinationURL', 'imageDataUrl', 'consent', 'rememberDestination'];
  if (!plainObject(raw) || Object.keys(raw).some(key => !allowed.includes(key)) || raw.action !== 'prepare' || !PIN_ID.test(String(raw.requestId || '')) || raw.consent !== true || (raw.rememberDestination !== undefined && typeof raw.rememberDestination !== 'boolean')) {
    invalid('invalid_pin_request', 'Review the Pin details and confirm the image-storage notice before preparing a Pin.');
  }
  return {
    id: raw.requestId.toLowerCase(),
    title: normalizeText(raw.title, { min: 3, max: 100, label: 'Pin title' }),
    description: normalizeText(raw.description, { min: 10, max: 500, label: 'Pin description', multiline: true }),
    destinationURL: destinationURL(raw.destinationURL),
    imageDataUrl: raw.imageDataUrl,
    rememberDestination: raw.rememberDestination === true,
  };
}

function signingKey() {
  if (!vaultReady()) throw new AutomationError('pin_image_setup_required', 'Secure server-side image signing is not configured. No Pin job was created.', { status: 503 });
  return Buffer.from(process.env.AUTOMATION_ENCRYPTION_KEY || process.env.TOKEN_ENCRYPTION_KEY, 'base64');
}
function imageOrigin() {
  try {
    const url = httpsURL(process.env.APP_URL || '');
    if (url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}
export function pinterestImageSignature(id) {
  if (!PIN_ID.test(String(id || ''))) throw new AutomationError('invalid_pin_image', 'The Pin image was not found.', { status: 404 });
  return createHmac('sha256', signingKey()).update(`pincraft-pinterest-image:v1:${id.toLowerCase()}`).digest('base64url');
}
export function validPinterestImageSignature(id, signature) {
  try {
    if (!/^[A-Za-z0-9_-]{43}$/.test(signature || '')) return false;
    return timingSafeEqual(Buffer.from(signature), Buffer.from(pinterestImageSignature(id)));
  } catch { return false; }
}
function publicImageURL(id) {
  const origin = imageOrigin();
  if (!origin) throw new AutomationError('pin_image_origin_missing', 'Set APP_URL to the public HTTPS PinCraft origin before preparing a Pinterest Pin.', { status: 503 });
  return `${origin}/api/pinterest/publishing/image/${id}?sig=${pinterestImageSignature(id)}`;
}
function createURL(row) {
  const url = new URL('https://www.pinterest.com/pin/create/button/');
  url.searchParams.set('url', row.destinationURL);
  url.searchParams.set('media', publicImageURL(row.id));
  // Pinterest's official Save/Create interface supports these fields. The
  // title is deliberately not passed as an unsupported query parameter.
  url.searchParams.set('description', row.description);
  return url.href;
}
function ownerRequired(row, uid) {
  if (!row || typeof row.ownerUID !== 'string' || !row.ownerUID || row.ownerUID !== uid || typeof row.id !== 'string' || row.id !== row.id.toLowerCase()) throw new AutomationError('pin_job_not_found', 'This Pin publishing job was not found in your account.', { status: 404 });
  return row;
}
function activity(row, event, message, now) {
  return [...(Array.isArray(row.activity) ? row.activity : []), { event, message, atUTC: new Date(now) }].slice(-25);
}
function publicJob(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    destinationURL: row.destinationURL,
    imageURL: publicImageURL(row.id),
    pinterestCreateURL: createURL(row),
    image: {
      format: row.image?.mimeType || 'image/webp',
      width: row.image?.width || 1000,
      height: row.image?.height || 1500,
      byteSize: row.image?.byteSize || null,
      sourceFormat: row.image?.sourceFormat || null,
      sourceWidth: row.image?.sourceWidth || null,
      sourceHeight: row.image?.sourceHeight || null,
      metadataStripped: row.image?.metadataStripped === true,
    },
    status: row.status,
    validationStatus: row.validationStatus,
    validationAtUTC: iso(row.validationAtUTC),
    attempts: Number.isInteger(row.attempts) ? row.attempts : 0,
    maxAttempts: PIN_MAX_ATTEMPTS,
    canRetry: row.error?.retryable === true && ['pending', 'failed'].includes(row.validationStatus) && (row.attempts || 0) < PIN_MAX_ATTEMPTS,
    error: row.error || null,
    openedAtUTC: iso(row.openedAtUTC),
    userConfirmedAtUTC: iso(row.userConfirmedAtUTC),
    publishedAtUTC: iso(row.publishedAtUTC),
    reportedPinURL: row.reportedPinURL || null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    activity: (Array.isArray(row.activity) ? row.activity : []).map(item => ({ event: item.event, message: item.message, atUTC: iso(item.atUTC) })),
  };
}

function dedupeFingerprint(input, image) {
  return createHash('sha256').update(JSON.stringify({ title: input.title, description: input.description, destinationURL: input.destinationURL, imageSha256: image.sha256 })).digest('hex');
}
function dedupeKey(uid, fingerprint) {
  return createHash('sha256').update(`pincraft-pinterest-dedupe:v1:${uid}:${fingerprint}`).digest('hex');
}

export async function consumePinterestRateLimit(db, uid, action, { now = Date.now() } = {}) {
  ownerKey(uid);
  const policy = action === 'prepare' ? { limit: 6, window: 15 * 60 * 1000 } : action === 'settings' ? { limit: 10, window: 15 * 60 * 1000 } : { limit: 20, window: 60 * 1000 };
  const ref = db.collection(PIN_RATE_COLLECTION).doc(`${ownerKey(uid)}_${action}`);
  await transaction(db, async tx => {
    const snap = await tx.get(ref), row = data(snap), started = row?.windowStartedAt ? new Date(row.windowStartedAt).getTime() : 0;
    const windowStartedAt = started && now - started < policy.window ? started : now;
    const count = windowStartedAt === started ? Number(row?.count || 0) : 0;
    if (count >= policy.limit) throw new AutomationError('pin_rate_limited', 'You have made several Pin workflow changes recently. Wait a little and try again.', { status: 429 });
    tx.set(ref, { windowStartedAt: new Date(windowStartedAt), count: count + 1, updatedAt: new Date(now) });
  });
}

export async function preparePinterestJob(db, uid, raw, { now = Date.now() } = {}) {
  ownerKey(uid);
  const input = validatePrepareInput(raw);
  // Image decode/metadata work is bounded and happens only after the authenticated
  // route has charged this user against the prepare rate limit.
  const image = await normalizePinterestImage(input.imageDataUrl);
  const fingerprint = dedupeFingerprint(input, image), dedupeId = dedupeKey(uid, fingerprint), createdAt = new Date(now);
  const row = {
    id: input.id,
    ownerUID: uid,
    title: input.title,
    description: input.description,
    destinationURL: input.destinationURL,
    status: 'pin_prepared',
    validationStatus: 'pending',
    validationAtUTC: null,
    nextValidationAtUTC: createdAt,
    validationLease: null,
    validationLeaseUntilUTC: null,
    attempts: 0,
    error: null,
    image: {
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      byteSize: image.byteSize,
      sha256: image.sha256,
      metadataStripped: image.metadataStripped,
      sourceFormat: image.sourceFormat,
      sourceWidth: image.sourceWidth,
      sourceHeight: image.sourceHeight,
    },
    requestFingerprint: fingerprint,
    openedAtUTC: null,
    userConfirmedAtUTC: null,
    publishedAtUTC: null,
    reportedPinURL: null,
    activity: [{ event: 'pin_prepared', message: 'Pin image, copy and destination URL were validated and saved. Nothing was sent to Pinterest.', atUTC: createdAt }],
    createdAt,
    updatedAt: createdAt,
  };
  // Build URLs before committing, so missing server signing/origin configuration
  // fails without leaving a partially-created job or image record.
  publicImageURL(row.id);
  createURL(row);
  const job = jobRef(db, row.id), imageRef = imageCollection(db).doc(row.id), duplicateRef = db.collection(PIN_DEDUPE_COLLECTION).doc(dedupeId), settings = input.rememberDestination ? settingsRef(db, uid) : null;
  let result, duplicate = false;
  await transaction(db, async tx => {
    const [existingSnap, duplicateSnap, settingsSnap] = await Promise.all([tx.get(job), tx.get(duplicateRef), settings ? tx.get(settings) : Promise.resolve(null)]);
    const savedSettings = settingsSnap?.exists ? data(settingsSnap) : null;
    if (savedSettings && savedSettings.ownerUID !== uid) throw new AutomationError('pin_settings_conflict', 'Your private Pin settings could not be verified.', { status: 409 });
    const rememberDestination = () => {
      if (settings) tx.set(settings, { ownerUID: uid, defaultDestinationURL: input.destinationURL, createdAt: savedSettings?.createdAt || createdAt, updatedAt: createdAt });
    };
    if (existingSnap.exists) {
      const existing = data(existingSnap);
      ownerRequired(existing, uid);
      if (existing.requestFingerprint !== fingerprint) throw new AutomationError('pin_request_reused', 'This request ID already belongs to different Pin content. Refresh the form before submitting again.', { status: 409 });
      rememberDestination();
      duplicate = true; result = existing; return;
    }
    const duplicatePointer = duplicateSnap.exists ? data(duplicateSnap) : null;
    if (duplicatePointer?.ownerUID === uid && duplicatePointer.fingerprint === fingerprint && duplicatePointer.jobId) {
      const oldRef = jobRef(db, duplicatePointer.jobId), oldSnap = await tx.get(oldRef), previous = oldSnap.exists ? data(oldSnap) : null;
      if (previous && previous.ownerUID === uid && now - new Date(previous.createdAt).getTime() <= PIN_DUPLICATE_WINDOW_MS && previous.status !== 'failed') {
        rememberDestination();
        duplicate = true; result = previous; return;
      }
    }
    const imageRecord = {
      id: row.id,
      jobId: row.id,
      ownerUID: uid,
      bytes: image.bytes,
      sha256: image.sha256,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      byteSize: image.byteSize,
      metadataStripped: image.metadataStripped,
      createdAt,
    };
    tx.create(imageRef, imageRecord);
    tx.create(job, row);
    tx.set(duplicateRef, { ownerUID: uid, jobId: row.id, fingerprint, updatedAt: createdAt, expiresAt: new Date(now + PIN_DUPLICATE_WINDOW_MS) });
    rememberDestination();
    result = row;
  });
  return { job: publicJob(result), duplicate };
}

export async function listPinterestJobs(db, uid) {
  ownerKey(uid);
  const [jobsSnap, settingsSnap, heartbeatSnap] = await Promise.all([
    jobCollection(db).where('ownerUID', '==', uid).orderBy('createdAt', 'desc').limit(100).get(),
    settingsRef(db, uid).get(),
    db.doc('publisher_system/pinterest_manual_workflow').get(),
  ]);
  const savedSettings = settingsSnap.exists ? data(settingsSnap) : null;
  if (savedSettings && savedSettings.ownerUID !== uid) throw new AutomationError('pin_settings_conflict', 'Your private Pin settings could not be verified.', { status: 409 });
  return {
    accountId: uid,
    jobs: jobsSnap.docs.map(data).filter(row => row?.ownerUID === uid).map(publicJob),
    limit: 100,
    settings: { defaultDestinationURL: savedSettings?.defaultDestinationURL || '', updatedAt: iso(savedSettings?.updatedAt) },
    workflow: (() => { const row = data(heartbeatSnap); return { lastSeenAt: iso(row?.lastSeenAt), outcome: row?.outcome || null, processed: Number(row?.processed || 0), verified: Number(row?.verified || 0), failed: Number(row?.failed || 0) }; })(),
    serverTime: new Date().toISOString(),
  };
}

export async function savePinterestSettings(db, uid, raw, { now = Date.now() } = {}) {
  if (!plainObject(raw) || Object.keys(raw).some(key => key !== 'action' && key !== 'defaultDestinationURL') || raw.action !== 'settings') invalid('invalid_pin_settings', 'Only your private default destination URL can be saved.');
  const value = raw.defaultDestinationURL === '' ? '' : destinationURL(raw.defaultDestinationURL);
  const ref = settingsRef(db, uid);
  await transaction(db, async tx => {
    const snap = await tx.get(ref), previous = snap.exists ? data(snap) : null;
    if (previous && previous.ownerUID !== uid) throw new AutomationError('pin_settings_conflict', 'Your private Pin settings could not be verified.', { status: 409 });
    tx.set(ref, { ownerUID: uid, defaultDestinationURL: value, createdAt: previous?.createdAt || new Date(now), updatedAt: new Date(now) });
  });
  return { settings: { defaultDestinationURL: value, updatedAt: new Date(now).toISOString() } };
}

async function mutateOwnedJob(db, uid, id, task) {
  const ref = jobRef(db, id);
  let result;
  await transaction(db, async tx => {
    const saved = await tx.get(ref), row = ownerRequired(data(saved), uid);
    const next = await task(row);
    if (!next || next === row) { result = row; return; }
    tx.set(ref, next);
    result = next;
  });
  return { job: publicJob(result) };
}

export async function markPinterestOpened(db, uid, id, { now = Date.now() } = {}) {
  return mutateOwnedJob(db, uid, id, row => {
    if (row.status === 'failed') throw new AutomationError('pin_job_failed', 'This Pin job failed validation. Retry or prepare it again before opening Pinterest.', { status: 409 });
    if (['pinterest_opened', 'user_confirmed', 'published'].includes(row.status)) return row;
    if (row.status !== 'pin_prepared') throw new AutomationError('pin_job_transition', 'Prepare the Pin before opening Pinterest.', { status: 409 });
    return { ...row, status: 'pinterest_opened', openedAtUTC: new Date(now), updatedAt: new Date(now), activity: activity(row, 'pinterest_opened', 'Pinterest Create was opened by the user. This does not mean the Pin was saved.', now) };
  });
}

export async function confirmPinterestSaved(db, uid, id, raw, { now = Date.now() } = {}) {
  if (!plainObject(raw) || Object.keys(raw).some(key => key !== 'action' && key !== 'confirmedSaved') || raw.action !== 'confirm' || raw.confirmedSaved !== true) invalid('pin_confirmation_required', 'Confirm that you personally clicked Save in Pinterest after reviewing the board and Pin.');
  return mutateOwnedJob(db, uid, id, row => {
    if (['user_confirmed', 'published'].includes(row.status)) return row;
    if (row.status !== 'pinterest_opened') throw new AutomationError('pin_job_transition', 'Open the official Pinterest Create interface first. No Pin has been marked as saved.', { status: 409 });
    return { ...row, status: 'user_confirmed', userConfirmedAtUTC: new Date(now), updatedAt: new Date(now), activity: activity(row, 'user_confirmed', 'The owner reported clicking Save in Pinterest. PinCraft has not independently verified publication.', now) };
  });
}

export function reportedPinterestPinURL(value) {
  let url;
  try { url = httpsURL(value); } catch { invalid('invalid_pinterest_pin_url', 'Enter the actual public Pinterest Pin URL, such as https://www.pinterest.com/pin/123456789012345/.'); }
  const match = /^\/pin\/(\d{5,40})\/?$/.exec(url.pathname);
  if (!['www.pinterest.com', 'pinterest.com'].includes(url.hostname) || !match || url.search || url.hash) invalid('invalid_pinterest_pin_url', 'Enter a public https://www.pinterest.com/pin/…/ URL without extra query parameters.');
  return `https://www.pinterest.com/pin/${match[1]}/`;
}

export async function markPinterestPublished(db, uid, id, raw, { now = Date.now() } = {}) {
  if (!plainObject(raw) || Object.keys(raw).some(key => !['action', 'pinURL', 'confirmedPublic'].includes(key)) || raw.action !== 'published' || raw.confirmedPublic !== true) invalid('pin_publication_confirmation_required', 'Confirm that you saved the Pin and checked its Pinterest URL before recording it as Published.');
  const pinURL = reportedPinterestPinURL(raw.pinURL);
  return mutateOwnedJob(db, uid, id, row => {
    if (row.status === 'published') {
      if (row.reportedPinURL !== pinURL) throw new AutomationError('pin_already_reported', 'This job already has a different user-reported Pinterest URL.', { status: 409 });
      return row;
    }
    if (row.status !== 'user_confirmed') throw new AutomationError('pin_job_transition', 'Confirm your manual Save step before recording a Pin as Published.', { status: 409 });
    return { ...row, status: 'published', reportedPinURL: pinURL, publishedAtUTC: new Date(now), updatedAt: new Date(now), activity: activity(row, 'published', 'Marked Published from the owner’s checked Pin URL; this is user-reported and not Pinterest API-verified.', now) };
  });
}

export async function retryPinterestValidation(db, uid, id, raw, { now = Date.now() } = {}) {
  if (!plainObject(raw) || Object.keys(raw).some(key => key !== 'action') || raw.action !== 'retry') invalid('invalid_pin_retry', 'Retry only the saved Pin validation job.');
  return mutateOwnedJob(db, uid, id, row => {
    const retryable = row.error?.retryable === true && ['pending', 'failed'].includes(row.validationStatus) && row.attempts < PIN_MAX_ATTEMPTS;
    if (!retryable || !['failed', 'pin_prepared', 'pinterest_opened', 'user_confirmed', 'published'].includes(row.status)) throw new AutomationError('pin_retry_unavailable', 'This Pin job has no safe validation retry remaining. Create a new reviewed job if its image needs changes.', { status: 409 });
    const status = row.status === 'failed' ? 'pin_prepared' : row.status;
    return { ...row, status, validationStatus: 'pending', nextValidationAtUTC: new Date(now), validationLease: null, validationLeaseUntilUTC: null, error: null, updatedAt: new Date(now), activity: activity(row, 'validation_retry', 'A bounded integrity-validation retry was requested. It does not send or publish anything to Pinterest.', now) };
  });
}

function storedImageError() {
  return new AutomationError('pin_image_integrity_failed', 'The saved Pin image did not pass its integrity, format, dimension or metadata check.', { status: 422 });
}
async function verifyStoredImage(db, row) {
  const snap = await imageCollection(db).doc(row.id).get(), saved = snap.exists ? snap.data() : null;
  if (!saved || saved.ownerUID !== row.ownerUID || saved.jobId !== row.id || saved.mimeType !== 'image/webp' || saved.width !== 1000 || saved.height !== 1500 || saved.metadataStripped !== true || !Buffer.isBuffer(saved.bytes) || saved.bytes.length < 100 || saved.bytes.length > PIN_MAX_IMAGE_BYTES || saved.byteSize !== saved.bytes.length || saved.sha256 !== row.image?.sha256 || createHash('sha256').update(saved.bytes).digest('hex') !== saved.sha256) throw storedImageError();
  let metadata;
  try { metadata = await sharp(saved.bytes, { limitInputPixels: 1600000, animated: false, failOn: 'error' }).metadata(); }
  catch { throw storedImageError(); }
  if (metadata.format !== 'webp' || metadata.width !== 1000 || metadata.height !== 1500 || (metadata.pages || 1) !== 1 || metadata.exif || metadata.iptc || metadata.xmp) throw storedImageError();
  normalizeText(row.title, { min: 3, max: 100, label: 'Pin title' });
  normalizeText(row.description, { min: 10, max: 500, label: 'Pin description', multiline: true });
  destinationURL(row.destinationURL);
  return true;
}

async function claimValidation(db, candidate, now) {
  const ref = jobRef(db, candidate.id), lease = randomUUID();
  let claimed = null, attemptLimitReached = false;
  await transaction(db, async tx => {
    const snap = await tx.get(ref), row = ownerRequired(data(snap), candidate.ownerUID);
    const pending = row.validationStatus === 'pending' && new Date(row.nextValidationAtUTC || 0).getTime() <= now;
    const abandoned = row.validationStatus === 'processing' && new Date(row.validationLeaseUntilUTC || 0).getTime() <= now;
    if ((row.status === 'failed' && row.validationStatus === 'failed') || (!pending && !abandoned)) return;
    if (row.attempts >= PIN_MAX_ATTEMPTS) {
      const status = ['pin_prepared', 'failed'].includes(row.status) ? 'failed' : row.status;
      const failed = { ...row, status, validationStatus: 'failed', validationLease: null, validationLeaseUntilUTC: null, error: { code: 'pin_validation_attempt_limit', message: 'Three validation attempts were used. This worker did not open or publish a Pin.', retryable: false }, updatedAt: new Date(now), activity: activity(row, 'validation_failed', 'The bounded validation retry limit was reached. The worker did not send a request to Pinterest.', now) };
      tx.set(ref, failed); attemptLimitReached = true; return;
    }
    claimed = { ...row, validationStatus: 'processing', validationLease: lease, validationLeaseUntilUTC: new Date(now + PIN_WORKER_LEASE_MS), attempts: row.attempts + 1, updatedAt: new Date(now) };
    tx.set(ref, claimed);
  });
  return attemptLimitReached ? { attemptLimitReached: true } : claimed;
}

async function finishValidation(db, job, result, now) {
  const ref = jobRef(db, job.id);
  await transaction(db, async tx => {
    const snap = await tx.get(ref), current = ownerRequired(data(snap), job.ownerUID);
    if (current.validationStatus !== 'processing' || current.validationLease !== job.validationLease) return;
    const passed = result.ok;
    const retryable = !passed && result.retryable === true && current.attempts < PIN_MAX_ATTEMPTS;
    const next = {
      ...current,
      validationStatus: passed ? 'passed' : retryable ? 'pending' : 'failed',
      validationAtUTC: passed ? new Date(now) : current.validationAtUTC || null,
      nextValidationAtUTC: retryable ? new Date(now + 60000 * Math.max(1, current.attempts)) : current.nextValidationAtUTC,
      status: passed ? (current.status === 'failed' ? 'pin_prepared' : current.status) : ['pin_prepared', 'failed'].includes(current.status) ? 'failed' : current.status,
      validationLease: null,
      validationLeaseUntilUTC: null,
      error: passed ? null : { code: result.code || 'pin_validation_failed', message: result.message || 'The saved Pin failed validation. No request was sent to Pinterest.', retryable },
      updatedAt: new Date(now),
      activity: activity(current, passed ? 'workflow_validated' : retryable ? 'validation_retry_scheduled' : 'validation_failed', passed ? 'The GitHub Actions Node.js worker re-validated the private image bytes, checksum, dimensions and metadata. No Pinterest action was performed.' : retryable ? 'A temporary validation problem was recorded; a bounded retry is scheduled. No Pinterest action was performed.' : 'The saved Pin failed validation. No Pinterest action was performed.', now),
    };
    tx.set(ref, next);
  });
}

async function validationCandidates(db, now, limit) {
  const [pending, processing] = await Promise.all([
    jobCollection(db).where('validationStatus', '==', 'pending').orderBy('nextValidationAtUTC', 'asc').limit(limit).get(),
    jobCollection(db).where('validationStatus', '==', 'processing').orderBy('validationLeaseUntilUTC', 'asc').limit(limit).get(),
  ]);
  const rows = [
    ...pending.docs.map(data).filter(row => new Date(row.nextValidationAtUTC || 0).getTime() <= now),
    ...processing.docs.map(data).filter(row => new Date(row.validationLeaseUntilUTC || 0).getTime() <= now),
  ];
  return [...new Map(rows.map(row => [row.id, row])).values()].slice(0, limit);
}

export async function runPinterestValidationWorker(db, { now = () => Date.now(), limit = 10, deadlineMs = 45000 } = {}) {
  const started = Date.now(), candidates = await validationCandidates(db, now(), Math.max(1, Math.min(10, limit)));
  let processed = 0, verified = 0, failed = 0, retried = 0;
  for (const candidate of candidates) {
    if (Date.now() - started >= deadlineMs) break;
    const claimed = await claimValidation(db, candidate, now());
    if (!claimed) continue;
    if (claimed.attemptLimitReached) { processed++; failed++; continue; }
    processed++;
    try {
      await verifyStoredImage(db, claimed);
      await finishValidation(db, claimed, { ok: true }, now());
      verified++;
    } catch (error) {
      const permanent = error instanceof AutomationError && ['pin_image_integrity_failed', 'invalid_pin_content', 'invalid_destination_url'].includes(error.code);
      const canRetry = !permanent && claimed.attempts < PIN_MAX_ATTEMPTS;
      await finishValidation(db, claimed, {
        ok: false,
        retryable: canRetry,
        code: permanent ? error.code : 'pin_validation_unavailable',
        message: permanent ? error.message : 'The stored Pin could not be re-checked temporarily. A bounded retry may follow; no Pinterest request was made.',
      }, now());
      if (canRetry) retried++; else failed++;
    }
  }
  const heartbeat = { lastSeenAt: new Date(now()), outcome: failed ? 'needs_attention' : retried ? 'retry_scheduled' : 'ok', dueCandidates: candidates.length, processed, verified, failed, retried };
  await db.doc('publisher_system/pinterest_manual_workflow').set(heartbeat);
  return { ...heartbeat, lastSeenAt: heartbeat.lastSeenAt.toISOString() };
}

export async function readPinterestImage(db, id) {
  if (!PIN_ID.test(String(id || ''))) return null;
  const snap = await imageCollection(db).doc(id.toLowerCase()).get(), row = snap.exists ? snap.data() : null;
  if (!row || row.id !== id.toLowerCase() || row.jobId !== id.toLowerCase() || !Buffer.isBuffer(row.bytes) || row.bytes.length < 100 || row.bytes.length > PIN_MAX_IMAGE_BYTES || row.mimeType !== 'image/webp' || row.width !== 1000 || row.height !== 1500 || row.byteSize !== row.bytes.length || row.metadataStripped !== true || createHash('sha256').update(row.bytes).digest('hex') !== row.sha256) return null;
  return { bytes: row.bytes, byteSize: row.byteSize, sha256: row.sha256 };
}

export function publicPinterestError(error) {
  if (error instanceof AutomationError) return error;
  return new AutomationError('pin_workflow_unavailable', 'The Pinterest workflow could not save this change. Your saved job was not reported as published.', { status: 503 });
}
