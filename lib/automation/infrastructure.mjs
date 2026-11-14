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
  {id:'environment',label:'Background publishing',ready:workerEnvironmentAllowed(),detail:workerEnvironmentAllowed()?'This environment supports background publishing':'Background publishing is not active in this environment'},
  {id:'auth',label:'Secure account access',ready:authConfigured,detail:authConfigured?'Email/Password and Google sign-in are available':'Account access is temporarily unavailable'},
  {id:'database',label:'Private Cloud Library',ready:db.ready,detail:db.ready?'Your account-scoped storage is available':'Cloud storage is temporarily unavailable'},
  {id:'vault',label:'Encrypted account connections',ready:vaultReady(),detail:vaultReady()?'Saved authorizations are encrypted and bound to their owner':'Secure connection storage is not available yet'},
  {id:'scheduler',label:'Scheduled publishing',ready:firebaseSchedulerDeclared(),detail:firebaseSchedulerDeclared()?'Background service declared; a recent worker check-in is also required':'Scheduled publishing has not been activated. Manual creation and Library saves remain separate.'},
  {id:'images',label:'Publishing images',ready:Boolean(imageOrigin()),detail:imageOrigin()?'Public image access is checked before publishing':'Public publishing images are not available yet'},
 ];const oauth=publicOAuthConfig();return {ready:checks.every(c=>c.ready),databaseReady:db.ready,checks,oauth,bloggerOAuthReady:oauth.blogger.configured,pinterestRefreshReady:oauth.pinterest.configured,backend:'firebase',schedulerPollMinutes:30,schedulerJitterMinutes:0,retryMinutes:60};
}
