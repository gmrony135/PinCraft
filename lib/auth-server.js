import 'server-only';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {firebaseAdminConfigured,firebaseAuth,firebaseProjectId,publicFirebaseConfig} from './firebase/admin.mjs';
export const SESSION_COOKIE='pincraft.session.v2';
export const NONCE_COOKIE='pincraft.firebase.nonce';
export const SESSION_SECONDS=60*60*24*7;
export function authSettings(){const firebase=publicFirebaseConfig(),secret=process.env.AUTH_SESSION_SECRET||'',admin=firebaseAdminConfigured();return {configured:Boolean(firebase&&admin&&secret.length>=32),firebase,projectId:firebaseProjectId(),secret,setup:{web:Boolean(firebase),admin,session:secret.length>=32}};}
export function cookieOptions(request,maxAge=SESSION_SECONDS){return {httpOnly:true,secure:new URL(request.url).protocol==='https:'||request.headers.get('x-forwarded-proto')==='https',sameSite:'lax',path:'/',maxAge};}
export function sameOrigin(request){
  const origin=request.headers.get('origin');if(!origin)return false;const incoming=new URL(request.url),allowed=new Set([incoming.origin]);
  const host=(request.headers.get('x-forwarded-host')||request.headers.get('host')||'').split(',')[0].trim(),protocol=(request.headers.get('x-forwarded-proto')||incoming.protocol.replace(':','')).split(',')[0].trim();
  if(host&&['http','https'].includes(protocol)){try{allowed.add(new URL(`${protocol}://${host}`).origin);}catch{}}
  try{if(process.env.APP_URL)allowed.add(new URL(process.env.APP_URL).origin);}catch{}return allowed.has(origin);
}
export const createNonce=()=>randomBytes(32).toString('hex');
export function matchingNonce(actual,expected){return typeof actual==='string'&&typeof expected==='string'&&/^[a-f0-9]{64}$/.test(actual)&&/^[a-f0-9]{64}$/.test(expected)&&timingSafeEqual(Buffer.from(actual),Buffer.from(expected));}
export function publicProfile(claims){
  const uid=claims?.uid||claims?.sub;
  if(typeof uid!=='string'||!uid||uid.length>128||claims.email_verified!==true||!['google.com','password'].includes(claims.firebase?.sign_in_provider))throw new Error('A verified Firebase email/password or Google account is required.');
  // Firebase may maintain its own email/account profile. PinCraft persists
  // only Firebase UID + display name; the email claim is checked transiently.
  return {id:uid,name:(typeof claims.name==='string'&&claims.name.trim()?claims.name.trim():'Creator').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,80)||'Creator'};
}
export async function verifyFirebaseCredential(credential,config=authSettings()){
  if(!config.configured||typeof credential!=='string'||!credential||credential.length>15000)throw new Error('Firebase sign-in is not ready.');
  const claims=await firebaseAuth().verifyIdToken(credential,true),now=Math.floor(Date.now()/1000);
  if(!Number.isFinite(claims.auth_time)||now-claims.auth_time>300||claims.auth_time>now+5)throw new Error('Sign in again to create a fresh session.');
  return {...publicProfile(claims),authTime:claims.auth_time};
}
export async function createSession(user,config=authSettings()){
  if(!config.configured||typeof user.id!=='string'||!user.id||user.id.length>128||!Number.isFinite(user.authTime))throw new Error('Authentication is not configured or verified.');
  const {SignJWT}=await import('jose');
  return new SignJWT({name:user.name,identity:'firebase',project:config.projectId,auth_time:user.authTime}).setProtectedHeader({alg:'HS256',typ:'JWT'}).setSubject(user.id).setIssuer('pincraft-firebase').setAudience('pincraft-session-v2').setIssuedAt().setExpirationTime(`${SESSION_SECONDS}s`).sign(new TextEncoder().encode(config.secret));
}
export async function readSession(token,config=authSettings()){
  if(!config.configured||typeof token!=='string'||!token||token.length>5000)return null;
  try{
    const {jwtVerify}=await import('jose');
    const {payload}=await jwtVerify(token,new TextEncoder().encode(config.secret),{algorithms:['HS256'],issuer:'pincraft-firebase',audience:'pincraft-session-v2'});
    if(payload.identity!=='firebase'||payload.project!==config.projectId||typeof payload.sub!=='string'||!payload.sub||payload.sub.length>128||typeof payload.name!=='string'||!payload.name.trim()||!Number.isFinite(payload.auth_time))return null;
    // Check the managed Firebase user on every authenticated server request.
    // Disabled/deleted/revoked identities cannot keep using a signed app cookie.
    const managed=await firebaseAuth().getUser(payload.sub);
    if(managed.disabled||!managed.emailVerified||!managed.providerData.some(p=>['google.com','password'].includes(p.providerId))||new Date(managed.tokensValidAfterTime||0).getTime()>payload.auth_time*1000)return null;
    return {id:payload.sub,name:payload.name};
  }catch{return null;}
}
