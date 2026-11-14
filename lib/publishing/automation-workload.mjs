import 'server-only';
import {createHash} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {AutomationError} from '../automation/errors.mjs';
import {transaction} from '../automation/db.mjs';
import {manualPinterestMode} from './mode.mjs';
const issuer='https://token.actions.githubusercontent.com',origin='https://pincraftly.vercel.app';
const keys=createRemoteJWKSet(new URL(issuer+'/.well-known/jwks'));
export const BLOG_WORKLOAD_PATH='/api/internal/blog-automation/tick';
export function blogWorkloadConfig(){
 const deploymentSHA=process.env.VERCEL_GIT_COMMIT_SHA||'';
 return {configured:manualPinterestMode()&&process.env.VERCEL_ENV==='production'&&process.env.APP_URL===origin&&/^[a-f0-9]{40}$/.test(deploymentSHA),repository:'gmrony135/PinCraft',repositoryId:'1456649831',workflow:'gmrony135/PinCraft/.github/workflows/pincraft-reviewed-blogger.yml@refs/heads/main',audience:origin+BLOG_WORKLOAD_PATH,deploymentSHA};
}
export async function verifyBlogWorkload(authorization,{config=blogWorkloadConfig(),resolveKey=keys}={}){
 if(!config.configured||typeof authorization!=='string'||!authorization.startsWith('Bearer ')||authorization.length>20000)throw new AutomationError('worker_unauthorized','Unauthorized Blogger generation workload.',{status:401});
 try{
  const {payload}=await jwtVerify(authorization.slice(7),resolveKey,{issuer,audience:config.audience,algorithms:['RS256'],maxTokenAge:'10m',clockTolerance:30});
  if(payload.repository_id!==config.repositoryId||payload.repository!==config.repository||payload.repository_visibility!=='public'||payload.ref!=='refs/heads/main'||payload.workflow_ref!==config.workflow||payload.sha!==config.deploymentSHA||!['schedule','workflow_dispatch'].includes(payload.event_name)||!/^\d{1,30}$/.test(String(payload.run_id||''))||!/^\d{1,10}$/.test(String(payload.run_attempt||''))||typeof payload.jti!=='string'||payload.jti.length<8||payload.jti.length>300||!Number.isFinite(payload.exp))throw new Error('Workload rejected');
  return {executionId:`github-blog-generation:${payload.run_id}:${payload.run_attempt}`,deliveryKey:createHash('sha256').update(`blog-generation:${config.repositoryId}:${payload.run_id}:${payload.run_attempt}`).digest('hex')};
 }catch{throw new AutomationError('worker_unauthorized','Unauthorized Blogger generation workload.',{status:401});}
}
export async function claimBlogDelivery(db,identity){
 const ref=db.collection('pincraft_scheduler_deliveries').doc(identity.deliveryKey);
 await transaction(db,async tx=>{if((await tx.get(ref)).exists)throw new AutomationError('worker_replayed','This Blogger generation invocation was already accepted. It cannot spend AI quota again.',{status:409});tx.create(ref,{execution_id:identity.executionId,accepted_at:new Date(),expires_at:new Date(Date.now()+7*86400000)});});
}
