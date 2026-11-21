// Per-key status for the owner's admin view. Pure data only: slot numbers, counts and times.
// No key, token or account-id value exists in this data and none is ever displayed.
export const KEY_PROVIDERS = Object.freeze([
  { id: 'gemini', name: 'Gemini' },
  { id: 'groq', name: 'Groq' },
  { id: 'cloudflare', name: 'Cloudflare Workers AI (text)' },
]);
export const KEY_SLOT_COUNT = 10;
export const KEY_STATUS_LABEL = Object.freeze({ UNUSED: 'UNUSED', USED: 'USED', LIMIT_FINISHED: 'LIMIT FINISHED', NOT_SET: 'NOT SET' });

const toIso = value => {
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return null;
};
const count = value => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0; };

// day = today's pincraft_ai_metrics document data, or null when nothing is recorded yet today.
// Status precedence: LIMIT FINISHED (any quota/429 hit today) > USED (calls today) > NOT SET (known to be
// unconfigured) > UNUSED.
export function keySlotStatuses(day) {
  const slots = day && typeof day.slots === 'object' && day.slots ? day.slots : {};
  const configured = day && typeof day.configured === 'object' && day.configured ? day.configured : {};
  return KEY_PROVIDERS.map(provider => {
    const known = Array.isArray(configured[provider.id]) ? configured[provider.id] : null;
    const rows = Array.from({ length: KEY_SLOT_COUNT }, (_, index) => {
      const slot = index + 1;
      const record = slots[`${provider.id}_${slot}`] && typeof slots[`${provider.id}_${slot}`] === 'object' ? slots[`${provider.id}_${slot}`] : {};
      const calls = count(record.calls), limitHits = count(record.limited);
      const lastLimitedAt = toIso(record.lastLimitedAt);
      let status = 'UNUSED';
      if (limitHits > 0) status = 'LIMIT_FINISHED';
      else if (calls > 0) status = 'USED';
      else if (known && !known.includes(slot)) status = 'NOT_SET';
      return { slot, status, calls, limitHits, lastLimitedAt };
    });
    return { ...provider, slots: rows };
  });
}
