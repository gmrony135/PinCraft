import {apiError,json,readBody,sessionUser} from '@/lib/automation/api';
import {databaseHealth,getDatabase} from '@/lib/automation/db.mjs';
import {AutomationError} from '@/lib/automation/errors.mjs';
import {validJobId} from '@/lib/automation/images.mjs';
import {listLibrary} from '@/lib/automation/repository.mjs';
import {draftInput,saveDraft} from '@/lib/automation/drafts.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request){
 try{const user=await sessionUser(request);if(!(await databaseHealth()).ready)return json({ready:false,items:[],nextCursor:null,message:'Private cloud storage is temporarily unavailable. Device saves remain separate and unchanged.'});const cursor=new URL(request.url).searchParams.get('cursor');if(cursor&&!validJobId(cursor))throw new AutomationError('invalid_cursor','The Library page cursor is invalid.');return json({ready:true,...await listLibrary(getDatabase(),user.id,cursor)});}catch(error){return apiError(error);}
}
export async function POST(request){
 try{const user=await sessionUser(request,true),body=await readBody(request);if(body.action!=='save')throw new AutomationError('invalid_action','Choose Save to your private Library.');const draft=draftInput(body);if(!(await databaseHealth()).ready)throw new AutomationError('setup_required','Private cloud storage is temporarily unavailable. This draft was not saved. Keep the page open and try again later.',{status:503});const id=await saveDraft(getDatabase(),user.id,draft);return json({saved:true,id,storage:'firestore'});}catch(error){return apiError(error);}
}
