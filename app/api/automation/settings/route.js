import { apiError, automationResponse, json, preferencesInput, readBody, requireInfrastructure, sessionUser } from "@/lib/automation/api";
import { getDatabase } from "@/lib/automation/db.mjs";
import { AutomationError } from "@/lib/automation/errors.mjs";
import { connectionInput, verifyConnections } from "@/lib/automation/providers.mjs";
import { connectAccount, disconnectAccount, reserveVerification, setMode, updatePreferences } from "@/lib/automation/repository.mjs";
import { encryptCredentials } from "@/lib/automation/vault.mjs";
import { fetchTrends } from "@/lib/automation/trends.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
export async function POST(request) {
  try {
    const user = await sessionUser(request, true);
    const body = await readBody(request);
    const database = getDatabase();
    if (body.action === "mode") {
      if (typeof body.enabled !== "boolean") throw new AutomationError("invalid_mode", "Choose ON or OFF.");
      if (body.enabled) await requireInfrastructure();
      await setMode(database, user.id, body.enabled);
    } else if (body.action === "preferences") {
      const preferences = preferencesInput(body);
      if (preferences.topicSource === "google_trends") { await reserveVerification(database, user.id); await fetchTrends(preferences.trendRegion); }
      await updatePreferences(database, user.id, preferences);
    } else if (body.action === "disconnect") {
      if (body.confirm !== true) throw new AutomationError("confirmation_required", "Confirm removal of saved connections.");
      await disconnectAccount(database, user.id);
    } else if (body.action === "connect") {
      await requireInfrastructure();
      if (body.consent !== true || typeof body.activate !== "boolean") throw new AutomationError("consent_required", "Confirm automated publishing permission and provider API usage first.");
      const preferences = preferencesInput(body);
      const config = connectionInput(body.connections);
      await reserveVerification(database, user.id);
      if (preferences.topicSource === "google_trends") await fetchTrends(preferences.trendRegion);
      const summary = await verifyConnections(config);
      await connectAccount(database, user.id, { ...preferences, encrypted: encryptCredentials(user.id, config), summary, activate: body.activate });
    } else throw new AutomationError("invalid_action", "Choose a supported automation action.");
    return json(await automationResponse(user));
  } catch (error) { return apiError(error); }
}
