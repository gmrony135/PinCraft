import "server-only";
import { randomUUID } from "node:crypto";
import { transaction } from "./db.mjs";
import { AUTO_DAILY_LIMIT, DEFAULT_TOPICS, emptyAutomation } from "./shared.mjs";
import { AutomationError } from "./errors.mjs";

const ACTIVE = "('pending','generating','generated','publishing','blog_published','posting','retry')";
const MUTATING = new Set(["publishing", "posting"]);
const iso = (value) => value ? new Date(value).toISOString() : null;

export async function ensureSettings(database, userId) {
  await database.query("INSERT INTO pincraft_auto_settings(user_id,topics) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING", [userId, JSON.stringify(DEFAULT_TOPICS)]);
}
export async function addLog(database, userId, jobId, event, status, message) {
  await database.query("INSERT INTO pincraft_auto_logs(user_id,job_id,event,status,message) VALUES($1,$2,$3,$4,$5)", [userId, jobId, event, status, message]);
}

// Recover even paused accounts. A process killed while publishing cannot prove
// whether the remote API accepted the request. Never blindly replay that step.
export async function recoverInterrupted(database, userId = null, now = new Date()) {
  return transaction(database, async (client) => {
    const accounts = (await client.query(`SELECT s.user_id FROM pincraft_auto_settings s WHERE ($1::text IS NULL OR s.user_id=$1) AND EXISTS(SELECT 1 FROM pincraft_auto_jobs j WHERE j.user_id=s.user_id AND j.state IN ('publishing','posting') AND j.lease_until<=$2) ORDER BY s.user_id FOR UPDATE OF s SKIP LOCKED LIMIT 30`, [userId, now])).rows;
    for (const account of accounts) {
      const jobs = (await client.query("UPDATE pincraft_auto_jobs SET state='attention',error_code='interrupted_publication',error_message='The worker stopped during an external publish request. Check the remote result before continuing.',lease_until=NULL,lease_token=NULL,updated_at=now() WHERE user_id=$1 AND state IN ('publishing','posting') AND lease_until<=$2 RETURNING id", [account.user_id, now])).rows;
      await client.query("UPDATE pincraft_auto_settings SET enabled=false,last_error='An interrupted publication needs review to prevent duplicate posts.' WHERE user_id=$1", [account.user_id]);
      for (const job of jobs) await addLog(client, account.user_id, job.id, "review_required", "warning", "Interrupted external publish: no automatic repost was attempted.");
    }
    return accounts.length;
  });
}

