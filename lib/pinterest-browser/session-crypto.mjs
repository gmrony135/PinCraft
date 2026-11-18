// Encrypts the saved Pinterest browser session (cookies and storage state) at rest.
// The password is never an input here. Key: PINTEREST_SESSION_KEY, 32 random bytes, base64.
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
const AAD = Buffer.from('pincraft-pinterest-session:v1');
function key(raw) {
  const buffer = Buffer.from(String(raw || ''), 'base64');
  if (buffer.length !== 32) throw new Error('PINTEREST_SESSION_KEY must be 32 random bytes, base64-encoded.');
  return buffer;
}
export function encryptSession(state, rawKey) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(rawKey), iv);
  cipher.setAAD(AAD);
  const data = Buffer.concat([cipher.update(JSON.stringify(state), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}
export function decryptSession(envelope, rawKey) {
  const [version, iv, tag, data, extra] = String(envelope).split(':');
  if (version !== 'v1' || extra || !iv || !tag || !data) throw new Error('Saved Pinterest session is malformed.');
  const decipher = createDecipheriv('aes-256-gcm', key(rawKey), Buffer.from(iv, 'base64'));
  decipher.setAAD(AAD); decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8'));
}
