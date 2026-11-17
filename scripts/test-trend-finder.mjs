import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { generateKeyPair, SignJWT } from 'jose';
import { PRODUCT_NAV } from '../lib/product.mjs';
import {
  ESTIMATE_METHOD,
  TREND_FINDER_REGIONS,
  hasConsecutiveDailySnapshots,
  parseGoogleTrendsRSS,
  parseTrafficBucketFloor,
  publicTrendReport,
  snapshotIsFresh,
  trendIdentity,
  utcSnapshotDate,
} from '../lib/trend-finder/core.mjs';
import { collectDailyTrendSnapshot, fetchDailyTrendSnapshot } from '../lib/trend-finder/service.mjs';
import { trendWorkloadConfig, verifyTrendWorkload } from '../lib/trend-finder/workload.mjs';
import { trendIdeasTask, validateTrendIdeas } from '../lib/ai/trend-ideas.mjs';
import { requestTrendFinderSnapshot } from './run-trend-finder-snapshot.mjs';

const regionCodes = ['US', 'GB', 'CA'];
const code = expected => error => { assert.equal(error.code, expected); return true; };
const iso = day => new Date(`${day}T07:00:00.000Z`);
const escapeXML = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function feed(rows) {
  return `<?xml version="1.0"?><rss version="2.0"><channel>${rows.map(row => `<item><title>${escapeXML(row.title)}</title><ht:approx_traffic>${escapeXML(row.traffic)}</ht:approx_traffic></item>`).join('')}</channel></rss>`;
}
function snapshot(day, rowsByRegion = {}) {
  return {
    snapshotDate: day,
    capturedAt: iso(day),
    source: 'Google Trends Trending Now RSS',
    regions: Object.fromEntries(regionCodes.map(region => [region, {
      items: (rowsByRegion[region] || []).map(row => ({
        id: trendIdentity(region, row.title),
        title: row.title,
        trafficBucket: row.traffic,
        trafficBucketFloor: parseTrafficBucketFloor(row.traffic),
      })),
    }])),
  };
}

class FakeDatabase {
  constructor() { this.rows = new Map(); }
  collection(name) {
    return { doc: id => {
      const path = `${name}/${id}`;
      return {
        path,
        get: async () => ({ exists: this.rows.has(path), data: () => this.rows.get(path) }),
      };
    } };
  }
  async runTransaction(task) {
    const tx = {
      get: async ref => ({ exists: this.rows.has(ref.path), data: () => this.rows.get(ref.path) }),
      create: (ref, value) => {
        if (this.rows.has(ref.path)) throw new Error('Document already exists');
        this.rows.set(ref.path, value);
      },
    };
    return task(tx);
  }
}

test('The feature is limited to US, UK and Canada, with stable trend IDs and safe traffic-bucket parsing', () => {
  assert.deepEqual(TREND_FINDER_REGIONS.map(row => row.code), regionCodes);
  assert.equal(trendIdentity('US', '  Summer   decor! '), trendIdentity('US', 'summer decor'));
  assert.notEqual(trendIdentity('US', 'summer decor'), trendIdentity('GB', 'summer decor'));
  assert.equal(trendIdentity('XX', 'summer decor'), null);
  for (const [value, expected] of [['100+', 100], ['2K+', 2000], ['1.5M+', 1_500_000], ['1,200+', 1200], ['0+', null], ['volume', null], ['1e6+', null]]) assert.equal(parseTrafficBucketFloor(value), expected, value);
  assert.equal(utcSnapshotDate(iso('2026-11-13')), '2026-11-13');
});

