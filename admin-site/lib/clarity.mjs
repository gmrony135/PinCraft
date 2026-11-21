// Pure display logic for the admin panel. No Firebase imports, no key values, no account IDs.
// Every number comes from the metrics payload (or the billing payload already read on the same refresh).
import { KEY_STATUS_LABEL } from './key-slots.mjs';

export const USAGE_WARN_RATIO = 0.8; // amber from 80% of a daily limit; red at 100%
export const ALL_CLEAR = 'All clear — no key at limit, no pending payment.';

// Integer maths so 80% of 20 is exactly 16 and 80% of 150 is exactly 120.
export function usageLevel(value, limit) {
  const v = Number(value) || 0, l = Number(limit) || 0;
  if (l <= 0) return 'ok';
  if (v >= l) return 'limit';
  if (v * 5 >= l * 4) return 'warn';
  return 'ok';
}

export function usageBarPercent(value, limit) {
  const v = Number(value) || 0, l = Number(limit) || 0;
  if (l <= 0) return 0;
  return Math.min(100, Math.round((v / l) * 100));
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Attention strip: at most one line per problem type. Ordered by urgency.
// Each item has a jump target (section id) so the owner can go straight to it.
export function attentionItems({ data, billing = null, billingError = '' }) {
  const items = [];
  if (!data) return items;

  const atLimitSlots = [];
  for (const provider of data.keySlots?.providers || []) {
    for (const slot of provider.slots) if (slot.status === 'LIMIT_FINISHED') atLimitSlots.push(`${provider.name} slot ${slot.slot}`);
  }
  if (atLimitSlots.length) {
    items.push({ id: 'keys', tone: 'bad', target: 'keys', text: `${plural(atLimitSlots.length, 'AI key slot', 'AI key slots')} at limit today: ${atLimitSlots.join(', ')}` });
  }

  if (billing && billing.counts) {
    const pending = Number(billing.counts.pending) || 0;
    if (pending > 0) items.push({ id: 'payments', tone: 'warn', target: 'payments', text: `${plural(pending, 'payment', 'payments')} waiting for your review` });
  } else if (billingError) {
    items.push({ id: 'payments-unread', tone: 'warn', target: 'payments', text: 'Payment reviews could not be read just now. They refresh automatically.' });
  }

  const usage = Array.isArray(data.usage) ? data.usage : [];
  const limits = data.limits || {};
  const dims = [['pinPacks', limits.pinPacks], ['text', limits.text], ['image', limits.image]];
  let nearUsers = 0, atLimitUsers = 0;
  for (const user of usage) {
    const levels = dims.map(([key, limit]) => usageLevel(user.usageToday?.[key], limit));
    if (levels.includes('limit')) atLimitUsers += 1;
    if (levels.includes('limit') || levels.includes('warn')) nearUsers += 1;
  }
  if (nearUsers > 0) {
    items.push({ id: 'users-near-limit', tone: atLimitUsers > 0 ? 'bad' : 'warn', target: 'usage', text: `${plural(nearUsers, 'user is', 'users are')} at 80% or more of a daily limit today (${atLimitUsers} at the limit)` });
  }

  const failed = Number(data.jobs?.byState?.failed) || 0, skipped = Number(data.jobs?.byState?.skipped) || 0;
  if (failed + skipped > 0) {
    items.push({ id: 'jobs', tone: 'warn', target: 'activity', text: `Automation jobs: ${failed} failed, ${skipped} skipped (all time)` });
  }
  return items;
}

// Per-key summary. Statuses are exclusive (LIMIT FINISHED > USED > NOT SET > UNUSED), matching key-slots.mjs.
export function keyCounts(providers = []) {
  const counts = { total: 0, inUse: 0, atLimit: 0, notSet: 0, unused: 0 };
  for (const provider of providers) for (const slot of provider.slots) {
    counts.total += 1;
    if (slot.status === 'LIMIT_FINISHED') counts.atLimit += 1;
    else if (slot.status === 'USED') counts.inUse += 1;
    else if (slot.status === 'NOT_SET') counts.notSet += 1;
    else counts.unused += 1;
  }
  return counts;
}

export const KEY_FILTERS = Object.freeze([
  { id: 'all', label: 'All' },
  { id: 'in_use', label: 'In use' },
  { id: 'at_limit', label: 'At limit' },
  { id: 'not_set', label: 'Not set' },
]);

const FILTER_STATUS = { in_use: 'USED', at_limit: 'LIMIT_FINISHED', not_set: 'NOT_SET' };

// Flat rows for the table. Slot numbers and status only: never a key value, token or account ID.
export function keyRows(providers = [], filter = 'all') {
  const rows = [];
  for (const provider of providers) for (const slot of provider.slots) {
    if (filter !== 'all' && slot.status !== FILTER_STATUS[filter]) continue;
    rows.push({ provider: provider.name, slot: slot.slot, status: slot.status, label: KEY_STATUS_LABEL[slot.status] || slot.status, calls: slot.calls, limitHits: slot.limitHits, lastLimitedAt: slot.lastLimitedAt });
  }
  return rows;
}

// Limit hits today per provider, summed from the per-slot counters already recorded.
export function providerLimitHits(providers = []) {
  const out = {};
  for (const provider of providers) out[provider.id] = provider.slots.reduce((sum, slot) => sum + (Number(slot.limitHits) || 0), 0);
  return out;
}

// Search on the user tables: case-insensitive match on name or email. Empty query matches everyone.
export function matchesQuery(user, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return String(user.name || '').toLowerCase().includes(q) || String(user.email || '').toLowerCase().includes(q);
}
