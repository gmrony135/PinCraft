import { authSettings } from "@/lib/auth-server";
import { json, apiError } from "@/lib/automation/api";
import { authorizedWorker, infrastructureStatus, schedulerSecretReady, workerEnvironmentAllowed } from "@/lib/automation/infrastructure.mjs";
import { getDatabase } from "@/lib/automation/db.mjs";
import { runWorker } from "@/lib/automation/worker.mjs";
import { githubSchedulerConfigured, verifyGithubWorker, claimSchedulerDelivery } from "@/lib/automation/scheduler.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request) {
  if (!schedulerSecretReady() && !githubSchedulerConfigured()) return json({ status: "setup-pending", processed: 0, message: "The optional maintenance worker endpoint is not enabled. Nothing was posted." }, 503);
  if (!workerEnvironmentAllowed()) return json({ status: "disabled", processed: 0, message: "Background publishing is disabled outside production." }, 409);
  try {
    const authorization=request.headers.get("authorization");
    const identity=authorizedWorker(authorization)?null:await verifyGithubWorker(authorization);
    const setup = await infrastructureStatus(authSettings().configured);
    if (!setup.ready) return json({ status: "setup-pending", processed: 0, message: "Server infrastructure is incomplete. Nothing was posted." }, 503);
    // No request body can inject jobs, provider credentials or test adapters.
    const db=getDatabase();
    if(identity)await claimSchedulerDelivery(db,identity);
    const executionId = identity?.executionId || (request.headers.get("x-pincraft-execution-id") || "").slice(0, 128) || null;
    return json({ status: "ok", ...await runWorker(db, { executionId, maxJobs:12 }) });
  } catch (error) { return apiError(error); }
}
