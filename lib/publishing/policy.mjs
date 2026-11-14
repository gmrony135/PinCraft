// Shared policy for both the legacy publisher and the reviewed-content Worker.
// No platform imports, credentials or client-specific state belong here.
export const PIN_LIMIT = 6;
export const WINDOW_MS = 24 * 60 * 60 * 1000;
export const milliseconds = value => value instanceof Date ? value.getTime() : typeof value?.toMillis === 'function' ? value.toMillis() : typeof value?.toDate === 'function' ? value.toDate().getTime() : new Date(value || 0).getTime();
const iso = value => value && Number.isFinite(milliseconds(value)) ? new Date(milliseconds(value)).toISOString() : null;
export function subscriptionState(row, now = Date.now()) {
  const active = Boolean(row?.status === 'active' && milliseconds(row.expires_at) > now && row.limits?.pinterest > 1 && row.limits?.websites > 1 && row.approved_payment_id);
  return { tier: active ? 'paid' : 'free', status: active ? 'active' : row?.status === 'active' ? 'expired' : 'free', limits: active ? { pinterest: row.limits.pinterest, websites: row.limits.websites } : { pinterest: 1, websites: 1 }, expiresAt: iso(row?.expires_at), activatedAt: iso(row?.activated_at) };
}
const issue = (code, message, details = {}) => Object.assign(new Error(message), { code, ...details });
export function quotaEntries(row, now = Date.now()) {
  if (row?.entries !== undefined && !Array.isArray(row.entries)) throw issue('pin_limit_unavailable', 'The Pinterest safety ledger needs inspection. Publishing is paused rather than bypassing its limit.', { status: 503 });
  return (row?.entries || []).filter(entry => {
    if (!entry || typeof entry.jobId !== 'string' || !Number.isFinite(milliseconds(entry.at)) || !['reserved', 'confirmed'].includes(entry.status)) throw issue('pin_limit_unavailable', 'The Pinterest safety ledger needs inspection. No Pin was sent.', { status: 503 });
    return entry.status === 'reserved' || milliseconds(entry.at) > now - WINDOW_MS;
  });
}
export function reserveQuota(row, jobId, now = Date.now()) {
  const entries = quotaEntries(row, now);
  if (entries.some(entry => entry.jobId === jobId)) return null;
  if (entries.length >= PIN_LIMIT) {
    const times = entries.filter(entry => entry.status === 'confirmed').map(entry => milliseconds(entry.at) + WINDOW_MS + 1000);
    throw issue('pinterest_daily_limit', 'This Pinterest account has reached its six-Pin safety limit. Confirmed Pins and unresolved publishing attempts share the same limit across boards, users and subscriptions. Due work will wait for a safe slot.', { status: 429, retryable: true, resumeAt: new Date(times.length ? Math.min(...times) : now + 30 * 60000) });
  }
  return { entries: [...entries, { jobId, at: new Date(now), status: 'reserved' }], updated_at: new Date(now) };
}
export function finishQuota(row, jobId, { release = false, now = Date.now() } = {}) {
  const entries = quotaEntries(row, now).filter(entry => entry.jobId !== jobId);
  if (!release) entries.push({ jobId, at: new Date(now), status: 'confirmed' });
  return { entries, updated_at: new Date(now) };
}