export async function getStatus(database, userId) {
  await ensureSettings(database, userId);
  await recoverInterrupted(database, userId);
  const settings = (await database.query("SELECT * FROM pincraft_auto_settings WHERE user_id=$1", [userId])).rows[0];
  const [stats, recent, logs, heartbeat] = await Promise.all([
    database.query("SELECT count(*) FILTER (WHERE state='success' AND (completed_at AT TIME ZONE $2)::date=(now() AT TIME ZONE $2)::date)::int AS today,count(*) FILTER (WHERE state='success')::int AS successes,count(blog_id)::int AS articles FROM pincraft_auto_jobs WHERE user_id=$1", [userId, settings.timezone]),
    database.query("SELECT id,topic,topic_metadata,state,content->>'title' AS title,blog_url,pin_url,error_message,created_at,completed_at FROM pincraft_auto_jobs WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 8", [userId]),
    database.query("SELECT id,job_id,event,status,message,created_at FROM pincraft_auto_logs WHERE user_id=$1 ORDER BY id DESC LIMIT 30", [userId]),
    database.query("SELECT last_seen_at,last_finished_at,last_status FROM pincraft_auto_heartbeat WHERE name='auto-worker'"),
  ]);
  return { ...emptyAutomation(), enabled: settings.enabled, timezone: settings.timezone, topics: settings.topics, topicSource: settings.topic_source, trendRegion: settings.trend_region, nextRunAt: iso(settings.next_run_at), lastSuccessAt: iso(settings.last_success_at), lastError: settings.last_error, connections: settings.connection_summary, todayCount: stats.rows[0].today, totalSuccess: stats.rows[0].successes, totalArticles: stats.rows[0].articles, recent: recent.rows, logs: logs.rows, heartbeat: heartbeat.rows[0] ? { lastSeenAt: iso(heartbeat.rows[0].last_seen_at), lastFinishedAt: iso(heartbeat.rows[0].last_finished_at), lastStatus: heartbeat.rows[0].last_status } : null };
}
async function idleAccount(client, userId) {
  const settings = (await client.query("SELECT * FROM pincraft_auto_settings WHERE user_id=$1 FOR UPDATE", [userId])).rows[0];
  if ((await client.query(`SELECT id FROM pincraft_auto_jobs WHERE user_id=$1 AND state IN ${ACTIVE} AND lease_until>now() LIMIT 1`, [userId])).rowCount) throw new AutomationError("worker_busy", "A server job is in flight. Pause Auto Mode and wait for it to finish before changing connections or topics.", { status: 409 });
  return settings;
}
export async function reserveVerification(database, userId) {
  await ensureSettings(database, userId);
  const result = await database.query("UPDATE pincraft_auto_settings SET verify_started_at=now() WHERE user_id=$1 AND (verify_started_at IS NULL OR verify_started_at<now()-interval '90 seconds') RETURNING user_id", [userId]);
  if (!result.rowCount) throw new AutomationError("rate_limited", "Wait 90 seconds before verifying connections again. This protects your provider quota.", { status: 429 });
}
export async function connectAccount(database, userId, { encrypted, summary, topics, timezone, topicSource, trendRegion, activate }) {
  await ensureSettings(database, userId);
  await recoverInterrupted(database, userId);
  return transaction(database, async (client) => {
    await idleAccount(client, userId);
    if ((await client.query("SELECT id FROM pincraft_auto_jobs WHERE user_id=$1 AND state='attention' LIMIT 1", [userId])).rowCount) throw new AutomationError("review_required", "Resolve the uncertain remote result before replacing connections; its original account is needed for verification.", { status: 409 });
    const updated = (await client.query("UPDATE pincraft_auto_settings SET credentials=$2,connection_summary=$3::jsonb,topics=$4::jsonb,timezone=$5,topic_source=$6,trend_region=$7,enabled=$8,next_run_at=COALESCE(next_run_at,now()),last_error=NULL,connection_version=connection_version+1,updated_at=now() WHERE user_id=$1 RETURNING connection_version", [userId, encrypted, JSON.stringify(summary), JSON.stringify(topics), timezone, topicSource, trendRegion, activate])).rows[0];
    await client.query(`UPDATE pincraft_auto_jobs SET connection_version=$2 WHERE user_id=$1 AND state IN ${ACTIVE}`, [userId, updated.connection_version]);
    // Resume a known rejected request from its persisted checkpoint, not a new
    // duplicate article. Uncertain requests are explicitly excluded above.
    await client.query(`UPDATE pincraft_auto_jobs SET state='retry',attempts=0,retry_at=now(),error_code=NULL,error_message=NULL,connection_version=$2,updated_at=now() WHERE id=(SELECT id FROM pincraft_auto_jobs WHERE user_id=$1 AND state='failed' AND pin_id IS NULL AND created_at>now()-interval '7 days' AND NOT EXISTS(SELECT 1 FROM pincraft_auto_jobs WHERE user_id=$1 AND state IN ${ACTIVE}) ORDER BY created_at DESC LIMIT 1)`, [userId, updated.connection_version]);
    await addLog(client, userId, null, "connections_verified", "success", activate ? "Connections verified and encrypted. Auto Mode enabled; awaiting its server turn." : "Connections verified and encrypted on the server. Auto Mode is paused.");
  });
}
export async function updatePreferences(database, userId, { topics, timezone, topicSource, trendRegion }) {
  await ensureSettings(database, userId);
  await transaction(database, async (client) => {
    await idleAccount(client, userId);
    await client.query("UPDATE pincraft_auto_settings SET topics=$2::jsonb,timezone=$3,topic_source=$4,trend_region=$5,topic_index=0,updated_at=now() WHERE user_id=$1", [userId, JSON.stringify(topics), timezone, topicSource, trendRegion]);
    await addLog(client, userId, null, "preferences_saved", "info", `Server preferences saved. Topic source: ${topicSource === "google_trends" ? "Google Trends RSS" : "configured rotation (not live trends)"}.`);
  });
}
export async function setMode(database, userId, enabled) {
  await ensureSettings(database, userId);
  await recoverInterrupted(database, userId);
  return transaction(database, async (client) => {
    const settings = (await client.query("SELECT * FROM pincraft_auto_settings WHERE user_id=$1 FOR UPDATE", [userId])).rows[0];
    if (enabled && !settings.credentials) throw new AutomationError("connections_required", "Connect and verify Pinterest, AI and your blog first.", { status: 409 });
    if (enabled && (await client.query("SELECT id FROM pincraft_auto_jobs WHERE user_id=$1 AND state='attention' LIMIT 1", [userId])).rowCount) throw new AutomationError("review_required", "Inspect the uncertain remote result before resuming. It will not be blindly reposted.", { status: 409 });
    if (enabled && settings.last_error) throw new AutomationError("reconnect_required", "Reconnect the affected provider before resuming automation.", { status: 409 });
    await client.query("UPDATE pincraft_auto_settings SET enabled=$2,next_run_at=CASE WHEN $2 THEN COALESCE(next_run_at,now()) ELSE next_run_at END,updated_at=now() WHERE user_id=$1", [userId, enabled]);
    if (settings.enabled !== enabled) await addLog(client, userId, null, enabled ? "mode_enabled" : "mode_paused", "info", enabled ? "Auto Mode enabled. The server continues while this website is closed." : "Auto Mode paused. An already in-flight provider request may finish; no next step will start.");
  });
}
export async function disconnectAccount(database, userId) {
  await ensureSettings(database, userId);
  await transaction(database, async (client) => {
    await idleAccount(client, userId);
    if ((await client.query("SELECT id FROM pincraft_auto_jobs WHERE user_id=$1 AND state='attention' LIMIT 1", [userId])).rowCount) throw new AutomationError("review_required", "Resolve or explicitly abandon the uncertain job before removing its credentials.", { status: 409 });
    await client.query("UPDATE pincraft_auto_settings SET enabled=false,credentials=NULL,connection_summary=NULL,connection_version=connection_version+1,updated_at=now() WHERE user_id=$1", [userId]);
    await addLog(client, userId, null, "connections_removed", "info", "Auto Mode stopped and encrypted credentials removed. Saved content and logs remain.");
  });
}
export async function workerHeartbeat(database, phase = "start", executionId = null) {
  if (phase === "start") await database.query("INSERT INTO pincraft_auto_heartbeat(name,last_seen_at,last_status,execution_id) VALUES('auto-worker',now(),'running',$1) ON CONFLICT(name) DO UPDATE SET last_seen_at=now(),last_status='running',execution_id=$1", [executionId]);
  else await database.query("UPDATE pincraft_auto_heartbeat SET last_finished_at=now(),last_status=$1 WHERE name='auto-worker'", [phase === "ok" ? "ok" : "error"]);
}

