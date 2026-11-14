import 'server-only';
import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { imageOrigin } from './images.mjs';
import { AutomationError } from './errors.mjs';
import { transaction } from './db.mjs';
const issuer = 'https://token.actions.githubusercontent.com';
const keys = createRemoteJWKSet(new URL(issuer + '/.well-known/jwks'));
export function githubSchedulerConfig() {
  const repository = process.env.AUTOMATION_GITHUB_REPOSITORY || '', repositoryId = process.env.AUTOMATION_GITHUB_REPOSITORY_ID || '', origin = imageOrigin();
  return { configured: process.env.AUTOMATION_SCHEDULER === 'github-actions' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) && /^\d{1,20}$/.test(repositoryId) && Boolean(origin), repository, repositoryId, audience: origin ? `${origin}/api/internal/automation/tick` : null, workflow: `${repository}/.github/workflows/pincraft-automation.yml@refs/heads/main` };
}
export const githubSchedulerConfigured = () => githubSchedulerConfig().configured;
export async function verifyGithubWorker(authorization, options = {}) {
  const config = options.config || githubSchedulerConfig();
  if (!config.configured || typeof authorization !== 'string' || !authorization.startsWith('Bearer ') || authorization.length > 20000) throw new AutomationError('worker_unauthorized', 'Unauthorized worker request.', { status: 401 });
  try {
    const { payload } = await jwtVerify(authorization.slice(7), options.resolveKey || keys, { issuer, audience: config.audience, algorithms: ['RS256'], maxTokenAge: '10m', clockTolerance: 30 });
    if (payload.repository_id !== config.repositoryId || String(payload.repository || '').toLowerCase() !== config.repository.toLowerCase() || payload.ref !== 'refs/heads/main' || String(payload.workflow_ref || '').toLowerCase() !== config.workflow.toLowerCase() || !['schedule', 'workflow_dispatch'].includes(payload.event_name) || payload.repository_visibility !== 'public' || !/^\d{1,30}$/.test(String(payload.run_id || '')) || !/^\d{1,10}$/.test(String(payload.run_attempt || '')) || typeof payload.jti !== 'string' || payload.jti.length < 8 || payload.jti.length > 300 || !Number.isFinite(payload.exp)) throw new Error('Rejected workload');
    return { kind: 'github-actions', executionId: `github:${payload.run_id}:${payload.run_attempt}`, deliveryKey: createHash('sha256').update(`${config.repositoryId}:${payload.run_id}:${payload.run_attempt}`).digest('hex') };
  } catch { throw new AutomationError('worker_unauthorized', 'Unauthorized worker request.', { status: 401 }); }
}
export async function claimSchedulerDelivery(db, identity) {
  const ref = db.collection('pincraft_scheduler_deliveries').doc(identity.deliveryKey);
  await transaction(db, async tx => {
    if ((await tx.get(ref)).exists) throw new AutomationError('worker_replayed', 'This scheduled invocation has already been accepted. No second invocation was started.', { status: 409 });
    tx.create(ref, { execution_id: identity.executionId, accepted_at: new Date(), expires_at: new Date(Date.now() + 7 * 86400000) });
  });
}
