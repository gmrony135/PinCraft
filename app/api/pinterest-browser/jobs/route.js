import {apiError,json,readBody,sessionUser} from '@/lib/automation/api';
import {getDatabase} from '@/lib/automation/db.mjs';
import {assertOwner,queuePin} from '@/lib/pinterest-browser/store.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request){
 try{const user=await sessionUser(request,true);assertOwner(user);const body=await readBody(request,4000);return json(await queuePin(getDatabase(),body),201);}catch(error){return apiError(error);}
}