export async function claimJob(database, now = new Date()) {
  return transaction(database, async (client) => {
    const account = (await client.query(`SELECT s.* FROM pincraft_auto_settings s LEFT JOIN pincraft_auto_jobs j ON j.user_id=s.user_id AND j.state IN ${ACTIVE}
      WHERE s.enabled AND s.credentials IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pincraft_auto_jobs a WHERE a.user_id=s.user_id AND a.state='attention')
      AND ((j.id IS NULL AND COALESCE(s.next_run_at,$1)<=$1) OR (j.id IS NOT NULL AND (j.lease_until IS NULL OR j.lease_until<=$1) AND (j.retry_at IS NULL OR j.retry_at<=$1)))
      ORDER BY COALESCE(j.retry_at,s.next_run_at,'epoch'::timestamptz),s.user_id FOR UPDATE OF s SKIP LOCKED LIMIT 1`, [now])).rows[0];
    if (!account) return null;
    let job = (await client.query(`SELECT * FROM pincraft_auto_jobs WHERE user_id=$1 AND state IN ${ACTIVE} FOR UPDATE LIMIT 1`, [account.user_id])).rows[0];
    if (job && MUTATING.has(job.state)) {
      await client.query("UPDATE pincraft_auto_jobs SET state='attention',error_code='interrupted_publication',error_message='The worker stopped during external publication. Check the remote result.',lease_until=NULL,lease_token=NULL WHERE id=$1", [job.id]);
      await client.query("UPDATE pincraft_auto_settings SET enabled=false,last_error='An interrupted publication requires review.' WHERE user_id=$1", [account.user_id]);
      await addLog(client, account.user_id, job.id, "review_required", "warning", "Interrupted publish: no automatic repost was attempted.");
      return { skipped: true };
    }
    const date = (await client.query("SELECT ($1::timestamptz AT TIME ZONE $2)::date::text AS day,((($1::timestamptz AT TIME ZONE $2)::date+1)::timestamp AT TIME ZONE $2) AS tomorrow", [now, account.timezone])).rows[0];
    const used = (await client.query("SELECT count(*)::int AS total FROM pincraft_auto_jobs WHERE user_id=$1 AND state='success' AND (completed_at AT TIME ZONE $3)::date=$2::date", [account.user_id, date.day, account.timezone])).rows[0].total;
    if (used >= AUTO_DAILY_LIMIT) {
      await client.query("UPDATE pincraft_auto_settings SET next_run_at=GREATEST(COALESCE(next_run_at,$2),$2) WHERE user_id=$1", [account.user_id, date.tomorrow]);
      if (job) await client.query("UPDATE pincraft_auto_jobs SET retry_at=$2 WHERE id=$1", [job.id, date.tomorrow]);
      return { skipped: true };
    }
    if (!job) {
      const topic = account.topics[Number(account.topic_index) % account.topics.length];
      job = (await client.query("INSERT INTO pincraft_auto_jobs(id,user_id,scheduled_at,day_key,topic,connection_version) VALUES($1,$2,$3,$4,$5,$6) RETURNING *", [randomUUID(), account.user_id, now, date.day, topic, account.connection_version])).rows[0];
      // No catch-up burst after downtime or toggling OFF/ON. The minimum next
      // new-pipeline interval is measured from the actual server claim time.
      await client.query("UPDATE pincraft_auto_settings SET topic_index=topic_index+1,next_run_at=$2::timestamptz+interval '2 hours' WHERE user_id=$1", [account.user_id, now]);
    }
    if (job.attempts >= 3) {
      await client.query("UPDATE pincraft_auto_jobs SET state='failed',lease_until=NULL,lease_token=NULL WHERE id=$1", [job.id]);
      await client.query("UPDATE pincraft_auto_settings SET enabled=false,last_error='Retry limit reached. Check the provider and reconnect.' WHERE user_id=$1", [account.user_id]);
      return { skipped: true };
    }
    const claimed = (await client.query("UPDATE pincraft_auto_jobs SET lease_token=$2,lease_until=$3::timestamptz+interval '8 minutes',attempts=attempts+1,retry_at=NULL,updated_at=now() WHERE id=$1 RETURNING *", [job.id, randomUUID(), now])).rows[0];
    return { ...claimed, account };
  });
}
export async function assertActive(database, job) {
  const result = await database.query("SELECT s.enabled,s.connection_version FROM pincraft_auto_settings s JOIN pincraft_auto_jobs j ON j.user_id=s.user_id WHERE j.id=$1 AND j.lease_token=$2 AND j.lease_until>now()", [job.id, job.lease_token]);
  if (!result.rowCount) throw new AutomationError("lease_lost", "The job lease expired; no further external request was started.");
  if (!result.rows[0].enabled) throw new AutomationError("paused", "Auto Mode is paused.");
  if (result.rows[0].connection_version !== job.connection_version) throw new AutomationError("connections_changed", "Connections changed. Resume from the saved checkpoint after reconnecting.");
}
export async function checkpoint(database, job, state, updates = {}) {
  const allowed = ["content", "topic", "topic_metadata", "blog_id", "blog_url", "pin_id", "pin_url"];
  const fields = []; const values = [job.id, job.lease_token, state];
  for (const [name, value] of Object.entries(updates)) {
    if (!allowed.includes(name)) throw new Error("Invalid checkpoint field");
    const json = name === "content" || name === "topic_metadata";
    values.push(json ? JSON.stringify(value) : value); fields.push(`${name}=$${values.length}${json ? "::jsonb" : ""}`);
  }
  const result = await database.query(`UPDATE pincraft_auto_jobs SET state=$3,updated_at=now()${fields.length ? "," + fields.join(",") : ""} WHERE id=$1 AND lease_token=$2 AND lease_until>now() RETURNING *`, values);
  if (!result.rowCount) throw new AutomationError("lease_lost", "This worker no longer owns the job lease.");
  Object.assign(job, result.rows[0]);
}
export async function beginMutation(database, job, state) {
  await transaction(database, async (client) => {
    await client.query("SELECT user_id FROM pincraft_auto_settings WHERE user_id=$1 FOR UPDATE", [job.user_id]);
    await assertActive(client, job);
    await checkpoint(client, job, state);
  });
}
export async function completeJob(database, job, pin) {
  // Do not mutate the in-memory publishing checkpoint until COMMIT succeeds.
  // If persistence fails after the Pin was accepted, failJob must still know
  // this was an uncertain external mutation, never a safe repost.
  const updated = { ...job };
  await transaction(database, async (client) => {
    await client.query("SELECT user_id FROM pincraft_auto_settings WHERE user_id=$1 FOR UPDATE", [job.user_id]);
    await checkpoint(client, updated, "success", { pin_id: pin.id, pin_url: pin.url });
    await client.query("UPDATE pincraft_auto_jobs SET completed_at=now(),lease_token=NULL,lease_until=NULL,error_code=NULL,error_message=NULL WHERE id=$1", [job.id]);
    await client.query("UPDATE pincraft_auto_settings SET last_success_at=now(),last_error=NULL WHERE user_id=$1", [job.user_id]);
    await addLog(client, job.user_id, job.id, "pin_posted", "success", "Pin Posted — Pinterest confirmed its Pin ID. Pin + Article pipeline completed and saved in My Library.");
  });
  Object.assign(job, updated);
}
export async function failJob(database, job, error) {
  const known = error instanceof AutomationError;
  const uncertain = error.uncertain || ((!known || error.code === "lease_lost") && MUTATING.has(job.state));
  const retry = error.retryable && job.attempts < 3 && !uncertain;
  const state = uncertain ? "attention" : retry ? "retry" : "failed";
  const message = known ? error.message : uncertain ? "The provider result could not be persisted. Check the remote destination before continuing; automatic reposting is blocked." : "The worker could not finish. Check its saved checkpoint and server configuration.";
  await transaction(database, async (client) => {
    await client.query("SELECT user_id FROM pincraft_auto_settings WHERE user_id=$1 FOR UPDATE", [job.user_id]);
    if (error.code === "paused") { await client.query("UPDATE pincraft_auto_jobs SET lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2", [job.id, job.lease_token]); return; }
    const result = await client.query("UPDATE pincraft_auto_jobs SET state=$3,error_code=$4,error_message=$5,retry_at=CASE WHEN $3='retry' THEN now()+interval '15 minutes' ELSE NULL END,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2 RETURNING user_id", [job.id, job.lease_token, state, error.code || "worker_error", message]);
    if (!result.rowCount) return;
    if (!retry) await client.query("UPDATE pincraft_auto_settings SET enabled=false,last_error=$2 WHERE user_id=$1", [job.user_id, message]);
    await addLog(client, job.user_id, job.id, retry ? "retry_scheduled" : "job_stopped", uncertain ? "warning" : "error", message);
  });
}
export async function listLibrary(database, userId, cursor) {
  const result = await database.query("SELECT id,topic,topic_metadata,state,content,blog_url,pin_url,created_at,completed_at FROM pincraft_auto_jobs WHERE user_id=$1 AND content IS NOT NULL AND ($2::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM pincraft_auto_jobs WHERE id=$2::uuid AND user_id=$1)) ORDER BY created_at DESC,id DESC LIMIT 21", [userId, cursor || null]);
  return { items: result.rows.slice(0, 20), nextCursor: result.rows.length > 20 ? result.rows[19].id : null };
}
export async function reviewJob(database, userId, jobId, outcome) {
  await transaction(database, async (client) => {
    await client.query("SELECT user_id FROM pincraft_auto_settings WHERE user_id=$1 FOR UPDATE", [userId]);
    const job = (await client.query("SELECT * FROM pincraft_auto_jobs WHERE user_id=$1 AND id=$2 FOR UPDATE", [userId, jobId])).rows[0];
    if (!job || job.state !== "attention") throw new AutomationError("invalid_review", "This job is not awaiting review.", { status: 409 });
    if (outcome.cancel) {
      await client.query("UPDATE pincraft_auto_jobs SET state='cancelled',error_message='Abandoned after the account owner checked the remote destination.',updated_at=now() WHERE id=$1", [jobId]);
      await addLog(client, userId, jobId, "job_abandoned", "warning", "Owner inspected the destination and abandoned this job. No success or automatic repost was recorded.");
    } else if (outcome.pin) {
      await client.query("UPDATE pincraft_auto_jobs SET state='success',pin_id=$2,pin_url=$3,completed_at=now(),error_code=NULL,error_message=NULL,updated_at=now() WHERE id=$1", [jobId, outcome.pin.id, outcome.pin.url]);
      await client.query("UPDATE pincraft_auto_settings SET last_success_at=now() WHERE user_id=$1", [userId]);
      await addLog(client, userId, jobId, "pin_verified", "success", "Pinterest confirmed the supplied Pin ID and article link. The pipeline is complete; no repost was made.");
    } else if (outcome.blog) {
      await client.query("UPDATE pincraft_auto_jobs SET state='retry',blog_id=$2,blog_url=$3,attempts=0,retry_at=now(),error_code=NULL,error_message=NULL,updated_at=now() WHERE id=$1", [jobId, outcome.blog.id, outcome.blog.url]);
      await addLog(client, userId, jobId, "article_verified", "success", "The blog confirmed the supplied article and job marker. Only the remaining Pinterest step will resume.");
    } else throw new AutomationError("invalid_review", "A verified remote result is required.");
    await client.query("UPDATE pincraft_auto_settings SET enabled=false,last_error=CASE WHEN EXISTS(SELECT 1 FROM pincraft_auto_jobs WHERE user_id=$1 AND state='attention') THEN last_error ELSE NULL END WHERE user_id=$1", [userId]);
  });
}
