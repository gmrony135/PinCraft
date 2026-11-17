import 'server-only';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AutomationError } from '../automation/errors.mjs';

const issuer = 'https://token.actions.githubusercontent.com';
const origin = 'https://pincraftly.vercel.app';
const path = '/api/internal/trend-finder/snapshot';
const workflow = 'gmrony135/PinCraft/.github/workflows/pincraft-trend-finder.yml@refs/heads/main';
const keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`));
export const TREND_WORKLOAD_PATH = path;

export function trendWorkloadConfig() {
  const deploymentSHA = process.env.VERCEL_GIT_COMMIT_SHA || '';
  return {
    configured: process.env.VERCEL_ENV === 'production' && process.env.APP_URL === origin && /^[a-f0-9]{40}$/.test(deploymentSHA),
    repository: 'gmrony135/PinCraft',
    repositoryId: '1456649831',
    workflow,
    audience: origin + path,
    deploymentSHA,
  };
}

export async function verifyTrendWorkload(authorization, { config = trendWorkloadConfig(), resolveKey = keys } = {}) {
  const unauthorized = () => new AutomationError('worker_unauthorized', 'Unauthorized daily trend-collection workload.', { status: 401 });
  if (!config.configured || typeof authorization !== 'string' || !authorization.startsWith('Bearer ') || authorization.length > 20_000) throw unauthorized();
  try {
    const { payload } = await jwtVerify(authorization.slice(7), resolveKey, {
      issuer,
      audience: config.audience,
      algorithms: ['RS256'],
      maxTokenAge: '10m',
      clockTolerance: 30,
    });
    if (
      payload.repository_id !== config.repositoryId ||
      payload.repository !== config.repository ||
      payload.repository_visibility !== 'public' ||
      payload.ref !== 'refs/heads/main' ||
      payload.workflow_ref !== config.workflow ||
      payload.sha !== config.deploymentSHA ||
      !['schedule', 'workflow_dispatch'].includes(payload.event_name) ||
      !/^\d{1,30}$/.test(String(payload.run_id || '')) ||
      !/^\d{1,10}$/.test(String(payload.run_attempt || '')) ||
      typeof payload.jti !== 'string' || payload.jti.length < 8 || payload.jti.length > 300 ||
      !Number.isFinite(payload.exp)
    ) throw new Error('Workload rejected');
    return { executionId: `github-trend-snapshot:${payload.run_id}:${payload.run_attempt}` };
  } catch {
    throw unauthorized();
  }
}
