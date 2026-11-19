import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { collectBilling, reviewPayment, ownerUid, BillingError } from '../../../../lib/billing.mjs';
import { db } from '../../../../lib/firebase.mjs';
import { COOKIE, readSession } from '../../../../lib/session.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const noStore = { 'Cache-Control': 'no-store, max-age=0' };

function sameOrigin(h) {
  const origin = h.get('origin'), host = h.get('host');
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

export async function POST(request) {
  let session = null;
  try { session = readSession((await cookies()).get(COOKIE)?.value); } catch { session = null; }
  if (!session) return NextResponse.json({ error: 'sign_in_required' }, { status: 401, headers: noStore });
  if (!sameOrigin(await headers())) return NextResponse.json({ error: 'origin_rejected', message: 'This request was not allowed. Reload the page and try again.' }, { status: 403, headers: noStore });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid_format', message: 'Send a JSON request.' }, { status: 415, headers: noStore }); }
  try {
    if (!['approve', 'reject'].includes(body?.action)) throw new BillingError('invalid_action', 'Choose Approve or Reject.');
    const reviewer = await ownerUid();
    await reviewPayment(db(), { id: body.id, action: body.action, confirmWalletReceipt: body.confirmWalletReceipt, note: body.note }, reviewer);
    return NextResponse.json({ ...(await collectBilling()), result: body.action === 'approve' ? 'approved' : 'rejected' }, { headers: noStore });
  } catch (error) {
    if (error instanceof BillingError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status, headers: noStore });
    console.error('admin billing review failed', error?.code || error?.name || 'error');
    return NextResponse.json({ error: 'unavailable', message: 'The decision was not saved. Reload and check the request before trying again.' }, { status: 503, headers: noStore });
  }
}
