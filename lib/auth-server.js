import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "pincraft.session.v1";
export const NONCE_COOKIE = "pincraft.google.nonce";
export const SESSION_SECONDS = 60 * 60 * 24 * 7;
const GoogleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), { timeoutDuration: 5000 });

export function authSettings() {
  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  const secret = process.env.AUTH_SESSION_SECRET || "";
  const configured = /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId) && secret.length >= 32;
  return { configured, clientId, secret };
}

export function cookieOptions(request, maxAge = SESSION_SECONDS) {
  return { httpOnly: true, secure: new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https", sameSite: "lax", path: "/", maxAge };
}

export function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const incoming = new URL(request.url);
  const allowed = new Set([incoming.origin]);
  // Next's internal URL may use 0.0.0.0 behind its server/proxy. Compare with
  // the actual request authority, not the Origin header itself. Browsers cannot
  // set Host/Forwarded headers on a cross-origin form; our API enables no CORS.
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0].trim();
  const protocol = (request.headers.get("x-forwarded-proto") || incoming.protocol.replace(":", "")).split(",")[0].trim();
  if (host && (protocol === "https" || protocol === "http")) {
    try { allowed.add(new URL(`${protocol}://${host}`).origin); } catch { /* Invalid authorities are not allowed. */ }
  }
  try { if (process.env.APP_URL) allowed.add(new URL(process.env.APP_URL).origin); } catch { /* Invalid config adds no origin. */ }
  return allowed.has(origin);
}

export function createNonce() { return randomBytes(32).toString("hex"); }

export function matchingNonce(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(actual) || !/^[a-f0-9]{64}$/.test(expected)) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function publicProfile(payload) {
  if (!payload || typeof payload.sub !== "string" || !payload.sub || typeof payload.email !== "string" || payload.email_verified !== true) throw new Error("A verified Google account is required.");
  // Verify Google's email claim transiently, but never persist/return the address.
  return { id: payload.sub.slice(0, 128), name: (typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : "Creator").slice(0, 80) };
}

export async function verifyGoogleCredential(credential, nonce, config = authSettings(), keys = GoogleKeys) {
  if (!config.configured || typeof credential !== "string" || credential.length > 12000 || !nonce) throw new Error("Google sign-in is not ready.");
  const { payload } = await jwtVerify(credential, keys, { algorithms: ["RS256"], audience: config.clientId, issuer: ["https://accounts.google.com", "accounts.google.com"], maxTokenAge: "10m", clockTolerance: 5 });
  if (!matchingNonce(payload.nonce, nonce)) throw new Error("The sign-in request expired. Please try again.");
  return publicProfile(payload);
}

export async function createSession(user, config = authSettings()) {
  if (!config.configured) throw new Error("Authentication is not configured.");
  return new SignJWT({ name: user.name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(user.id)
    .setIssuer("pincraft").setAudience("pincraft-session").setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`).sign(new TextEncoder().encode(config.secret));
}

export async function readSession(token, config = authSettings()) {
  if (!token || !config.configured || typeof token !== "string" || token.length > 5000) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(config.secret), { algorithms: ["HS256"], issuer: "pincraft", audience: "pincraft-session" });
    if (typeof payload.sub !== "string" || !payload.sub || typeof payload.name !== "string" || !payload.name.trim()) return null;
    return { id: payload.sub, name: payload.name };
  } catch { return null; }
}
