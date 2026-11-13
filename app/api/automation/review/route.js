import { apiError, automationResponse, json, readBody, sessionUser } from "@/lib/automation/api";
import { getDatabase } from "@/lib/automation/db.mjs";
import { AutomationError } from "@/lib/automation/errors.mjs";
import { validJobId } from "@/lib/automation/images.mjs";
import { verifyRemotePublication } from "@/lib/automation/providers.mjs";
import { reserveVerification, reviewJob } from "@/lib/automation/repository.mjs";
import { decryptCredentials, encryptCredentials } from "@/lib/automation/vault.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function POST(request) {
  try {
    const user = await sessionUser(request, true);
    const body = await readBody(request);
    if (!validJobId(body.jobId)) throw new AutomationError("invalid_job", "Choose a valid job to review.");
    const database = getDatabase();
    const job = (await database.query("SELECT * FROM pincraft_auto_jobs WHERE id=$1 AND user_id=$2 AND state='attention'", [body.jobId, user.id])).rows[0];
    if (!job) throw new AutomationError("job_not_found", "This review job was not found.", { status: 404 });
    let outcome;
    if (body.action === "abandon" && body.checkedRemote === true) outcome = { cancel: true };
    else if (body.action === "verify" && typeof body.externalId === "string") {
      await reserveVerification(database, user.id);
      const account = (await database.query("SELECT credentials,connection_version FROM pincraft_auto_settings WHERE user_id=$1", [user.id])).rows[0];
      const config = decryptCredentials(user.id, account.credentials);
      outcome = await verifyRemotePublication(config, job, body.externalId.trim());
      await database.query("UPDATE pincraft_auto_settings SET credentials=$2 WHERE user_id=$1 AND connection_version=$3 AND credentials IS NOT NULL", [user.id, encryptCredentials(user.id, config), account.connection_version]);
    } else throw new AutomationError("review_confirmation_required", "Verify a real remote ID, or confirm that you checked the destination before abandoning this job.");
    await reviewJob(database, user.id, job.id, outcome);
    return json(await automationResponse(user));
  } catch (error) { return apiError(error); }
}
