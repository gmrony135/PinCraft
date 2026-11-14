// Server-to-server delegation only. This never creates/provider-exchanges tokens.
import { createHash, createHmac, randomUUID } from 'node:crypto';
const sha = value => createHash('sha256').update(value).digest('hex');
export function bridgeSettings(env = process.env) {
  let origin=null,appOrigin=null;
  try { const url=new URL(env.PUBLISHER_WORKER_ORIGIN); if(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&url.pathname==='/'&&!url.search&&!url.hash&&/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(url.hostname)&&url.hostname.includes('.')&&!/^\d+(?:\.\d+){3}$/.test(url.hostname))origin=url.origin; } catch {}
  try { const url=new URL(env.APP_URL);if(url.protocol==='https:'&&url.pathname==='/'&&!url.search&&!url.hash&&!url.username&&!url.password)appOrigin=url.origin;}catch{}
  const secret=env.PINCRAFT_PUBLISH_BRIDGE_SECRET||'';
  return {configured:Boolean(origin&&appOrigin&&secret.length>=32&&secret.length<=256),origin,appOrigin,secret};
}
export function allowedBridgePath(value) {
  let url;try{url=new URL('/v1/'+value,'https://publisher.internal');}catch{return false;}
  const path=url.pathname.slice(4);
  if(!/^[A-Za-z0-9/_-]+$/.test(path))return false;
  return ['status','jobs','websites','images/inspect'].includes(path)||/^connections\/(pinterest|blogger)\/(start|resources|disconnect)$/.test(path)||/^callbacks\/(pinterest|blogger)$/.test(path)||/^jobs\/[0-9a-f-]{36}\/(process|retry|review)$/.test(path);
}
export function signBridge({uid,method,path,body='',browser='',now=Date.now(),jti=randomUUID()},settings) {
  if(!settings.configured)throw new Error('publisher_setup_required');
  const payload=Buffer.from(JSON.stringify({uid,method,path,bodyHash:sha(body),cookieHash:sha(browser),audience:settings.appOrigin,iat:now,exp:now+30000,jti})).toString('base64url');
  return payload+'.'+createHmac('sha256',settings.secret).update(payload).digest('base64url');
}
