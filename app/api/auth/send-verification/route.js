import { json } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { firebaseAuth } from '@/lib/firebase/admin.mjs';
import { requestVerification, verificationStatus } from '@/lib/email/verification.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Queues PinCraft's branded verification email for the signed-in token owner. Works without the Gmail grant:
// the message waits in the outbox and the tick sends it later. Errors never include provider text or stack traces.
export async function POST(request) {
  let body;
  try {
    const text = await request.text();
    if (text.length > 8000) return json({ ok: false, verificationSent: false, verificationErrorCode: 'bad_request' }, 400);
    body = JSON.parse(text);
  } catch {
    return json({ ok: false, verificationSent: false, verificationErrorCode: 'bad_request' }, 400);
  }
  // Only idToken is read. Any recipient, uid, or link in the body is ignored.
  const idToken = body && typeof body === 'object' ? body.idToken : null;
  let result;
  try {
    result = await requestVerification({ idToken, auth: firebaseAuth(), db: getDatabase() });
  } catch {
    result = { ok: false, verificationSent: false, verificationErrorCode: 'server_error' };
  }
  return json(result, result.ok ? 200 : verificationStatus(result.verificationErrorCode));
}
