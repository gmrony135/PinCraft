// GitHub Actions/explicit CLI only. Never imports generation or Pinterest APIs.
// No URLs, user IDs, tokens, content or thrown provider objects go to CI logs.
import { getDatabase } from '../lib/automation/db.mjs';
import { firebaseEmulatorsAllowed, firebaseAdminConfigured } from '../lib/firebase/admin.mjs';
import { runReviewedPublisher } from '../lib/publishing/repository.mjs';
import { oauthConfig } from '../lib/automation/oauth-config.mjs';
import { vaultReady } from '../lib/automation/vault.mjs';
import { manualPinterestMode } from '../lib/publishing/mode.mjs';

const local = firebaseEmulatorsAllowed();
if (!manualPinterestMode()) {
  console.error('This runner is only for Blogger automatic + Pinterest manual mode.');
  process.exitCode = 1;
} else if (!local && (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REPOSITORY !== 'gmrony135/PinCraft' || process.env.GITHUB_REF !== 'refs/heads/main' || !['schedule', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME))) {
  console.error('Refusing an untrusted publishing context. Use the guarded local emulators for tests.');
  process.exitCode = 1;
} else if (!firebaseAdminConfigured() || !vaultReady() || !oauthConfig('blogger').configured) {
  console.error('Blogger publishing server credentials, matching encryption key or exact callback are missing. No publishing was attempted.');
  process.exitCode = 1;
} else {
  let db;
  try {
    db = getDatabase();
    const result = await runReviewedPublisher(db, { limit: 4, maxSteps: 12, deadlineMs: 180000 });
    console.log(JSON.stringify({ ok: true, mode: 'blogger_manual_pin', outcome: result.outcome, dueCandidates: result.dueCandidates, steps: result.steps, processed: result.processed, failed: result.failed }));
    if (result.failed) process.exitCode = 1;
  } catch {
    console.error('The reviewed Blogger run could not be confirmed. Inspect saved checkpoints; do not blindly repost.');
    process.exitCode = 1;
  } finally {
    // Close the gRPC channels so an idle client cannot keep the Actions process
    // alive after its bounded work has finished. A killed run retains its lease.
    if (db) await db.terminate().catch(() => {});
  }
}
