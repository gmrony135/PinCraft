import { CATEGORIES } from "../product.mjs";
export const AUTO_INTERVAL_MINUTES = 120;
export const AUTO_DAILY_LIMIT = 3;
export const DEFAULT_TIMEZONE = "Asia/Dhaka";
export const DEFAULT_TOPICS = CATEGORIES.map(category => category.label);
export const PIPELINE_STEPS = ["Choose topic", "Generate pin + article", "Save to cloud library", "Publish article", "Post to Pinterest"];
export function normalizeTopics(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) throw new Error("Choose between 1 and 20 topics.");
  const topics = [...new Set(value.map((item) => typeof item === "string" ? item.trim() : ""))];
  if (topics.some((item) => item.length < 3 || item.length > 100 || /[\u0000-\u001f<>]/.test(item))) throw new Error("Each topic must contain 3–100 plain-text characters.");
  return topics;
}
export function normalizeTimezone(value) {
  if (typeof value !== "string" || value.length > 50) throw new Error("Choose a valid IANA timezone.");
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return value; } catch { throw new Error("Choose a valid IANA timezone."); }
}
export function relativeTime(value, now = Date.now()) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "Never";
  const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} hour${hours === 1 ? "" : "s"} ago` : `${Math.floor(hours / 24)} day${Math.floor(hours / 24) === 1 ? "" : "s"} ago`;
}
export function emptyAutomation() {
  return { enabled: false, timezone: DEFAULT_TIMEZONE, topics: DEFAULT_TOPICS, topicSource: "rotation", trendRegion: "BD", postingMode: 'queue', nextRunAt: null, lastSuccessAt: null, lastError: null, connections: null, integrations: {}, destinations: {}, ai: { connected: false }, todayCount: 0, totalSuccess: 0, totalArticles: 0, failedPosts: 0, hasActiveJob: false, queueCount: 0, queue: [], recent: [], logs: [], heartbeat: null, intervalMinutes: AUTO_INTERVAL_MINUTES, dailyLimit: AUTO_DAILY_LIMIT };
}
export function automationState(data, now = Date.now()) {
  if (!data?.authenticated || !data?.infrastructure?.ready || !data?.connections) return { key: "setup", title: "Setup required", description: "Full Auto Mode stays off until server setup and account connections are verified." };
  if (data.recent?.some((job) => job.state === "attention")) return { key: "attention", title: "Review required", description: "A provider result is uncertain. Automatic reposting is blocked to avoid duplicates." };
  if (data.lastError) return { key: "error", title: "Connection needs attention", description: data.lastError };
  if (!data.enabled) return { key: "paused", title: "Auto Mode is paused", description: "Your cloud content is safe. Enable Auto Mode to resume the server schedule." };
  const seen = new Date(data.heartbeat?.lastSeenAt || 0).getTime();
  if (!seen || now - seen > 45 * 60000 || data.heartbeat?.lastStatus === "error") return { key: "waiting", title: "Awaiting server worker", description: "Auto Mode is enabled, but a healthy recent scheduler heartbeat has not been confirmed." };
  if (data.todayCount >= (data.dailyLimit || AUTO_DAILY_LIMIT)) return { key: "daily_limit", title: "Daily limit reached", description: `${data.dailyLimit || AUTO_DAILY_LIMIT} Pins published today. The server will resume on the next day in your selected timezone.` };
  if (data.postingMode === 'queue' && !data.queueCount && !data.hasActiveJob && !data.recent?.some(j => ['pending','posting','retry'].includes(j.state))) return { key: 'queue_empty', title: 'Waiting for queued Pins', description: 'Your server schedule is enabled. Add a Pin to the cloud queue; no browser needs to remain open.' };
  return { key: "running", title: "AUTO MODE IS RUNNING", description: "Connected - Full Auto Mode Active. The server continues when your browser is closed." };
}
