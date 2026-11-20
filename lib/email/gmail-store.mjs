// Encrypted storage for the Dream Boost Gmail grant. The refresh token is sealed with the same AES-256-GCM
// vault PinCraft uses for other connections. It is never stored in plain text and never printed.
import { decryptCredentials, encryptCredentials } from '../automation/vault.mjs';
import { SENDER_EMAIL } from './config.mjs';

export const GRANT_PATH = ['email_system', 'gmail'];
const AAD_OWNER = 'email-system:gmail';

export async function saveGmailGrant(db, { account, refreshToken, now = Date.now() }) {
  if (account !== SENDER_EMAIL) throw new Error('grant_account_mismatch');
  await db.collection(GRANT_PATH[0]).doc(GRANT_PATH[1]).set({
    account,
    sealed: encryptCredentials(AAD_OWNER, { refresh_token: refreshToken }),
    connectedAt: new Date(now),
    scope: 'https://www.googleapis.com/auth/gmail.send',
  });
}

// Returns the refresh token only when the stored grant is for the Dream Boost account. Otherwise null.
export async function loadGmailRefreshToken(db) {
  const snap = await db.collection(GRANT_PATH[0]).doc(GRANT_PATH[1]).get();
  if (!snap.exists) return null;
  const row = snap.data();
  if (row.account !== SENDER_EMAIL || typeof row.sealed !== 'string') return null;
  const value = decryptCredentials(AAD_OWNER, row.sealed);
  return typeof value?.refresh_token === 'string' && value.refresh_token ? value.refresh_token : null;
}
