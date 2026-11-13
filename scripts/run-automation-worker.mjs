import { getDatabase } from "../lib/automation/db.mjs";
import { workerEnvironmentAllowed } from "../lib/automation/infrastructure.mjs";
import { runWorker } from "../lib/automation/worker.mjs";
if (!workerEnvironmentAllowed()) { console.error("Worker execution is disabled outside production. Use only an explicitly authorized isolated test environment."); process.exitCode = 1; }
else {
  const database = getDatabase();
  try { console.log(JSON.stringify(await runWorker(database))); }
  catch { console.error("Worker failed safely. Inspect the private server job log; no credentials were logged."); process.exitCode = 1; }
  finally { await database.terminate(); }
}
