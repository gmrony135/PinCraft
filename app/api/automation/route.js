import { readSession, SESSION_COOKIE } from "@/lib/auth-server";
import { apiError, automationResponse, json } from "@/lib/automation/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request) {
  try { const user = await readSession(request.cookies.get(SESSION_COOKIE)?.value); return json(await automationResponse(user)); }
  catch (error) { return apiError(error); }
}
