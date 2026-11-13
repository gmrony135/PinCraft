import "server-only";
import { timingSafeEqual } from "node:crypto";
import { databaseHealth } from "./db.mjs";
import { vaultReady } from "./vault.mjs";
import { imageOrigin } from "./images.mjs";
export const schedulerSecretReady = () => /^[A-Za-z0-9_+/=.\-]{32,256}$/.test(process.env.CRON_SECRET || "");
export function authorizedWorker(authorization) {
  if (!schedulerSecretReady()) return false;
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  return typeof authorization === "string" && Buffer.byteLength(authorization) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(authorization), Buffer.from(expected));
}
export function workerEnvironmentAllowed() { return process.env.VERCEL_ENV === "production" || process.env.AUTOMATION_ALLOW_NON_PRODUCTION === "1"; }
export async function infrastructureStatus(authConfigured) {
  const db = await databaseHealth();
  const checks = [
    { id: "environment", label: "Production background execution", ready: workerEnvironmentAllowed(), detail: workerEnvironmentAllowed() ? "Background execution allowed in this environment" : "Preview/local publishing is disabled by default" },
    { id: "auth", label: "Google sign-in + secure sessions", ready: authConfigured, detail: authConfigured ? "Server configured" : "Google OAuth and session secret are pending" },
    { id: "database", label: "Cloud PostgreSQL + migration", ready: db.ready, detail: db.ready ? "Database reachable; schema installed" : db.reason },
    { id: "vault", label: "Server-side credential encryption", ready: vaultReady(), detail: vaultReady() ? "AES-256-GCM ready" : "Encryption key is pending" },
    { id: "scheduler", label: "Protected background scheduler", ready: schedulerSecretReady(), detail: schedulerSecretReady() ? "Scheduler authorization configured; heartbeat checked separately" : "CRON_SECRET is pending" },
    { id: "images", label: "Public server-rendered Pin images", ready: Boolean(imageOrigin()), detail: imageOrigin() ? "HTTPS image origin configured; public reachability is checked when publishing" : "A public HTTPS APP_URL is pending" },
  ];
  return { ready: checks.every((check) => check.ready), databaseReady: db.ready, checks, bloggerOAuthReady: Boolean(process.env.BLOGGER_CLIENT_ID && process.env.BLOGGER_CLIENT_SECRET), pinterestRefreshReady: Boolean(process.env.PINTEREST_CLIENT_ID && process.env.PINTEREST_CLIENT_SECRET), schedulerPollMinutes: 15, schedulerJitterMinutes: 15 };
}
