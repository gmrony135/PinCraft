import 'server-only';
import {firebaseAdminConfigured,firebaseDatabase} from '../firebase/admin.mjs';
import {setupError} from './errors.mjs';
export const databaseConfigured=()=>firebaseAdminConfigured();
export function getDatabase(){if(!databaseConfigured())throw setupError();return firebaseDatabase();}
export const transaction=(db,task)=>db.runTransaction(task,{maxAttempts:7});
export async function databaseHealth(){
  if(!databaseConfigured())return {configured:false,ready:false,reason:'Firebase Admin / Firestore configuration is missing'};
  try{await getDatabase().doc('pincraft_system/config').get();return {configured:true,ready:true,reason:null};}
  catch{return {configured:true,ready:false,reason:'Firestore is unavailable or the server identity lacks permission'};}
}
