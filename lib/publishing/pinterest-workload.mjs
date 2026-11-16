import 'server-only';
import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AutomationError } from '../automation/errors.mjs';
import { transaction } from '../automation/db.mjs';
import { runPinterestValidationWorker } from './pinterest-workflow.mjs';

const issuer = 'https://token.actions.githubusercontent.com';
const origin = 'https://pincraftly.vercel.app';
const path = '/api/internal/pinterest-publishing/tick';
const workflow = 'gmrony135/PinCraft/.github/workflows/pincraft-pinterest-manual.yml@refs/heads/main';
const keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`));
export const PINTEREST_WORKLOAD_PATH = path;

export function pinterestWorkloadConfig() {
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

export async function verifyPinterestWorkload(authorization, { config = pinterestWorkloadConfig(), resolveKey = keys } = {}) {
  if (!config.configured || typeof authorization !== 'string' || !authorization.startsWith('Bearer ') || authorization.length > 20000) {
    throw new AutomationError('worker_unauthorized', 'Unauthorized Pinterest validation workload.', { status: 401 });
  }
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
    const run = `${payload.run_id}:${payload.run_attempt}`;
    return {
      executionId: `github-pinterest-validation:${run}`,
      deliveryKey: createHash('sha256').update(`pinterest-validation:${config.repositoryId}:${run}`).digest('hex'),
    };
  } catch {
    throw new AutomationError('worker_unauthorized', 'Unauthorized Pinterest validation workload.', { status: 401 });
  }
}

export async function claimPinterestDelivery(db, identity) {
  const ref = db.collection('pincraft_scheduler_deliveries').doc(identity.deliveryKey);
  await transaction(db, async tx => {
    if ((await tx.get(ref)).exists) throw new AutomationError('worker_replayed', 'This Pinterest validation run was already accepted.', { status: 409 });
    tx.create(ref, { execution_id: identity.executionId, accepted_at: new Date(), expires_at: new Date(Date.now() + 7 * 86400000) });
  });
}

export { runPinterestValidationWorker };
