import {getDatabase} from '@/lib/automation/db.mjs';
import {readArticleImage,validArticleImageId,validArticleImageSignature} from '@/lib/publishing/article-images.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=15;
const missing=()=>new Response('Image not found',{status:404,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(request,{params}){
 const {id}=await params,sig=new URL(request.url).searchParams.get('sig')||'';
 if(!validArticleImageId(id)||!validArticleImageSignature(id,sig))return missing();
 try{
  const image=await readArticleImage(getDatabase(),id);if(!image)return missing();
  return new Response(image.bytes,{headers:{'Content-Type':'image/webp','Content-Length':String(image.bytes.length),'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'cross-origin','Access-Control-Allow-Origin':'*'}});
 }catch{return new Response('Image service unavailable',{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
}
