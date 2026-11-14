// Explicit LOCAL TEST setup; never imported by the website or Functions.
import {randomBytes} from 'node:crypto';
import {mkdir,open} from 'node:fs/promises';
const dir=new URL('../.cache/',import.meta.url),file=new URL('firebase-test.env',dir);
await mkdir(dir,{recursive:true});
const values={FIREBASE_EMULATORS:'1',FIREBASE_PROJECT_ID:'demo-pincraft-local',FIREBASE_WEB_API_KEY:'synthetic-emulator-web-key',FIREBASE_AUTH_DOMAIN:'demo-pincraft-local.firebaseapp.com',FIREBASE_APP_ID:'1:123456789:web:localtestonly',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',VERCEL_ENV:'development',AUTOMATION_ALLOW_NON_PRODUCTION:'1',FIREBASE_SCHEDULER_CONFIGURED:'1',APP_URL:'https://pincraftly.vercel.app',AUTH_SESSION_SECRET:randomBytes(48).toString('base64url'),AUTOMATION_ENCRYPTION_KEY:randomBytes(32).toString('base64'),CRON_SECRET:randomBytes(48).toString('base64url'),PINTEREST_ACCESS_TIER:'standard',PINTEREST_CLIENT_ID:'isolated-local-pinterest-app',PINTEREST_CLIENT_SECRET:'synthetic-local-pinterest-app-secret',BLOGGER_CLIENT_ID:'isolated-local-blogger-app.apps.googleusercontent.com',BLOGGER_CLIENT_SECRET:'synthetic-local-blogger-app-secret',METADATA_SERVER_DETECTION:'none'};
let handle;
try{handle=await open(file,'wx',0o600);await handle.writeFile('# SYNTHETIC LOCAL TEST ONLY. Never upload to Vercel/Firebase or use real grants.\n'+Object.entries(values).map(([key,value])=>`${key}=${value}`).join('\n')+'\n');console.log('Created excluded 0600 .cache/firebase-test.env with synthetic demo-only values. No cloud service or provider account was connected.');}
catch(error){if(error.code==='EEXIST')console.log('Existing .cache/firebase-test.env left unchanged. No secret values were printed.');else throw error;}
finally{await handle?.close();}
