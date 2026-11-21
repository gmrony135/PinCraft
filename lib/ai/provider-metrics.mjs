import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { freeUsageDay } from '../free-plan.mjs';

// Per-provider request counts, one document per Dhaka day: pincraft_ai_metrics/{YYYY-MM-DD}.
// Counting starts at deploy. Days before that have no document, so the admin site
// must say so instead of showing zero.

// Only the three providers the owner tracks. Matched by the exact API host we call.
const PROVIDER_BY_HOST = Object.freeze({
  'generativelanguage.googleapis.com': 'gemini',
  'api.groq.com': 'groq',
  'api.cloudflare.com': 'cloudflare',
});

export function aiProviderForHost(hostname) {
  return Object.prototype.hasOwnProperty.call(PROVIDER_BY_HOST, hostname) ? PROVIDER_BY_HOST[hostname] : null;
}

// Per-key view (owner admin): slots: { gemini_3: { calls, limited, lastLimitedAt } } and configured: { gemini: [1,2,…] }.
// Only slot numbers are stored. Key values, tokens and account ids never reach this document.
const SLOT_ID = /^(gemini|groq|cloudflare)_(10|[1-9])$/;
const slotFor = (slot, provider) => slot && typeof slot.id === 'string' && SLOT_ID.test(slot.id) && slot.id.startsWith(`${provider}_`) ? slot : null;
const configuredList = list => Array.isArray(list) ? list.filter(n => Number.isInteger(n) && n >= 1 && n <= 10).slice(0, 10) : [];

// Counts every request sent to a provider, including attempts that later fail.
// Never throws: a metrics write must not change how an AI request behaves.
export async function recordAIProviderRequest(db, hostname, now = Date.now(), slot = null) {
  const provider = aiProviderForHost(hostname);
  if (!provider) return false;
  try {
    const day = freeUsageDay(now);
    const data = { day, [provider]: FieldValue.increment(1), updated_at: new Date(now) };
    const keySlot = slotFor(slot, provider);
    if (keySlot) {
      data.slots = { [keySlot.id]: { calls: FieldValue.increment(1) } };
      data.configured = { [provider]: configuredList(keySlot.configured) };
    }
    await db.collection('pincraft_ai_metrics').doc(day).set(data, { merge: true });
    return true;
  } catch {
    console.error('ai metrics: provider request count was not saved');
    return false;
  }
}

// A quota or rate-limit answer (HTTP 429) for one key slot, for today's per-key view.
export async function recordAISlotLimit(db, slot, now = Date.now()) {
  const provider = slot && typeof slot.id === 'string' ? (slot.id.split('_')[0]) : null;
  const keySlot = slotFor(slot, provider);
  if (!keySlot) return false;
  try {
    const day = freeUsageDay(now);
    await db.collection('pincraft_ai_metrics').doc(day).set(
      { day, slots: { [keySlot.id]: { limited: FieldValue.increment(1), lastLimitedAt: new Date(now) } } },
      { merge: true },
    );
    return true;
  } catch {
    console.error('ai metrics: key limit was not saved');
    return false;
  }
}
