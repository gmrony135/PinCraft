// GitHub Actions bridge for bounded owner-data integrity checks only.
// No Pinterest API, account credential, browser, Cookie, board or Pin mutation.
const origin = 'https://pincraftly.vercel.app';
const path = '/api/internal/pinterest-publishing/tick';

async function boundedJSON(response, maxBytes = 12000) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) { await response.body?.cancel(); throw new Error('Response too large'); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response unavailable');
  const chunks = []; let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) { await reader.cancel(); throw new Error('Response too large'); }
    chunks.push(Buffer.from(value));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function run() {
  const env = process.env;
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== 'gmrony135/PinCraft' || env.GITHUB_REF !== 'refs/heads/main' || !['schedule', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)) {
    return { outcome: 'not_trusted_actions' };
  }
  if (!env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) throw new Error('GitHub workload identity is unavailable');
  const oidcURL = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  if (oidcURL.protocol !== 'https:' || !oidcURL.hostname.endsWith('.actions.githubusercontent.com') || oidcURL.username || oidcURL.password || oidcURL.port) throw new Error('GitHub workload identity endpoint was rejected');
  oidcURL.searchParams.set('audience', origin + path);
  const issued = await fetch(oidcURL, {
    method: 'GET',
    redirect: 'error',
    headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!issued.ok) { await issued.body?.cancel(); throw new Error('GitHub workload identity request failed'); }
  const token = (await boundedJSON(issued, 24000)).value;
  if (typeof token !== 'string' || token.length < 100 || token.length > 19000) throw new Error('GitHub workload identity response was rejected');
  const response = await fetch(origin + path, {
    method: 'POST',
    redirect: 'error',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(85000),
  });
  if (response.status === 409) { await response.body?.cancel(); return { outcome: 'already_accepted' }; }
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Validation worker returned HTTP ${response.status}`); }
  const result = await boundedJSON(response);
  if (result.ok !== true) throw new Error('Validation worker did not confirm its result');
  const counts = Object.fromEntries(['dueCandidates', 'processed', 'verified', 'failed', 'retried'].map(key => [key, Number.isInteger(result[key]) && result[key] >= 0 && result[key] <= 10 ? result[key] : 0]));
  return { outcome: typeof result.outcome === 'string' ? result.outcome : 'unknown', ...counts, lastSeenAt: typeof result.lastSeenAt === 'string' ? result.lastSeenAt : null };
}

try {
  const summary = await run();
  console.log(JSON.stringify(summary));
  if (['not_trusted_actions'].includes(summary.outcome)) process.exitCode = 1;
} catch {
  // Do not log the bearer token, OIDC response body, request headers or content.
  console.error('Pinterest validation workflow failed. No Pinterest publication was attempted; a later scheduled run may retry safely.');
  process.exitCode = 1;
}
