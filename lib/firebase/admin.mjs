import 'server-only';
import {applicationDefault,cert,getApps,initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';

const cloud=()=>Boolean(process.env.K_SERVICE||process.env.FUNCTION_TARGET);
export const firebaseProjectId=()=>String(process.env.FIREBASE_PROJECT_ID||process.env.GCLOUD_PROJECT||'').trim();
export function firebaseEmulatorsAllowed(){
  const hosts=[process.env.FIRESTORE_EMULATOR_HOST,process.env.FIREBASE_AUTH_EMULATOR_HOST].filter(Boolean);
  return hosts.length===2&&process.env.FIREBASE_EMULATORS==='1'&&firebaseProjectId().startsWith('demo-')&&process.env.VERCEL_ENV!=='production'&&(!cloud()||process.env.FUNCTIONS_EMULATOR==='true')&&hosts.every(h=>/^(127\.0\.0\.1|localhost):\d{2,5}$/.test(h));
}
export function firebaseAdminConfigured(){
  if(!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(firebaseProjectId()))return false;
  if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)return firebaseEmulatorsAllowed();
  return Boolean((cloud()&&process.env.GCLOUD_PROJECT===firebaseProjectId())||(/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(process.env.FIREBASE_ADMIN_CLIENT_EMAIL||'')&&(process.env.FIREBASE_ADMIN_PRIVATE_KEY||'').includes('-----BEGIN PRIVATE KEY-----')));
}
export function getFirebaseAdminApp(){
  if(!firebaseAdminConfigured())throw new Error('Firebase server configuration is incomplete.');
  const projectId=firebaseProjectId(),existing=getApps().find(app=>app.name==='pincraft-server');
  if(existing){if(existing.options.projectId!==projectId)throw new Error('Firebase project configuration changed. Restart the server.');return existing;}
  const credential=firebaseEmulatorsAllowed()?null:process.env.FIREBASE_ADMIN_PRIVATE_KEY?cert({projectId,clientEmail:process.env.FIREBASE_ADMIN_CLIENT_EMAIL,privateKey:process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g,'\n')}):applicationDefault();
  return initializeApp({projectId,...(credential?{credential}:{})},'pincraft-server');
}
export const firebaseAuth=()=>getAuth(getFirebaseAdminApp());
export const firebaseDatabase=()=>getFirestore(getFirebaseAdminApp());
export function publicFirebaseConfig(){
  const projectId=firebaseProjectId(),apiKey=process.env.FIREBASE_WEB_API_KEY||'',authDomain=process.env.FIREBASE_AUTH_DOMAIN||'',appId=process.env.FIREBASE_APP_ID||'';
  if(!firebaseAdminConfigured()||!apiKey||apiKey.length>200||!appId||appId.length>160||!/^[a-z0-9.-]+$/.test(authDomain)||!authDomain.endsWith('.firebaseapp.com')||authDomain!==`${projectId}.firebaseapp.com`)return null;
  return {projectId,apiKey,authDomain,appId};
}
