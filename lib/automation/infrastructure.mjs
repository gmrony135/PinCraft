import 'server-only';
import {timingSafeEqual} from 'node:crypto';
import {databaseHealth} from './db.mjs';
import {vaultReady} from './vault.mjs';
import {imageOrigin} from './images.mjs';
import {publicOAuthConfig} from './oauth-config.mjs';
export const schedulerSecretReady=()=>/^[A-Za-z0-9_+/=.\-]{32,256}$/.test(process.env.CRON_SECRET||'');
export function authorizedWorker(value){if(!schedulerSecretReady())return false;const expected=`Bearer ${process.env.CRON_SECRET}`;return typeof value==='string'&&Buffer.byteLength(value)===Buffer.byteLength(expected)&&timingSafeEqual(Buffer.from(value),Buffer.from(expected));}
export function workerEnvironmentAllowed(){return process.env.VERCEL_ENV==='production'||Boolean(process.env.K_SERVICE&&process.env.GCLOUD_PROJECT&&process.env.FUNCTIONS_EMULATOR!=='true')||process.env.AUTOMATION_ALLOW_NON_PRODUCTION==='1';}
export const firebaseSchedulerDeclared=()=>process.env.FIREBASE_SCHEDULER_CONFIGURED==='1';
export async function infrastructureStatus(authConfigured){
 const db=await databaseHealth(),checks=[
  {id:'environment',label:'Production background execution',ready:workerEnvironmentAllowed(),detail:workerEnvironmentAllowed()?'Background execution allowed in this environment':'Preview/local publishing is disabled by default'},
  {id:'auth',label:'Firebase Authentication + Google sign-in',ready:authConfigured,detail:authConfigured?'Firebase Admin and web sign-in configured':'Firebase web config, Admin identity and session secret are pending'},
  {id:'database',label:'Private Cloud Firestore',ready:db.ready,detail:db.ready?'Firestore is reachable with the server identity':db.reason},
  {id:'vault',label:'Server-only encrypted token vault',ready:vaultReady(),detail:vaultReady()?'AES-256-GCM ready; each grant is bound to its owner':'Encryption key is pending'},
  {id:'scheduler',label:'Firebase Cloud Functions + Scheduler',ready:firebaseSchedulerDeclared(),detail:firebaseSchedulerDeclared()?'Deployment declared; a recent real worker heartbeat is checked separately':'Scheduled function deployment and billing approval are pending'},
  {id:'images',label:'Public server-rendered Pin images',ready:Boolean(imageOrigin()),detail:imageOrigin()?'HTTPS image origin configured; public reachability is checked when publishing':'A public HTTPS APP_URL is pending'},
 ];const oauth=publicOAuthConfig();return {ready:checks.every(c=>c.ready),databaseReady:db.ready,checks,oauth,bloggerOAuthReady:oauth.blogger.configured,pinterestRefreshReady:oauth.pinterest.configured,backend:'firebase',schedulerPollMinutes:30,schedulerJitterMinutes:0,retryMinutes:60};
}
