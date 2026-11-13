import {NextResponse} from 'next/server';
import {authSettings,cookieOptions,createSession,matchingNonce,NONCE_COOKIE,sameOrigin,SESSION_COOKIE,verifyFirebaseCredential} from '@/lib/auth-server';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer'};
export async function POST(request){
 if(!sameOrigin(request))return NextResponse.json({error:'This sign-in request was not allowed.'},{status:403,headers});
 const config=authSettings();if(!config.configured)return NextResponse.json({error:'Firebase sign-in needs server configuration. No account or session was simulated.'},{status:503,headers});
 if(!request.headers.get('content-type')?.startsWith('application/json'))return NextResponse.json({error:'Invalid request format.'},{status:415,headers});
 let body;
 try{const reader=request.body?.getReader();if(!reader)throw new Error();let size=0;const chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>24000){await reader.cancel();return NextResponse.json({error:'Sign-in request is too large.'},{status:413,headers});}chunks.push(Buffer.from(value));}body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return NextResponse.json({error:'Invalid sign-in request.'},{status:400,headers});}
 if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(key=>!['idToken','nonce'].includes(key)))return NextResponse.json({error:'Send only a Firebase ID token and sign-in nonce. Passwords are accepted only by Firebase Authentication.'},{status:400,headers});
 if(!matchingNonce(body?.nonce,request.cookies.get(NONCE_COOKIE)?.value))return NextResponse.json({error:'The sign-in request expired. Reload and try again.'},{status:403,headers});
 try{
  const verified=await verifyFirebaseCredential(body.idToken,config),user={id:verified.id,name:verified.name},response=NextResponse.json({user},{headers});
  response.cookies.set(SESSION_COOKIE,await createSession(verified,config),cookieOptions(request));response.cookies.set(NONCE_COOKIE,'',cookieOptions(request,0));response.cookies.set('pincraft.session.v1','',cookieOptions(request,0));return response;
 }catch{return NextResponse.json({error:'Firebase could not verify this sign-in. Verify your email, then sign in again.'},{status:401,headers});}
}
