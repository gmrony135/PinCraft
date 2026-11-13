import { NextResponse } from "next/server";
import { authSettings, readSession, SESSION_COOKIE } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const config = authSettings();
  const user = await readSession(request.cookies.get(SESSION_COOKIE)?.value, config);
  return NextResponse.json({ user, configured: config.configured }, { headers: { "Cache-Control": "no-store, private", Vary: "Cookie" } });
}
