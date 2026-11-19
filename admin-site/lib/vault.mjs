// Decrypts the payment reference envelopes written by PinCraft (lib/automation/vault.mjs).
// Same algorithm, key and additional-data label as PinCraft. Read-only: this site never encrypts.
import { createDecipheriv } from 'node:crypto';

export function vaultKey() {
  const raw = process.env.AUTOMATION_ENCRYPTION_KEY || '';
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('Payment vault key is not configured.');
  return key;
}

export function decryptPaymentReference(userId, envelope) {
  const [version, iv, tag, data, extra] = String(envelope).split(':');
  if (version !== 'v1' || extra || !iv || !tag || !data) throw new Error('Unreadable payment reference.');
  const decipher = createDecipheriv('aes-256-gcm', vaultKey(), Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(`pincraft-auto:v1:${userId}`));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8'));
}