test('The RSS parser keeps only bounded trend text and approximate-traffic buckets; it rejects XML entity expansion inputs', () => {
  const rows = parseGoogleTrendsRSS(feed([{ title: 'Garden & patio ideas', traffic: '2K+' }, { title: 'Summer Style', traffic: '100+' }, { title: 'garden & patio ideas', traffic: '5K+' }]), 'US');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'Garden & patio ideas');
  assert.equal(rows[0].trafficBucketFloor, 2000);
  assert.match(rows[0].id, /^[a-f0-9]{64}$/);
  assert.equal(parseGoogleTrendsRSS(feed([{ title: 'Trend without a bucket', traffic: '' }]), 'GB')[0].trafficBucketFloor, null);
  const cdata = '<rss><item><title><![CDATA[Warm & sunny]]></title><ht:approx_traffic>100+</ht:approx_traffic></item></rss>';
  assert.equal(parseGoogleTrendsRSS(cdata, 'CA')[0].title, 'Warm & sunny');
  for (const value of ['<!DOCTYPE rss><rss/>', '<!ENTITY x SYSTEM "file:///secret">', '<rss><item><title>&unknown;</title></item></rss>', 'x'.repeat(256_001)]) assert.throws(() => parseGoogleTrendsRSS(value, 'US'));
  assert.throws(() => parseGoogleTrendsRSS(feed([]), 'CA'), code('trends_unavailable'));
  assert.throws(() => parseGoogleTrendsRSS(feed([{ title: 'valid term', traffic: '100+' }]), 'XX'), code('invalid_region'));
});

test('PinCraft estimates compare only matching trends across consecutive daily snapshots and never invent a baseline', () => {
  const prior = snapshot('2026-11-12', {
    US: [{ title: 'Garden ideas', traffic: '100+' }, { title: 'Steady topic', traffic: '500+' }],
  });
  const current = snapshot('2026-11-13', {
    US: [{ title: 'Garden ideas', traffic: '500+' }, { title: 'Steady topic', traffic: '500+' }, { title: 'New topic', traffic: '1K+' }],
  });
  const report = publicTrendReport(current, prior, iso('2026-11-13').getTime());
  const ideas = report.regions.find(row => row.code === 'US').trends;
  assert.equal(ideas[0].pinCraftEstimate.status, 'ready');
  assert.equal(ideas[0].pinCraftEstimate.percent, 400);
  assert.equal(ideas[0].pinCraftEstimate.comparedDate, '2026-11-12');
  assert.equal(ideas[1].pinCraftEstimate.percent, 0);
  assert.equal(ideas[2].pinCraftEstimate.status, 'no_matching_trend');
  assert.equal(ideas[2].pinCraftEstimate.percent, null);
  assert.equal(Object.hasOwn(ideas[0], 'trafficBucketFloor'), false);
  assert.equal(report.estimateMethod, ESTIMATE_METHOD);
  assert.match(report.estimateMethod, /not Google’s official growth percentage/);

  assert.equal(publicTrendReport(current, null).regions[0].trends[0].pinCraftEstimate.status, 'baseline_building');
  assert.equal(publicTrendReport(current, snapshot('2026-11-10')).regions[0].trends[0].pinCraftEstimate.status, 'snapshot_gap');
  const noBucket = snapshot('2026-11-13', { US: [{ title: 'Garden ideas', traffic: '' }] });
  assert.equal(publicTrendReport(noBucket, prior).regions[0].trends[0].pinCraftEstimate.status, 'traffic_bucket_unavailable');
  assert.equal(hasConsecutiveDailySnapshots('2026-03-01', '2026-02-28'), true);
  assert.equal(hasConsecutiveDailySnapshots('2026-11-13', '2026-11-11'), false);
});

test('Daily snapshot freshness is explicit and missing/future capture times are not accepted', () => {
  const current = { capturedAt: iso('2026-11-13') };
  assert.equal(snapshotIsFresh(current, iso('2026-11-14').getTime()), true);
  assert.equal(snapshotIsFresh(current, iso('2026-11-16').getTime()), false);
  assert.equal(snapshotIsFresh({ capturedAt: iso('2026-11-15') }, iso('2026-11-13').getTime()), false);
  assert.equal(snapshotIsFresh({}, Date.now()), false);
});

