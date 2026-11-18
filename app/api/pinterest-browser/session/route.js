import {apiError,json,readBody,sessionUser} from '@/lib/automation/api';
import {getDatabase} from '@/lib/automation/db.mjs';
import {assertOwner,getPinterestStatus,saveSession} from '@/lib/pinterest-browser/store.mjs';
import {SESSION_MAX_BYTES} from '@/lib/pinterest-browser/jobs.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request){
 try{const user=await sessionUser(request);assertOwner(user);return json(await getPinterestStatus(getDatabase()));}catch(error){return apiError(error);}
}
export async function POST(request){
 try{
  const user=await sessionUser(request,true);assertOwner(user);
  const body=await readBody(request,SESSION_MAX_BYTES+1024);
  // Only the exported session is accepted: any other field (for example a password) is rejected by validateStorageState.
  const {storageState,...rest}=body;
  if(Object.keys(rest).length)throw new Error('Upload only the session export file.');
  return json(await saveSession(getDatabase(),storageState));
 }catch(error){return apiError(error);}
}
