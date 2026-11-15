import { NextResponse } from "next/server";
import { authSettings, readSession, SESSION_COOKIE } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const config = authSettings();
  const headers = { "Cache-Control": "no-store, private", Vary: "Cookie" };
  try {
    const user = await readSession(request.cookies.get(SESSION_COOKIE)?.value, config);
    return NextResponse.json({ user, configured: config.configured }, { headers });
  } catch {
    // A temporary Firebase Auth lookup failure is not proof that the user
    // signed out. Keep the persistent HttpOnly cookie and allow safe retries.
    return NextResponse.json({ error: "Your saved session could not be checked just now. Please retry." }, { status: 503, headers: { ...headers, "Retry-After": "1" } });
  }
}
