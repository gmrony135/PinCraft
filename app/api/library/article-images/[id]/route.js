import {apiError,sessionUser} from '@/lib/automation/api';
import {getDatabase} from '@/lib/automation/db.mjs';
import {readArticleImage,validArticleImageId} from '@/lib/publishing/article-images.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request,{params}){
 try{
  const user=await sessionUser(request),{id}=await params;if(!validArticleImageId(id))return new Response('Image not found',{status:404,headers:{'Cache-Control':'no-store'}});
  const image=await readArticleImage(getDatabase(),id,{uid:user.id});if(!image)return new Response('Image not found',{status:404,headers:{'Cache-Control':'no-store'}});
  return new Response(image.bytes,{headers:{'Content-Type':'image/webp','Content-Length':String(image.bytes.length),'Content-Disposition':'inline; filename="pincraft-article-image.webp"','Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'}});
 }catch(error){return apiError(error);}
}