test('All three feeds are fetched and parsed before one complete snapshot is returned', async () => {
  const urls = [];
  const data = await fetchDailyTrendSnapshot({
    now: iso('2026-11-13'),
    send: async url => { urls.push(String(url)); const code = new URL(url).searchParams.get('geo'); return feed([{ title: `${code} topic`, traffic: '200+' }]); },
  });
  assert.equal(data.snapshotDate, '2026-11-13');
  assert.equal(data.regions.US.items[0].title, 'US topic');
  assert.deepEqual(urls.map(url => new URL(url).searchParams.get('geo')).sort(), regionCodes.slice().sort());
  await assert.rejects(() => fetchDailyTrendSnapshot({ send: async url => String(url).includes('geo=CA') ? '<html>blocked</html>' : feed([{ title: 'Other topic', traffic: '100+' }]) }));
});

test('Collection is atomic and idempotent for a UTC date; a failed region does not save a partial snapshot', async () => {
  const db = new FakeDatabase();
  let calls = 0;
  const first = await collectDailyTrendSnapshot({ db, now: iso('2026-11-13'), send: async url => { calls++; const region = new URL(url).searchParams.get('geo'); return feed([{ title: `${region} daily topic`, traffic: '200+' }]); } });
  assert.equal(first.outcome, 'collected');
  assert.deepEqual(first.counts, { US: 1, GB: 1, CA: 1 });
  assert.equal(calls, 3);
  const duplicate = await collectDailyTrendSnapshot({ db, now: iso('2026-11-13'), send: async () => { throw new Error('same-day request should not refetch'); } });
  assert.equal(duplicate.outcome, 'already_collected');
  assert.equal(db.rows.size, 1);
  await assert.rejects(() => collectDailyTrendSnapshot({ db, now: iso('2026-11-14'), send: async url => String(url).includes('geo=CA') ? '<html>blocked</html>' : feed([{ title: 'Other topic', traffic: '100+' }]) }));
  assert.equal(db.rows.size, 1);
});

test('Only the exact public main-branch workflow and matching production SHA can authorize collection', async () => {
  const config = {
    configured: true,
    repository: 'gmrony135/PinCraft',
    repositoryId: '1456649831',
    workflow: 'gmrony135/PinCraft/.github/workflows/pincraft-trend-finder.yml@refs/heads/main',
    audience: 'https://pincraftly.vercel.app/api/internal/trend-finder/snapshot',
    deploymentSHA: 'a'.repeat(40),
  };
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  async function token(patch = {}, options = {}) {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      repository_id: config.repositoryId,
      repository: config.repository,
      repository_visibility: 'public',
      ref: 'refs/heads/main',
      workflow_ref: config.workflow,
      sha: config.deploymentSHA,
      event_name: 'schedule',
      run_id: '123456789',
      run_attempt: '1',
      jti: 'test-jti-value-0001',
      ...patch,
    };
    return new SignJWT(claims).setProtectedHeader({ alg: 'RS256' }).setIssuer('https://token.actions.githubusercontent.com').setAudience(options.audience || config.audience).setIssuedAt(now + (options.age || 0)).setExpirationTime(now + (options.expiry ?? 300)).sign(privateKey);
  }
  const verified = await verifyTrendWorkload(`Bearer ${await token()}`, { config, resolveKey: publicKey });
  assert.match(verified.executionId, /^github-trend-snapshot:/);
  for (const patch of [
    { repository_id: '1' }, { repository: 'attacker/repo' }, { repository_visibility: 'private' },
    { ref: 'refs/heads/other' }, { workflow_ref: 'attacker.yml' }, { sha: 'b'.repeat(40) },
    { event_name: 'pull_request' }, { jti: 'short' },
  ]) {
    const signed = await token(patch);
    await assert.rejects(() => verifyTrendWorkload(`Bearer ${signed}`, { config, resolveKey: publicKey }), code('worker_unauthorized'));
  }
  const wrongAudience = await token({}, { audience: 'https://wrong.example' });
  await assert.rejects(() => verifyTrendWorkload(`Bearer ${wrongAudience}`, { config, resolveKey: publicKey }), code('worker_unauthorized'));
  const staleToken = await token({}, { age: -700 });
  await assert.rejects(() => verifyTrendWorkload(`Bearer ${staleToken}`, { config, resolveKey: publicKey }), code('worker_unauthorized'));
  const signed = await token();
  await assert.rejects(() => verifyTrendWorkload(`Bearer ${signed}`, { config: { ...config, configured: false }, resolveKey: publicKey }), code('worker_unauthorized'));
});

