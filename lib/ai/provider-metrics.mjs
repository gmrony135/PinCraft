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

// Counts every request sent to a provider, including attempts that later fail.
// Never throws: a metrics write must not change how an AI request behaves.
export async function recordAIProviderRequest(db, hostname, now = Date.now()) {
  const provider = aiProviderForHost(hostname);
  if (!provider) return false;
  try {
    const day = freeUsageDay(now);
    await db.collection('pincraft_ai_metrics').doc(day).set(
      { day, [provider]: FieldValue.increment(1), updated_at: new Date(now) },
      { merge: true },
    );
    return true;
  } catch {
    console.error('ai metrics: provider request count was not saved');
    return false;
  }
}
