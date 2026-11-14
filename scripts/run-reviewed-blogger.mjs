// Guarded GitHub Actions/explicit CLI only. Blogger API mutations remain direct
// Node checkpoints. Recurring generation calls the existing Vercel generator via
// short-lived, exact-workflow OIDC; no AI keys or Pinterest APIs are imported.
// No user IDs, tokens, content or thrown provider objects go to CI logs.
import { getDatabase } from '../lib/automation/db.mjs';
import { firebaseEmulatorsAllowed, firebaseAdminConfigured } from '../lib/firebase/admin.mjs';
import { runReviewedPublisher } from '../lib/publishing/repository.mjs';
import { oauthConfig } from '../lib/automation/oauth-config.mjs';
import { vaultReady } from '../lib/automation/vault.mjs';
import { manualPinterestMode } from '../lib/publishing/mode.mjs';
import { requestBlogAutomation } from './request-blog-automation.mjs';

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
    const started=Date.now();
    db = getDatabase();
    // Exactly one bounded generation invocation per run. It cannot inject an
    // owner or content and cannot spend quota twice by replaying this delivery.
    const generation=local?{outcome:'local_generation_not_invoked'}:await requestBlogAutomation();
    // A generation outage never suppresses already-authorized Blogger jobs.
    const result = await runReviewedPublisher(db, { limit: 4, maxSteps: 12, deadlineMs: Math.max(10000,180000-(Date.now()-started)) });
    console.log(JSON.stringify({ ok: true, mode: 'blogger_manual_pin', generation, outcome: result.outcome, dueCandidates: result.dueCandidates, steps: result.steps, processed: result.processed, failed: result.failed }));
    if (result.failed || generation.outcome==='needs_attention' || ['workload_not_authorized','oidc_unavailable','generation_unavailable','generation_response_unconfirmed'].includes(generation.outcome)) process.exitCode = 1;
  } catch {
    console.error('The reviewed Blogger run could not be confirmed. Inspect saved checkpoints; do not blindly repost.');
    process.exitCode = 1;
  } finally {
    // Close the gRPC channels so an idle client cannot keep the Actions process
    // alive after its bounded work has finished. A killed run retains its lease.
    if (db) await db.terminate().catch(() => {});
  }
}
