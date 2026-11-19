import { showcaseResultPage } from '@/lib/showcase/popup-page.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Result page for errors that happen before Google is reached (for example, not configured).
export async function GET(request) {
  const code = new URL(request.url).searchParams.get('code') || '';
  return new Response(showcaseResultPage(code), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY' },
  });
}
