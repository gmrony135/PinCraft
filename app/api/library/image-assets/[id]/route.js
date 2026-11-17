import { apiError, sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { readLibraryImage, validLibraryImageId } from '@/lib/ai/library-images.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const user = await sessionUser(request), { id } = await params;
    if (!validLibraryImageId(id)) return new Response('Image not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const image = await readLibraryImage(getDatabase(), id, { uid: user.id });
    if (!image) return new Response('Image not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return new Response(image.bytes, { headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(image.bytes.length),
      'Content-Disposition': 'inline; filename="pincraft-artwork.webp"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    } });
  } catch (error) { return apiError(error); }
}
