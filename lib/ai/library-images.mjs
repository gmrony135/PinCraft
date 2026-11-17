import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { AutomationError } from '../automation/errors.mjs';
import { ownerKey } from '../automation/firestore.mjs';
import { validJobId } from '../automation/images.mjs';

export const LIBRARY_IMAGE_MAX_BYTES = 650000;
const images = db => db.collection('pincraft_library_images');
export const validLibraryImageId = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function libraryImageId(uid, requestKey) {
  ownerKey(uid);
  if (!validJobId(requestKey)) throw new AutomationError('invalid_ai_request', 'A valid private image request is required.');
  return createHash('sha256').update(`pincraft-library-image:v1:${uid}:${requestKey}`).digest('hex');
}

function unpack(dataUrl) {
  const match = /^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUrl || ''));
  if (!match) throw new AutomationError('invalid_ai_image', 'The generated artwork was not a valid WebP image.', { status: 502 });
  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.length < 100 || bytes.length > LIBRARY_IMAGE_MAX_BYTES || bytes.toString('base64') !== match[1]) {
    throw new AutomationError('invalid_ai_image', 'The generated artwork exceeds the safe private Library image size.', { status: 502 });
  }
  return bytes;
}

function expectedSize(useCase) {
  if (useCase === 'pin') return { width: 1000, height: 1500 };
  if (useCase === 'featured') return { width: 1200, height: 630 };
  return null;
}

export async function storeLibraryImage(db, uid, { requestKey, fingerprint, useCase, generated }) {
  const size = expectedSize(useCase), bytes = unpack(generated?.data?.dataUrl);
  if (!size || generated?.data?.mimeType !== 'image/webp' || generated?.data?.width !== size.width || generated?.data?.height !== size.height || !/^[a-f0-9]{64}$/.test(fingerprint || '')) {
    throw new AutomationError('invalid_ai_image', 'The generated artwork did not meet the verified private-image contract.', { status: 502 });
  }
  let metadata;
  try { metadata = await sharp(bytes, { limitInputPixels: 2000000, animated: false }).metadata(); }
  catch { throw new AutomationError('invalid_ai_image', 'The generated artwork could not be verified as a safe image.', { status: 502 }); }
  if (metadata.format !== 'webp' || metadata.width !== size.width || metadata.height !== size.height || (metadata.pages || 1) !== 1) {
    throw new AutomationError('invalid_ai_image', 'The generated artwork dimensions or image format were invalid.', { status: 502 });
  }

  const id = libraryImageId(uid, requestKey), ref = images(db).doc(id), saved = await ref.get();
  const previous = saved.exists ? saved.data() : null;
  if (previous) {
    const existing = await readLibraryImage(db, id, { uid });
    if (previous.ownerUID !== uid || previous.requestKey !== requestKey || previous.fingerprint !== fingerprint || previous.useCase !== useCase || !existing) {
      throw new AutomationError('library_image_conflict', 'The saved private image identity or bytes changed.', { status: 409 });
    }
    return { assetId: id, width: previous.width, height: previous.height, mimeType: previous.mimeType, useCase, storage: 'firestore' };
  }

  const record = {
    ownerUID: uid, requestKey, fingerprint, useCase, mimeType: 'image/webp',
    width: size.width, height: size.height, bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'), createdAt: new Date(),
  };
  try { await ref.create(record); }
  catch (error) {
    if (error.code !== 6 && error.code !== 'already-exists') {
      throw new AutomationError('library_image_storage_unavailable', 'The generated artwork could not be saved to private durable storage. It was not published.', { status: 503, retryable: true });
    }
    const raced = (await ref.get()).data();
    const existing = await readLibraryImage(db, id, { uid });
    if (raced?.ownerUID !== uid || raced?.fingerprint !== fingerprint || raced?.useCase !== useCase || !existing) {
      throw new AutomationError('library_image_conflict', 'The saved private image identity changed.', { status: 409 });
    }
  }
  return { assetId: id, width: size.width, height: size.height, mimeType: 'image/webp', useCase, storage: 'firestore' };
}

export async function readLibraryImage(db, id, { uid = null } = {}) {
  if (!validLibraryImageId(id)) return null;
  const snapshot = await images(db).doc(id).get(), row = snapshot.exists ? snapshot.data() : null;
  if (!row || (uid && row.ownerUID !== uid) || !['pin', 'featured'].includes(row.useCase) || row.mimeType !== 'image/webp') return null;
  const size = expectedSize(row.useCase);
  if (!size || row.width !== size.width || row.height !== size.height) return null;
  const bytes = Buffer.isBuffer(row.bytes) ? row.bytes : row.bytes instanceof Uint8Array ? Buffer.from(row.bytes) : null;
  if (!bytes || bytes.length < 100 || bytes.length > LIBRARY_IMAGE_MAX_BYTES || createHash('sha256').update(bytes).digest('hex') !== row.sha256) return null;
  return { bytes, width: row.width, height: row.height, mimeType: row.mimeType, useCase: row.useCase, ownerUID: row.ownerUID };
}
