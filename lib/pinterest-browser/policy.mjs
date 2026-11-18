// Browser-automation account guard and pacing. Pure: no network, no secrets.
export const PINTEREST_ACCOUNT = Object.freeze({
  handle: 'SlimGlowLifex',
  profileURL: 'https://www.pinterest.com/SlimGlowLifex/',
});
export const PINTEREST_MAX_PINS_PER_DAY = 6;
// Accounts this system must never post to, under any configuration.
export const PINTEREST_BLOCKED_HANDLES = Object.freeze(['smallapartmentnestx', 'vibespark']);

const normalize = value => String(value ?? '').trim().replace(/^@/, '').toLowerCase();

export function assertAllowedHandle(handle) {
  const value = normalize(handle);
  if (PINTEREST_BLOCKED_HANDLES.includes(value)) throw new Error(`Posting to @${value} is blocked by policy.`);
  if (value !== normalize(PINTEREST_ACCOUNT.handle)) throw new Error('Only the SlimGlow Life Pinterest account can be used.');
  return PINTEREST_ACCOUNT.handle;
}

// Every profile page we act on must be on pinterest.com and belong to the allowed handle.
export function assertAllowedProfileURL(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('Profile URL is not valid.'); }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:' || (host !== 'pinterest.com' && host !== 'www.pinterest.com')) {
    throw new Error('Profile URL must be an https pinterest.com address.');
  }
  const first = parsed.pathname.split('/').filter(Boolean)[0] || '';
  assertAllowedHandle(first);
  return parsed.toString();
}

// True while today's count is below the daily ceiling.
export function canPublishAnotherPin(postedToday) {
  return Number.isInteger(postedToday) && postedToday >= 0 && postedToday < PINTEREST_MAX_PINS_PER_DAY;
}
