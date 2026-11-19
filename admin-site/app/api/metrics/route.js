import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { collectMetrics } from '../../../lib/metrics.mjs';
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
    return NextResponse.json(await collectMetrics(), { headers: noStore });
  } catch (error) {
    console.error('admin metrics read failed', error?.code || error?.name || 'error');
    return NextResponse.json({ error: 'unavailable', message: 'Live data could not be read just now. It refreshes automatically.' }, { status: 503, headers: noStore });
  }
}
