import {NextResponse} from 'next/server';
import {authSettings,cookieOptions,createNonce,NONCE_COOKIE} from '@/lib/auth-server';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request){
 const config=authSettings(),nonce=config.configured?createNonce():null;
 const response=NextResponse.json({configured:config.configured,provider:'firebase',firebase:config.configured?config.firebase:null,clientId:null,nonce},{headers:{'Cache-Control':'no-store, private',Vary:'Cookie'}});
 if(nonce)response.cookies.set(NONCE_COOKIE,nonce,cookieOptions(request,600));return response;
}
