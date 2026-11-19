import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { collectBilling } from '../../../lib/billing.mjs';
import { COOKIE, readSession } from '../../../lib/session.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const noStore = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET() {
  let session = null;
  try {
    session = readSession((await cookies()).get(COOKIE)?.value);
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: noStore });
  }
  if (!session) return NextResponse.json({ error: 'sign_in_required' }, { status: 401, headers: noStore });
  try {
    return NextResponse.json(await collectBilling(), { headers: noStore });
  } catch (error) {
    console.error('admin billing read failed', error?.code || error?.name || 'error');
    return NextResponse.json({ error: 'unavailable', message: 'Payment reviews could not be read just now. They refresh automatically.' }, { status: 503, headers: noStore });
  }
}
