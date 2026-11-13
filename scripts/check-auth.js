// Offline cryptographic/auth guard tests. These are NOT a live Google OAuth test.
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { randomBytes } = require("node:crypto");
const results = [];
function check(name, pass) { results.push({ name, pass: Boolean(pass) }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}`); }
async function rejects(action) { try { await action(); return false; } catch { return true; } }

async function run() {
  const jose = await import("jose");
  // Strip only Next's server-only build marker for the standalone Node test.
  const source = fs.readFileSync(path.join(__dirname, "../lib/auth-server.js"), "utf8").replace('import "server-only";', "").replace('from "jose"', `from ${JSON.stringify(pathToFileURL(require.resolve("jose")).href)}`);
  const auth = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const original = { clientId: process.env.GOOGLE_CLIENT_ID, secret: process.env.AUTH_SESSION_SECRET, url: process.env.APP_URL };
  try {
    delete process.env.GOOGLE_CLIENT_ID; delete process.env.AUTH_SESSION_SECRET; delete process.env.APP_URL;
    check("Missing OAuth configuration fails closed", !auth.authSettings().configured);
    process.env.GOOGLE_CLIENT_ID = "unit-test.apps.googleusercontent.com";
    process.env.AUTH_SESSION_SECRET = "too-short";
    check("Short session secrets are not accepted", !auth.authSettings().configured);
    process.env.AUTH_SESSION_SECRET = randomBytes(48).toString("base64url");
    check("Valid Web Client ID + strong secret enable the auth foundation", auth.authSettings().configured);
    const config = auth.authSettings();
    process.env.GOOGLE_CLIENT_ID = "not-a-google-web-client";
    check("Malformed Google client IDs stay unconfigured", !auth.authSettings().configured);

    const firstNonce = auth.createNonce();
    const secondNonce = auth.createNonce();
    check("Nonces are random 256-bit hexadecimal values", /^[a-f0-9]{64}$/.test(firstNonce) && firstNonce !== secondNonce);
    check("Only the exact nonce matches", auth.matchingNonce(firstNonce, firstNonce) && !auth.matchingNonce(firstNonce, secondNonce));
    check("Missing, non-string and multibyte nonce inputs are rejected safely", !auth.matchingNonce(null, firstNonce) && !auth.matchingNonce(7, firstNonce) && !auth.matchingNonce("é".repeat(64), firstNonce));

    const http = new Request("http://localhost:3000/api/auth/google", { method: "POST", headers: { origin: "http://localhost:3000" } });
    const secure = new Request("https://pincraftly.vercel.app/api/auth/google", { method: "POST", headers: { origin: "https://pincraftly.vercel.app" } });
    check("Sessions use HttpOnly, SameSite=Lax and one-week lifetime", auth.cookieOptions(http).httpOnly && auth.cookieOptions(http).sameSite === "lax" && auth.cookieOptions(http).maxAge === 604800 && auth.cookieOptions(http).path === "/");
    check("HTTPS sessions are Secure; localhost HTTP remains testable", auth.cookieOptions(secure).secure && !auth.cookieOptions(http).secure);
    check("Forwarded HTTPS also receives Secure cookies", auth.cookieOptions(new Request("http://localhost/api", { headers: { "x-forwarded-proto": "https" } })).secure);
    check("Same-origin Google sign-in requests are accepted", auth.sameOrigin(http) && auth.sameOrigin(secure));
    check("Next's internal 0.0.0.0 URL correctly honors the actual Host", auth.sameOrigin(new Request("http://0.0.0.0:3000/api", { headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" } })));
    check("Trusted HTTPS reverse-proxy host/origin is supported", auth.sameOrigin(new Request("http://0.0.0.0:3000/api", { headers: { "x-forwarded-host": "preview.example.test", "x-forwarded-proto": "https", origin: "https://preview.example.test" } })));
    check("Reverse proxy support still rejects a foreign origin", !auth.sameOrigin(new Request("http://0.0.0.0:3000/api", { headers: { "x-forwarded-host": "preview.example.test", "x-forwarded-proto": "https", origin: "https://attacker.invalid" } })));
    check("Foreign or missing origins are rejected", !auth.sameOrigin(new Request("https://pincraftly.vercel.app/api/auth/google", { headers: { origin: "https://attacker.invalid" } })) && !auth.sameOrigin(new Request("https://pincraftly.vercel.app/api/auth/google")));
    process.env.APP_URL = "https://pincraftly.vercel.app";
    check("Explicit canonical origin is supported behind a proxy", auth.sameOrigin(new Request("http://internal.local/api", { headers: { origin: "https://pincraftly.vercel.app" } })));
    process.env.APP_URL = "not-a-url";
    check("Malformed canonical origins do not bypass CSRF checks", !auth.sameOrigin(new Request("http://internal.local/api", { headers: { origin: "https://attacker.invalid" } })));

    const payload = { sub: "offline-test-subject", name: "Test Creator", email: "creator@example.test", email_verified: true, nonce: firstNonce };
    const profile = auth.publicProfile(payload);
    check("Public profile returns only ID/name, never a Gmail/email address", Object.keys(profile).sort().join("|") === "id|name" && profile.name === "Test Creator");
    check("Unverified email claims cannot create an account", await rejects(() => auth.publicProfile({ ...payload, email_verified: false })));
    check("Incomplete identity claims are rejected", await rejects(() => auth.publicProfile({ ...payload, sub: null })));
    check("Blank display names use Creator without saving an email prefix", auth.publicProfile({ ...payload, name: "   " }).name === "Creator");

    const { privateKey, publicKey } = await jose.generateKeyPair("RS256");
    async function identity(claims = payload, options = {}) {
      return new jose.SignJWT(claims).setProtectedHeader({ alg: "RS256" }).setIssuer(options.issuer || "https://accounts.google.com").setAudience(options.audience || config.clientId).setIssuedAt(options.issuedAt ?? Math.floor(Date.now() / 1000)).setExpirationTime(options.expires || "5m").sign(privateKey);
    }
    const credential = await identity();
    const verified = await auth.verifyGoogleCredential(credential, firstNonce, config, publicKey);
    check("RS256 signatures, issuer, audience and nonce are verified together", verified.id === payload.sub && verified.name === payload.name);
    check("Wrong audience is rejected", await rejects(async () => auth.verifyGoogleCredential(await identity(payload, { audience: "another.apps.googleusercontent.com" }), firstNonce, config, publicKey)));
    check("Wrong issuer is rejected", await rejects(async () => auth.verifyGoogleCredential(await identity(payload, { issuer: "https://attacker.invalid" }), firstNonce, config, publicKey)));
    check("Expired identity tokens are rejected", await rejects(async () => auth.verifyGoogleCredential(await identity(payload, { expires: "-1m" }), firstNonce, config, publicKey)));
    check("Stale identity tokens are rejected even before expiry", await rejects(async () => auth.verifyGoogleCredential(await identity(payload, { issuedAt: Math.floor(Date.now() / 1000) - 1200 }), firstNonce, config, publicKey)));
    check("Wrong OAuth nonce is rejected", await rejects(() => auth.verifyGoogleCredential(credential, secondNonce, config, publicKey)));
    check("Unsigned or client-invented credentials are rejected", await rejects(() => auth.verifyGoogleCredential("not.a.google-token", firstNonce, config, publicKey)));
    check("Credential verification is disabled without real configuration", await rejects(() => auth.verifyGoogleCredential(credential, firstNonce, { configured: false }, publicKey)));
    check("Oversized credentials are rejected", await rejects(() => auth.verifyGoogleCredential("x".repeat(12001), firstNonce, config, publicKey)));

    const session = await auth.createSession({ ...profile, email: payload.email }, config);
    check("Signed session claims never persist an email/Gmail address", !Object.hasOwn(jose.decodeJwt(session), "email"));
    check("Server-signed sessions round-trip to the verified profile", JSON.stringify(await auth.readSession(session, config)) === JSON.stringify(profile));
    const parts = session.split(".");
    parts[1] = Buffer.from(JSON.stringify({ sub: "spoof", name: "Forged account" })).toString("base64url");
    check("Changing a signed session never changes the authenticated user", await auth.readSession(parts.join("."), config) === null);
    check("A different signing secret cannot read the session", await auth.readSession(session, { ...config, secret: randomBytes(40).toString("hex") }) === null);
    check("Missing or oversized sessions are treated as guests", await auth.readSession(null, config) === null && await auth.readSession("x".repeat(5001), config) === null);
    check("Session creation is impossible while OAuth is unconfigured", await rejects(() => auth.createSession(profile, { configured: false })));
  } finally {
    for (const [name, value] of [["GOOGLE_CLIENT_ID", original.clientId], ["AUTH_SESSION_SECRET", original.secret], ["APP_URL", original.url]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
  fs.mkdirSync(path.join(__dirname, "../.shots"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "../.shots/auth-verification.json"), JSON.stringify({ testMode: "offline keys only; not live Google OAuth", results }, null, 2));
  console.log(`\n${results.filter((result) => result.pass).length}/${results.length} auth guard checks passed`);
  if (results.some((result) => !result.pass)) process.exitCode = 1;
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
