import { NextResponse } from "next/server";
import { cookieOptions, NONCE_COOKIE, sameOrigin, SESSION_COOKIE } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "This request was not allowed." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const response = NextResponse.json({ signedOut: true }, { headers: { "Cache-Control": "no-store, private" } });
  response.cookies.set(SESSION_COOKIE, "", cookieOptions(request, 0));
  response.cookies.set(NONCE_COOKIE, "", cookieOptions(request, 0));
  return response;
}
