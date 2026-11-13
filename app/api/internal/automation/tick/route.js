import { authSettings } from "@/lib/auth-server";
import { json, apiError } from "@/lib/automation/api";
import { authorizedWorker, infrastructureStatus, schedulerSecretReady, workerEnvironmentAllowed } from "@/lib/automation/infrastructure.mjs";
import { getDatabase } from "@/lib/automation/db.mjs";
import { runWorker } from "@/lib/automation/worker.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request) {
  if (!schedulerSecretReady()) return json({ status: "setup-pending", processed: 0, message: "Scheduler authorization is not configured. Nothing was posted." }, 503);
  if (!authorizedWorker(request.headers.get("authorization"))) return json({ error: "Unauthorized worker request." }, 401);
  if (!workerEnvironmentAllowed()) return json({ status: "disabled", processed: 0, message: "Background publishing is disabled outside production." }, 409);
  try {
    const setup = await infrastructureStatus(authSettings().configured);
    if (!setup.ready) return json({ status: "setup-pending", processed: 0, message: "Server infrastructure is incomplete. Nothing was posted." }, 503);
    // No request body can inject jobs, provider credentials or test adapters.
    const executionId = (request.headers.get("x-vercel-schedule-execution-id") || "").slice(0, 128) || null;
    return json({ status: "ok", ...await runWorker(getDatabase(), { executionId }) });
  } catch (error) { return apiError(error); }
}
