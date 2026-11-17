// GitHub Actions bridge for the daily, non-publishing Google Trends snapshot.
// The runner receives no AI keys, user data, Pinterest credentials or Pin content.
import { pathToFileURL } from 'node:url';

const origin = 'https://pincraftly.vercel.app';
const path = '/api/internal/trend-finder/snapshot';

async function boundedJSON(response, maxBytes = 12_000) {
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

export async function requestTrendFinderSnapshot({ send = fetch, environment = process.env } = {}) {
  if (environment.GITHUB_ACTIONS !== 'true' || environment.GITHUB_REPOSITORY !== 'gmrony135/PinCraft' || environment.GITHUB_REF !== 'refs/heads/main' || !['schedule', 'workflow_dispatch'].includes(environment.GITHUB_EVENT_NAME)) return { outcome: 'not_trusted_actions' };
  try {
    if (!environment.ACTIONS_ID_TOKEN_REQUEST_URL || !environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN) return { outcome: 'oidc_unavailable' };
    const requestURL = new URL(environment.ACTIONS_ID_TOKEN_REQUEST_URL);
    if (requestURL.protocol !== 'https:' || !requestURL.hostname.endsWith('.actions.githubusercontent.com') || requestURL.username || requestURL.password || requestURL.port) return { outcome: 'oidc_unavailable' };
    requestURL.searchParams.set('audience', origin + path);
    const issued = await send(requestURL, {
      method: 'GET',
      redirect: 'error',
      headers: { Authorization: `Bearer ${environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!issued.ok) { await issued.body?.cancel(); return { outcome: 'oidc_unavailable' }; }
    const token = (await boundedJSON(issued, 24_000)).value;
    if (typeof token !== 'string' || token.length < 100 || token.length > 19_000) return { outcome: 'oidc_unavailable' };

    const response = await send(origin + path, {
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(55_000),
    });
    if (!response.ok) { await response.body?.cancel(); return { outcome: response.status === 401 ? 'workload_not_authorized' : 'collection_unavailable' }; }
    const result = await boundedJSON(response);
    if (result.ok !== true || !['collected', 'already_collected'].includes(result.outcome) || !/^\d{4}-\d{2}-\d{2}$/.test(result.snapshotDate || '')) return { outcome: 'collection_unconfirmed' };
    const counts = Object.fromEntries(['US', 'GB', 'CA'].map(region => [region, Number.isInteger(result.counts?.[region]) && result.counts[region] >= 0 && result.counts[region] <= 40 ? result.counts[region] : 0]));
    return { outcome: result.outcome, snapshotDate: result.snapshotDate, counts };
  } catch {
    // Do not log a bearer token, OIDC response body, headers, or trend content.
    return { outcome: 'collection_unconfirmed' };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await requestTrendFinderSnapshot();
  console.log(JSON.stringify(result));
  if (['not_trusted_actions', 'oidc_unavailable', 'workload_not_authorized', 'collection_unavailable', 'collection_unconfirmed'].includes(result.outcome)) process.exitCode = 1;
}
