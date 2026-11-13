import { NextResponse } from "next/server";
import { authSettings, cookieOptions, createSession, NONCE_COOKIE, sameOrigin, SESSION_COOKIE, verifyGoogleCredential } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, private" };

export async function POST(request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "This sign-in request was not allowed." }, { status: 403, headers });
  const config = authSettings();
  if (!config.configured) return NextResponse.json({ error: "Google Login needs configuration. This preview does not simulate a Google account." }, { status: 503, headers });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Invalid request format." }, { status: 415, headers });
  const raw = await request.text();
  if (raw.length > 14000) return NextResponse.json({ error: "Sign-in request is too large." }, { status: 413, headers });
  let credential;
  try { credential = JSON.parse(raw).credential; } catch { return NextResponse.json({ error: "Invalid sign-in request." }, { status: 400, headers }); }
  try {
    const user = await verifyGoogleCredential(credential, request.cookies.get(NONCE_COOKIE)?.value, config);
    const response = NextResponse.json({ user }, { headers });
    response.cookies.set(SESSION_COOKIE, await createSession(user, config), cookieOptions(request));
    response.cookies.set(NONCE_COOKIE, "", cookieOptions(request, 0));
    return response;
  } catch {
    return NextResponse.json({ error: "Google sign-in could not be verified. Please try again." }, { status: 401, headers });
  }
}
