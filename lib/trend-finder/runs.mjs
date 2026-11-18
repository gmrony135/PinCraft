import 'server-only';
// Public Actions metadata only. Never exposes logs, grants or arbitrary API data.
// Uncached: a cached "no runs" response must never outlive a successful run.
export async function latestTrendRun(){
 try{
  const r=await fetch('https://api.github.com/repos/gmrony135/PinCraft/actions/workflows/pincraft-trend-finder.yml/runs?per_page=1',{headers:{Accept:'application/vnd.github+json'},cache:'no-store',signal:AbortSignal.timeout(5000)});
  if(!r.ok)return {status:'unavailable',message:'GitHub run status could not be checked.'};
  const body=await r.json();const row=body.workflow_runs?.[0];
  if(!row){
   if(Number(body.total_count)===0)return {status:'never_run',message:'GitHub reports no collector runs. Enable Actions and run the snapshot workflow.'};
   return {status:'unavailable',message:'GitHub run status could not be checked.'};
  }
  return {status:row.status,conclusion:row.conclusion||null,startedAt:row.run_started_at||null,updatedAt:row.updated_at||null,url:`https://github.com/gmrony135/PinCraft/actions/runs/${Number(row.id)}`,message:`Last GitHub collector run: ${row.conclusion||row.status}. A successful run is confirmed as data only when a snapshot is stored.`};
 }catch{return {status:'unavailable',message:'GitHub run status could not be checked.'}}
}
