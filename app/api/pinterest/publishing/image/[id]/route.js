import { getDatabase } from '@/lib/automation/db.mjs';
import { PIN_ID, readPinterestImage, validPinterestImageSignature } from '@/lib/publishing/pinterest-workflow.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;
const missing = () => new Response('Image not found', { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

export async function GET(request, { params }) {
  const { id } = await params;
  const signature = new URL(request.url).searchParams.get('sig') || '';
  if (!PIN_ID.test(String(id || '')) || !validPinterestImageSignature(id, signature)) return missing();
  try {
    const image = await readPinterestImage(getDatabase(), id);
    if (!image) return missing();
    return new Response(image.bytes, { headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(image.byteSize),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Access-Control-Allow-Origin': '*',
      'X-Robots-Tag': 'noindex, nofollow',
    } });
  } catch {
    return new Response('Image service unavailable', { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
}
