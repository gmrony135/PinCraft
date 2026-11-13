import {onSchedule} from 'firebase-functions/v2/scheduler';
import {defineSecret} from 'firebase-functions/params';
import {info,error as logError} from 'firebase-functions/logger';
import {getDatabase} from '../lib/automation/db.mjs';
import {workerEnvironmentAllowed} from '../lib/automation/infrastructure.mjs';
import {vaultReady} from '../lib/automation/vault.mjs';
import {imageOrigin} from '../lib/automation/images.mjs';
import {runWorker} from '../lib/automation/worker.mjs';
const vault=defineSecret('AUTOMATION_ENCRYPTION_KEY');
const pinterest=defineSecret('PINTEREST_CLIENT_SECRET');
const blogger=defineSecret('BLOGGER_CLIENT_SECRET');
const gemini=defineSecret('GEMINI_API_KEY');
const groq=defineSecret('GROQ_API_KEY');
// Native scheduler/IAM trigger. No client timer, public callable or global user
// token. Firestore transactions still protect against redelivered invocations.
export const pincraftAutoPost=onSchedule({schedule:'*/30 * * * *',timeZone:'UTC',region:'asia-south1',timeoutSeconds:300,memory:'512MiB',minInstances:0,maxInstances:1,concurrency:1,retryCount:0,secrets:[vault,pinterest,blogger,gemini,groq]},async event=>{
 if(!workerEnvironmentAllowed()||!vaultReady()||!imageOrigin()){logError('PinCraft worker setup is incomplete; no publishing attempted.');throw new Error('PinCraft worker setup is incomplete.');}
 try{const result=await runWorker(getDatabase(),{executionId:event.scheduleTime||null,maxJobs:12});info('PinCraft scheduled worker completed',{processed:result.processed,completed:result.completed,stopped:result.stopped});}
 catch{logError('PinCraft scheduled worker failed safely. Inspect private job statuses; no credentials were logged.');throw new Error('PinCraft worker could not persist its run.');}
});
