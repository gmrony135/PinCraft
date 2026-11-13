import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, fetch } from "undici";
import { AutomationError } from "./errors.mjs";

const FIXED_HOSTS = new Set(["api.openai.com", "generativelanguage.googleapis.com", "api.pinterest.com", "www.googleapis.com", "oauth2.googleapis.com", "trends.google.com"]);
export function publicIP(value) { try { return ipaddr.process(value).range() === "unicast"; } catch { return false; } }
export function httpsURL(value) {
  let url;
  try { url = new URL(value); } catch { throw new AutomationError("invalid_url", "Enter a valid public HTTPS URL."); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || url.hash || /[\\\s]/.test(value)) throw new AutomationError("invalid_url", "Only public HTTPS URLs without credentials, fragments or custom ports are allowed.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || !hostname.includes(".") || (isIP(hostname) && !publicIP(hostname)) || /\.(localhost|local|internal|test|invalid)$/.test(hostname)) throw new AutomationError("private_url", "Private/internal network addresses are not allowed.");
  return url;
}
export async function publicAddresses(hostname, resolver = lookup) {
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await resolver(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !publicIP(entry.address))) throw new AutomationError("private_url", "This host does not resolve exclusively to public network addresses.");
  return addresses.sort((a, b) => a.family - b.family);
}
export async function requestData(value, options = {}) {
  const { provider = "Provider", mutation = false, publicHost = false, timeout = 25000, format = "json", ...init } = options;
  const url = httpsURL(value);
  if (!publicHost && !FIXED_HOSTS.has(url.hostname)) throw new AutomationError("invalid_provider", "This API host is not supported.");
  let agent;
  try {
    if (publicHost) {
      const addresses = await publicAddresses(url.hostname);
      // Validate every DNS result, then pin the actual TCP lookup: no rebinding.
      agent = new Agent({ connect: { lookup: (_host, opts, cb) => opts.all ? cb(null, addresses) : cb(null, addresses[0].address, addresses[0].family) } });
    }
    const response = await fetch(url, { ...init, dispatcher: agent, redirect: "error", signal: AbortSignal.timeout(timeout) });
    if (!response.ok) {
      await response.body?.cancel();
      const auth = response.status === 401 || response.status === 403;
      throw new AutomationError(auth ? "provider_auth" : "provider_request", `${provider} returned HTTP ${response.status}. ${auth ? "Check its token, permissions and account access." : "Check the connection and provider quota."}`, { retryable: response.status === 429 || (!mutation && response.status >= 500), uncertain: mutation && response.status >= 500, status: 422 });
    }
    if (Number(response.headers.get("content-length")) > 900000) { await response.body?.cancel(); throw new Error("Response too large"); }
    const reader = response.body.getReader(); let length = 0; const chunks = [];
    for (;;) { const { value: chunk, done } = await reader.read(); if (done) break; length += chunk.byteLength; if (length > 900000) { await reader.cancel(); throw new Error("Response too large"); } chunks.push(Buffer.from(chunk)); }
    const bytes = Buffer.concat(chunks);
    if (format === "bytes") return bytes;
    const text = bytes.toString("utf8");
    if (format === "text") return text;
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof AutomationError) throw error;
    throw new AutomationError("provider_unavailable", `${provider} could not confirm its response. ${mutation ? "The remote result is uncertain; automatic reposting is blocked to prevent duplicates." : "It will be retried within the attempt limit."}`, { retryable: !mutation, uncertain: mutation, status: 422 });
  } finally { if (agent) await agent.close(); }
}
export const requestJSON = (value, options) => requestData(value, options);
