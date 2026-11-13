import {NextResponse} from 'next/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Read-only startup diagnostics. No credentials, account data, raw exception
// messages or stack traces are exposed, and no database/provider call is made.
export async function GET(){
 const body={service:'pincraft',runtime:process.versions.node,bootstrap:'unavailable',authentication:'setup-required'};
 try{const auth=await import('@/lib/auth-server');body.bootstrap='ready';body.authentication=auth.authSettings().configured?'configured':'setup-required';}
 catch(error){
  body.code=['ERR_MODULE_NOT_FOUND','MODULE_NOT_FOUND','ERR_REQUIRE_ESM','ERR_REQUIRE_ESM_RACE_CONDITION','ERR_PACKAGE_PATH_NOT_EXPORTED'].includes(error?.code)?error.code:'server_bootstrap_failed';
  const missing=String(error?.message||'').match(/Cannot find (?:module|package) ['"]([^'"\s]+)['"]/i)?.[1];
  if(missing&&/^[@a-zA-Z0-9_.\/-]{1,160}$/.test(missing))body.missingModule=missing;
 }
 return NextResponse.json(body,{status:body.bootstrap==='ready'?200:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
