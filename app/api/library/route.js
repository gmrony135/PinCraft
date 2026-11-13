import { apiError, json, sessionUser } from "@/lib/automation/api";
import { databaseHealth, getDatabase } from "@/lib/automation/db.mjs";
import { AutomationError } from "@/lib/automation/errors.mjs";
import { validJobId } from "@/lib/automation/images.mjs";
import { listLibrary } from "@/lib/automation/repository.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request) {
  try {
    const user = await sessionUser(request);
    if (!(await databaseHealth()).ready) return json({ ready: false, items: [], nextCursor: null, message: "Cloud Library setup is pending. Device saves remain separate and unchanged." });
    const cursor = new URL(request.url).searchParams.get("cursor");
    if (cursor && !validJobId(cursor)) throw new AutomationError("invalid_cursor", "The Library page cursor is invalid.");
    return json({ ready: true, ...await listLibrary(getDatabase(), user.id, cursor) });
  } catch (error) { return apiError(error); }
}
