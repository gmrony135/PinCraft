import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AutomationError } from "./errors.mjs";
const configuredKey=()=>process.env.AUTOMATION_ENCRYPTION_KEY||process.env.TOKEN_ENCRYPTION_KEY||"";
export function vaultReady() { const value = configuredKey(); if(process.env.AUTOMATION_ENCRYPTION_KEY&&process.env.TOKEN_ENCRYPTION_KEY&&process.env.AUTOMATION_ENCRYPTION_KEY!==process.env.TOKEN_ENCRYPTION_KEY)return false; return /^[A-Za-z0-9+/]{43}=$/.test(value) && Buffer.from(value, "base64").length === 32; }
function key() { if (!vaultReady()) throw new AutomationError("vault_missing", "Server-side secret encryption needs configuration.", { status: 503 }); return Buffer.from(configuredKey(), "base64"); }
export function encryptCredentials(userId, value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(`pincraft-auto:v1:${userId}`));
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}
export function decryptCredentials(userId, envelope) {
  try {
    const [version, iv, tag, data, extra] = String(envelope).split(":");
    if (version !== "v1" || extra || !iv || !tag || !data) throw new Error("Invalid envelope");
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAAD(Buffer.from(`pincraft-auto:v1:${userId}`)); decipher.setAuthTag(Buffer.from(tag, "base64"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8"));
  } catch { throw new AutomationError("vault_unreadable", "Saved connections could not be decrypted. Reconnect your accounts.", { status: 503 }); }
}