test('Idea generation validates three structured concepts and labels audience and performance honestly', () => {
  const input = { trend: 'Small balcony garden', region: 'United States', language: 'en' };
  const task = trendIdeasTask(input);
  assert.match(task.prompt, /untrusted topic data/);
  assert.match(task.prompt, /Do not claim the topic is popular on Pinterest/);
  assert.equal(task.maxTokens, 2400);
  const makeIdea = suffix => ({
    pinTitle: `Helpful balcony guide ${suffix}`,
    concept: 'A practical visual guide that helps a reader compare a few small-space planting layouts.',
    likelyAudience: 'People looking for approachable ideas for compact outdoor spaces.',
    contentStrategy: { format: 'Quick visual guide', hook: 'Start with a clear small-space question.', visualDirection: 'Show a simple overhead layout with readable plant groupings.', coreTakeaway: 'Give one useful layout choice and a brief reason.', callToAction: 'Save this layout for planning.' },
    keywordSuggestions: [`balcony garden ${suffix}`, `small-space planting ${suffix}`, `compact patio ideas ${suffix}`],
  });
  const valid = validateTrendIdeas({ ideas: [makeIdea('one'), makeIdea('two'), makeIdea('three')] }, input);
  assert.equal(valid.ideas.length, 3);
  assert.equal(valid.region, input.region);
  assert.match(valid.note, /hypothesis/);
  assert.throws(() => validateTrendIdeas({ ideas: [makeIdea('one'), makeIdea('two')] }, input), code('invalid_content'));
  assert.throws(() => validateTrendIdeas({ ideas: [makeIdea('one'), makeIdea('two'), { ...makeIdea('three'), concept: 'https://example.com' }] }, input), code('invalid_content'));
});

test('The scheduled client requests the OIDC audience and sends no trend or user payload', async () => {
  const sent = [];
  const environment = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'gmrony135/PinCraft', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'schedule', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.actions.githubusercontent.com/oidc?existing=1', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'runner-secret' };
  const result = await requestTrendFinderSnapshot({ environment, send: async (url, options) => {
    sent.push({ url: String(url), options });
    if (sent.length === 1) return new Response(JSON.stringify({ value: 'x'.repeat(200) }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ ok: true, outcome: 'collected', snapshotDate: '2026-11-13', counts: { US: 10, GB: 9, CA: 8 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  } });
  assert.equal(result.outcome, 'collected');
  assert.deepEqual(result.counts, { US: 10, GB: 9, CA: 8 });
  assert.equal(new URL(sent[0].url).searchParams.get('audience'), 'https://pincraftly.vercel.app/api/internal/trend-finder/snapshot');
  assert.equal(sent[1].options.body, '{}');
  assert.match(sent[1].options.headers.Authorization, /^Bearer /);
  assert.equal((await requestTrendFinderSnapshot({ environment: { ...environment, GITHUB_REF: 'refs/pull/1/merge' }, send: async () => { throw new Error('must not send'); } })).outcome, 'not_trusted_actions');
});

test('The dedicated page and main navigation keep publishing manual-only', async () => {
  assert(PRODUCT_NAV.some(item => item.label === 'AI Trend Finder Automation' && item.href === '/trend-finder'));
  const page = await readFile(new URL('../app/trend-finder/page.js', import.meta.url), 'utf8');
  const ui = await readFile(new URL('../components/trend-finder/TrendFinder.js', import.meta.url), 'utf8');
  const workflow = await readFile(new URL('../.github/workflows/pincraft-trend-finder.yml', import.meta.url), 'utf8');
  assert.match(page, /AI Trend Finder Automation/);
  assert.match(ui, /PinCraft estimate/);
  assert.match(ui, /No estimate is shown/);
  assert.match(ui, /publishing remains manual/i);
  assert.match(ui, /does not connect to Pinterest or publish Pins/i);
  assert.match(workflow, /43 6 \* \* \*/);
  assert.match(workflow, /id-token: write/);
  assert(!workflow.includes('PINTEREST_API'));
});
