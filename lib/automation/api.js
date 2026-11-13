import "server-only";
import { NextResponse } from "next/server";
import { authSettings, readSession, sameOrigin, SESSION_COOKIE } from "@/lib/auth-server";
import { AutomationError, publicError } from "./errors.mjs";
import { infrastructureStatus } from "./infrastructure.mjs";
import { emptyAutomation, normalizeTimezone, normalizeTopics } from "./shared.mjs";
import { getDatabase } from "./db.mjs";
import { getStatus } from "./repository.mjs";
import { TREND_REGIONS } from "./trends.mjs";
export const privateHeaders = { "Cache-Control": "no-store, private", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
export const json = (data, status = 200) => NextResponse.json(data, { status, headers: privateHeaders });
export const apiError = (error) => json(publicError(error), error instanceof AutomationError ? error.status : 500);
export async function sessionUser(request, mutation = false) {
  if (mutation && !sameOrigin(request)) throw new AutomationError("origin_rejected", "This request was not allowed. Reload this website and try again.", { status: 403 });
  const user = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) throw new AutomationError("sign_in_required", "Sign in with your verified email or Google account to use your private cloud workspace.", { status: 401 });
  return user;
}
export async function readBody(request, maxBytes = 24000) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AutomationError("invalid_format", "Send a JSON request.", { status: 415 });
  if (Number(request.headers.get("content-length")) > maxBytes) throw new AutomationError("request_too_large", "The request is too large.", { status: 413 });
  const reader = request.body?.getReader(); let size = 0; const chunks = [];
  if (!reader) throw new AutomationError("invalid_request", "Settings are required.");
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) { await reader.cancel(); throw new AutomationError("request_too_large", "The request is too large.", { status: 413 }); } chunks.push(Buffer.from(value)); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString("utf8")); if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("Invalid body"); return value; } catch { throw new AutomationError("invalid_request", "Enter valid connection settings."); }
}
export function preferencesInput(raw) {
  try {
    const topics = normalizeTopics(raw.topics);
    const timezone = normalizeTimezone(raw.timezone);
    if (!["rotation", "google_trends"].includes(raw.topicSource) || !TREND_REGIONS.includes(raw.trendRegion)) throw new Error("Choose a supported topic source and trend region.");
    const intervalMinutes = raw.intervalMinutes ?? 120, dailyLimit = raw.dailyLimit ?? 10, postingMode = raw.postingMode ?? 'queue';
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 30 || intervalMinutes > 1440 || intervalMinutes % 30 || !Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 10 || !['queue','generated'].includes(postingMode)) throw new Error('Choose 1–10 Pins/day and a 30–1440 minute interval in 30-minute steps.');
    let nextPostAt = null;
    if (raw.nextPostAt) { const at = new Date(raw.nextPostAt); if (typeof raw.nextPostAt !== 'string' || !Number.isFinite(at.getTime()) || at.getTime() < Date.now()-60000 || at.getTime() > Date.now()+366*86400000) throw new Error('Choose a first due time from now to one year in the future.'); nextPostAt = at.toISOString(); }
    return { topics, timezone, topicSource: raw.topicSource, trendRegion: raw.trendRegion, intervalMinutes, dailyLimit, postingMode, nextPostAt };
  } catch (error) { throw new AutomationError("invalid_preferences", error.message); }
}
export async function automationResponse(user) {
  const infrastructure = await infrastructureStatus(authSettings().configured);
  const data = user && infrastructure.databaseReady ? await getStatus(getDatabase(), user.id) : emptyAutomation();
  return { ...data, authenticated: Boolean(user), accountId: user?.id || null, infrastructure, serverTime: new Date().toISOString() };
}
export async function requireInfrastructure() {
  const infrastructure = await infrastructureStatus(authSettings().configured);
  if (!infrastructure.ready) throw new AutomationError("setup_required", "Server setup is incomplete. No automation or provider publishing has been activated.", { status: 503 });
}
