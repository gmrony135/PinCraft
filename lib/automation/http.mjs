import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, fetch } from "undici";
import { AutomationError } from "./errors.mjs";

const FIXED_HOSTS = new Set(["api.openai.com", "generativelanguage.googleapis.com", "api.groq.com", "api.cloudflare.com", "api.pinterest.com", "www.googleapis.com", "oauth2.googleapis.com", "trends.google.com", "news.google.com"]);
export function aiSafetyError(value) {
  const codes = [value?.error?.code, ...(Array.isArray(value?.errors) ? value.errors.map(item => item?.code) : [])];
  const messages = [value?.error?.message, ...(Array.isArray(value?.errors) ? value.errors.map(item => item?.message) : [])];
  return codes.some(code => [3030, '3030', 'content_policy_violation', 'content_filter', 'safety_violation'].includes(code)) || messages.some(message => typeof message === 'string' && /content.?filter|safety|moderation|prohibited|policy violation/i.test(message));
}
async function aiErrorDetails(response) {
  // Read only a small bounded error object for classification, never log or
  // return provider messages (they can echo input or credentials).
  const reader = response.body?.getReader(); if (!reader) return null;
  try { const chunks = []; let size = 0; for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 16000) { await reader.cancel(); return null; } chunks.push(Buffer.from(value)); } return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { try { await reader.cancel(); } catch {} return null; }
}
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
  let addresses;
  try { addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await resolver(host, { all: true, verbatim: true }); }
  catch { throw new AutomationError('public_host_unavailable', 'The URL hostname could not be resolved to a public server. Check the URL and try again.', { status: 422, retryable: true }); }
  if (!addresses.length || addresses.some((entry) => !publicIP(entry.address))) throw new AutomationError("private_url", "This host does not resolve exclusively to public network addresses.");
  return addresses.sort((a, b) => a.family - b.family);
}
export async function requestData(value, options = {}) {
  const { provider = "Provider", mutation = false, publicHost = false, timeout = 25000, format = "json", maxBytes = 900000, contentTypes = null, oauth = false, ai = false, ...init } = options;
  const url = httpsURL(value);
  if (!publicHost && !FIXED_HOSTS.has(url.hostname)) throw new AutomationError("invalid_provider", "This API host is not supported.");
  let agent, accepted = false;
  try {
    if (publicHost) {
      const addresses = await publicAddresses(url.hostname);
      // Validate every DNS result, then pin the actual TCP lookup: no rebinding.
      agent = new Agent({ connect: { lookup: (_host, opts, cb) => opts.all ? cb(null, addresses) : cb(null, addresses[0].address, addresses[0].family) } });
    }
    const response = await fetch(url, { ...init, dispatcher: agent, redirect: "error", signal: AbortSignal.timeout(timeout) });
    if (!response.ok) {
      const details = ai ? await aiErrorDetails(response) : null;
      if (!ai) await response.body?.cancel();
      if (ai && aiSafetyError(details)) throw new AutomationError('content_blocked', 'The AI provider declined this content. Rephrase the request; safety refusals are not sent to another provider.', { status: 422, upstreamStatus: response.status });
      const auth = response.status === 401 || response.status === 403;
      if (oauth && (response.status === 400 || auth)) throw new AutomationError('oauth_grant_rejected', 'The OAuth provider rejected offline authorization. Reconnect the affected provider.', { status: 409 });
      const retryAfter = response.headers.get('retry-after');
      throw new AutomationError(auth ? "provider_auth" : "provider_request", `${provider} returned HTTP ${response.status}. ${auth ? "Reconnect and check account permissions." : "Check the connection, post fields and provider quota."}`, { retryable: !auth && (response.status < 500 || !mutation), uncertain: mutation && response.status >= 500, status: 422, upstreamStatus: response.status, retryAfterSeconds: retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : null });
    }
    accepted = true; // From here, a mutation's body/size failure is not a rejection.
    if (contentTypes && !contentTypes.includes((response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase())) { await response.body?.cancel(); throw new AutomationError('image_unavailable', 'The public image URL must return PNG, JPEG or WebP bytes without a login or redirect.', { retryable: true }); }
    if (Number(response.headers.get("content-length")) > maxBytes) { await response.body?.cancel(); throw new AutomationError('response_too_large', 'The provider response or image exceeded the allowed size. Images must be at most 5 MB.'); }
    const reader = response.body.getReader(); let length = 0; const chunks = [];
    for (;;) { const { value: chunk, done } = await reader.read(); if (done) break; length += chunk.byteLength; if (length > maxBytes) { await reader.cancel(); throw new AutomationError('response_too_large', 'The provider response or image exceeded the allowed size. Images must be at most 5 MB.'); } chunks.push(Buffer.from(chunk)); }
    const bytes = Buffer.concat(chunks);
    if (format === "bytes") return bytes;
    const text = bytes.toString("utf8");
    if (format === "text") return text;
    return JSON.parse(text);
  } catch (error) {
    if (mutation && accepted) throw new AutomationError('publication_uncertain', `${provider} accepted the request but its response could not be validated. Inspect the saved result before retrying; automatic reposting is blocked.`, { uncertain: true, status: 422 });
    if (error instanceof AutomationError) throw error;
    throw new AutomationError("provider_unavailable", `${provider} could not confirm its response. ${mutation ? "The remote result is uncertain; automatic reposting is blocked to prevent duplicates." : "It will be retried within the attempt limit."}`, { retryable: !mutation, uncertain: mutation, status: 422 });
  } finally { if (agent) await agent.close(); }
}
export const requestJSON = (value, options) => requestData(value, options);
