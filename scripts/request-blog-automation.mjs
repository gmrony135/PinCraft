// Trusted Actions orchestration only. AI keys remain in the existing Vercel
// generator; the caller gets only aggregate counters, never content or grants.
const origin='https://pincraftly.vercel.app',path='/api/internal/blog-automation/tick';
async function boundedJSON(response,max=24000){
 if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();throw new Error('Response rejected');}
 const reader=response.body?.getReader();if(!reader)throw new Error('Response rejected');const chunks=[];let length=0;
 for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>max){await reader.cancel();throw new Error('Response rejected');}chunks.push(Buffer.from(value));}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function requestBlogAutomation({send=fetch,environment=process.env}={}){
 if(environment.GITHUB_ACTIONS!=='true'||environment.GITHUB_REPOSITORY!=='gmrony135/PinCraft'||environment.GITHUB_REF!=='refs/heads/main'||!['schedule','workflow_dispatch'].includes(environment.GITHUB_EVENT_NAME))return {outcome:'not_trusted_actions'};
 try{
  const requestURL=new URL(environment.ACTIONS_ID_TOKEN_REQUEST_URL);
  if(requestURL.protocol!=='https:'||!requestURL.hostname.endsWith('.actions.githubusercontent.com')||requestURL.username||requestURL.password||requestURL.port||!environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN)return {outcome:'oidc_unavailable'};
  requestURL.searchParams.set('audience',origin+path);
  const issued=await send(requestURL,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN},signal:AbortSignal.timeout(10000)});
  if(!issued.ok)return {outcome:'oidc_unavailable'};
  const token=(await boundedJSON(issued)).value;if(typeof token!=='string'||token.length<100||token.length>19000)return {outcome:'oidc_unavailable'};
  const response=await send(origin+path,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(85000)});
  if(!response.ok){await response.body?.cancel();return {outcome:response.status===409?'already_accepted':response.status===401?'workload_not_authorized':'generation_unavailable'};}
  const result=await boundedJSON(response);
  if(result.ok!==true)return {outcome:'generation_unavailable'};
  return {outcome:['ok','needs_attention','skipped_slot','waiting'].includes(result.outcome)?result.outcome:'unknown',...Object.fromEntries(['candidates','processed','articleGenerated','queued','skipped','blocked','retry'].map(key=>[key,Number.isInteger(result[key])&&result[key]>=0&&result[key]<=2?result[key]:0]))};
 }catch{return {outcome:'generation_response_unconfirmed'};}
}
