import "server-only";
import { decryptCredentials, encryptCredentials } from "./vault.mjs";
import { requestData } from "./http.mjs";
import { pinImageURL } from "./images.mjs";
import { chooseTopic } from "./trends.mjs";
import { generateContent, postPin, publishArticle, refreshAccess } from "./providers.mjs";
import { addLog, assertActive, beginMutation, checkpoint, claimJob, completeJob, failJob, recoverInterrupted, workerHeartbeat } from "./repository.mjs";
import { AutomationError } from "./errors.mjs";

export async function verifyPinImage(url, send = requestData) {
  const data = await send(url, { provider: "Pin image service", publicHost: true, format: "bytes", timeout: 20000 });
  const png = Buffer.isBuffer(data) && data.length > 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!png || data.readUInt32BE(16) !== 1000 || data.readUInt32BE(20) !== 1500) throw new AutomationError("image_unavailable", "The public image service did not confirm a 1000×1500 PNG. Nothing new was published.", { retryable: true });
}
export async function runJob(database, job, dependencies = {}) {
  const send = dependencies.send || requestData;
  const image = dependencies.imageURL || pinImageURL;
  const checkImage = dependencies.verifyImage || ((url) => verifyPinImage(url, send));
  try {
    await assertActive(database, job);
    const config = decryptCredentials(job.user_id, job.account.credentials);
    await refreshAccess(config, send);
    // Persist refreshed/rotated tokens only if the account still has this exact
    // connection version. Never resurrect credentials removed in another tab.
    await database.query("UPDATE pincraft_auto_settings SET credentials=$2 WHERE user_id=$1 AND connection_version=$3 AND credentials IS NOT NULL", [job.user_id, encryptCredentials(job.user_id, config), job.account.connection_version]);
    await assertActive(database, job);
    if (!job.topic_metadata) {
      const selected = await chooseTopic(job.account, job, database, send);
      await checkpoint(database, job, "pending", { topic: selected.topic, topic_metadata: selected.metadata });
      await addLog(database, job.user_id, job.id, "topic_selected", "info", `Topic selected: ${job.topic}. Source: ${selected.metadata.label}.`);
    }
    if (!job.content) {
      await checkpoint(database, job, "generating");
      const content = await generateContent(config, job.topic, send, job.topic_metadata);
      await checkpoint(database, job, "generated", { content });
      await addLog(database, job.user_id, job.id, "content_saved", "success", "Pin title, description, hashtags and full SEO article generated and saved to the cloud Library.");
    }
    await assertActive(database, job);
    const imageUrl = image(job.id);
    await checkImage(imageUrl);
    if (!job.blog_url) {
      await beginMutation(database, job, "publishing");
      const published = await publishArticle(config, job, send);
      await checkpoint(database, job, "blog_published", { blog_id: published.id, blog_url: published.url });
      await addLog(database, job.user_id, job.id, "article_published", "success", "Article Published — the blog confirmed the public article URL.");
    }
    await beginMutation(database, job, "posting");
    const pin = await postPin(config, job, imageUrl, send);
    await completeJob(database, job, pin);
    return { status: "success" };
  } catch (error) {
    await failJob(database, job, error);
    return { status: error.code === "paused" ? "paused" : error.uncertain ? "attention" : "stopped" };
  }
}
export async function runWorker(database, options = {}) {
  await workerHeartbeat(database, "start", options.executionId || null);
  try {
    await recoverInterrupted(database);
    // Bounded parallel work fits a 300s serverless invocation. The per-account
    // row lock + partial unique index permits only one open pipeline per user.
    const results = await Promise.all(Array.from({ length: Math.min(3, options.maxJobs || 3) }, async () => {
      const job = await claimJob(database);
      return !job || job.skipped ? { status: "idle" } : runJob(database, job, options.dependencies);
    }));
    await workerHeartbeat(database, "ok");
    return { processed: results.filter((result) => result.status !== "idle").length, completed: results.filter((result) => result.status === "success").length, stopped: results.filter((result) => ["stopped", "attention"].includes(result.status)).length };
  } catch {
    try { await workerHeartbeat(database, "error"); } catch { /* Database is unavailable. Leases are recovered on the next healthy run. */ }
    throw new AutomationError("worker_unavailable", "The server worker could not persist its result. The next healthy run will recover expired leases without blindly reposting.", { status: 503 });
  }
}
