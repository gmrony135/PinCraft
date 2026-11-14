import { randomUUID } from 'node:crypto';
import { apiError,automationResponse,json,preferencesInput,readBody,requireInfrastructure,sessionUser } from '@/lib/automation/api';
import { getDatabase } from '@/lib/automation/db.mjs';
import { AutomationError } from '@/lib/automation/errors.mjs';
import { aiInput,verifyAI } from '@/lib/automation/providers.mjs';
import { getSettings,removeAI,reserveVerification,saveAI,saveDestinations,setMode,updatePreferences } from '@/lib/automation/repository.mjs';
import { verifyDestination } from '@/lib/automation/oauth-resources.mjs';
import { requireOAuthConfig } from '@/lib/automation/oauth-config.mjs';
import { encryptCredentials } from '@/lib/automation/vault.mjs';
import { fetchTrends } from '@/lib/automation/trends.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=120;
export async function POST(request){
  try{
    const user=await sessionUser(request,true),body=await readBody(request),db=getDatabase();
    if(body.action==='mode'){
      if(typeof body.enabled!=='boolean')throw new AutomationError('invalid_mode','Choose ON or OFF.');
      if(body.enabled){if(body.consent!==true)throw new AutomationError('consent_required','Confirm real scheduled publishing before enabling Auto Mode.');await requireInfrastructure();requireOAuthConfig('pinterest');const s=await getSettings(db,user.id);if(s?.posting_mode==='generated')requireOAuthConfig('blogger');}
      await setMode(db,user.id,body.enabled);
    }else if(body.action==='preferences'){
      const p=preferencesInput(body);if(p.topicSource==='google_trends'){await reserveVerification(db,user.id);await fetchTrends(p.trendRegion);}await updatePreferences(db,user.id,p);
    }else if(body.action==='ai'){
      if(body.consent!==true)throw new AutomationError('consent_required','Confirm AI usage before verification.');
      if(Object.keys(body).some(key=>!['action','consent'].includes(key)))throw new AutomationError('invalid_settings','AI is managed securely by PinCraft. Personal service settings are not accepted here.');
      const config=aiInput({aiProvider:'managed'});await reserveVerification(db,user.id);const summary=await verifyAI(config,undefined,{database:db,userId:user.id,requestKey:randomUUID()});await saveAI(db,user.id,encryptCredentials(user.id,config),summary);
    }else if(body.action==='remove_ai'){if(body.confirm!==true)throw new AutomationError('confirmation_required','Confirm API-key removal.');await removeAI(db,user.id);
    }else if(body.action==='destinations'){
      const pinterest=await verifyDestination(db,user.id,'pinterest',body.boardId);
      const blogger=body.blogId?await verifyDestination(db,user.id,'blogger',body.blogId):null;
      await saveDestinations(db,user.id,{pinterest,blogger});
    }else if(['connect','disconnect'].includes(body.action))throw new AutomationError('oauth_required','Publishing credentials cannot be pasted here. Use Connect Pinterest or Connect Blogger and their own OAuth consent pages.');
    else throw new AutomationError('invalid_action','Choose a supported automation action.');
    return json(await automationResponse(user));
  }catch(error){return apiError(error);}
}
