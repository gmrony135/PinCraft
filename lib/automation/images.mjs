import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { vaultReady } from "./vault.mjs";
import { httpsURL } from "./http.mjs";
import { AutomationError } from "./errors.mjs";
export const validJobId = (id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
export function imageOrigin() {
  try { const url = httpsURL(process.env.APP_URL); if (url.pathname !== "/" || url.search) return null; return url.origin; } catch { return null; }
}
export function imageSignature(id) {
  if (!vaultReady() || !validJobId(id)) throw new AutomationError("image_setup_required", "The signed Pin image service needs configuration.", { status: 503 });
  return createHmac("sha256", Buffer.from(process.env.AUTOMATION_ENCRYPTION_KEY, "base64")).update(`pincraft-image:v1:${id}`).digest("base64url");
}
export function validImageSignature(id, signature) {
  try { if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return false; return timingSafeEqual(Buffer.from(signature), Buffer.from(imageSignature(id))); } catch { return false; }
}
export function pinImageURL(id) {
  const origin = imageOrigin(); if (!origin) throw new AutomationError("image_origin_missing", "Set a public HTTPS APP_URL so Pinterest can fetch the generated image.", { status: 503 });
  return `${origin}/api/automation/image/${id}?sig=${imageSignature(id)}`;
}
