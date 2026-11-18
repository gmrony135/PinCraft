// Shared-secret authorization for the external 10-minute cron that calls the
// blog automation tick. It is an alternative to GitHub OIDC (the Actions
// fallback), never a replacement. Pure helper: no server-only imports.
import {createHash,timingSafeEqual} from 'node:crypto';

export const TICK_BUCKET_MS=10*60000;

// Returns null when the request does not present the cron secret at all.
// Throws when the secret is configured but too weak to rely on.
// Returns {executionId, deliveryKey} when the bearer token matches.
export function cronSecretIdentity({authorization,secret,now=Date.now()}){
 if(typeof authorization!=='string'||!authorization.startsWith('Bearer '))return null;
 if(typeof secret!=='string'||secret.length<32)throw new Error('BLOG_TICK_SECRET is missing or too short.');
 const presented=Buffer.from(authorization.slice(7),'utf8'),expected=Buffer.from(secret,'utf8');
 if(presented.length!==expected.length||!timingSafeEqual(presented,expected))return null;
 // One accepted tick per 10-minute bucket. A second call in the same bucket
 // is rejected as a replay, so a retry cannot spend AI quota twice.
 const bucket=Math.floor(now/TICK_BUCKET_MS);
 return {
  executionId:`external-cron:${bucket}`,
  deliveryKey:createHash('sha256').update(`blog-cron:${bucket}`).digest('hex'),
 };
}
