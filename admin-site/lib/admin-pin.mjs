// Admin login check: Gmail must be the owner address AND the 4-digit PIN must match the bcrypt hash
// in the ADMIN_PIN_HASH environment variable. Nothing here contains a PIN value.
// Every failure returns false, so the caller can show one generic refusal and never say which part was wrong.
import bcrypt from 'bcryptjs';
import { OWNER_EMAIL } from './config.mjs';

const PIN_PATTERN = /^[0-9]{4}$/;
// bcrypt hash format: $2a$, $2b$ or $2y$, two-digit cost, then 53 characters.
const HASH_PATTERN = /^\$2[aby]\$(0[4-9]|1[0-9]|2[0-9]|3[01])\$[./A-Za-z0-9]{53}$/;

export function adminPinHash(env = process.env) {
  const value = String(env.ADMIN_PIN_HASH || '').trim();
  return HASH_PATTERN.test(value) ? value : '';
}

// Returns true only when the email is the owner address and the PIN matches. Always runs one bcrypt compare,
// so a wrong email does not return faster than a wrong PIN.
export async function checkAdminLogin({ email, pin }, env = process.env) {
  const emailOk = typeof email === 'string' && email.trim().toLowerCase() === OWNER_EMAIL;
  const pinText = typeof pin === 'string' ? pin.trim() : '';
  const hash = adminPinHash(env);
  if (!hash) return false; // not configured: fail closed
  const candidate = PIN_PATTERN.test(pinText) ? pinText : '0000';
  let pinOk = false;
  try { pinOk = await bcrypt.compare(candidate, hash); } catch { pinOk = false; }
  return emailOk && PIN_PATTERN.test(pinText) && pinOk;
}
