import 'server-only';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {AutomationError} from '../automation/errors.mjs';
import {ownerKey} from '../automation/firestore.mjs';
import {vaultReady} from '../automation/vault.mjs';
import {httpsURL} from '../automation/http.mjs';
import {validJobId} from '../automation/images.mjs';

export const ARTICLE_IMAGE_MAX_BYTES=650000;
const collection=db=>db.collection('pincraft_article_images');
export const validArticleImageId=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export const privateArticleImageURL=id=>validArticleImageId(id)?`/api/library/article-images/${id}`:'';
export function articleImageId(uid,requestKey){
 ownerKey(uid);if(!validJobId(requestKey))throw new AutomationError('invalid_ai_request','A valid article image request is required.');
 return createHash('sha256').update(`pincraft-article-image:v1:${uid}:${requestKey}`).digest('hex');
}
function signingKey(){if(!vaultReady())throw new AutomationError('image_setup_required','Secure article image delivery is not configured.',{status:503});return Buffer.from(process.env.AUTOMATION_ENCRYPTION_KEY,'base64');}
export function articleImageSignature(id){if(!validArticleImageId(id))throw new AutomationError('invalid_image','The article image was not found.',{status:404});return createHmac('sha256',signingKey()).update(`pincraft-article-image:v1:${id}`).digest('base64url');}
export function validArticleImageSignature(id,signature){try{if(!/^[A-Za-z0-9_-]{43}$/.test(signature))return false;return timingSafeEqual(Buffer.from(signature),Buffer.from(articleImageSignature(id)));}catch{return false;}}
export function publicArticleImageURL(id){
 let origin;try{const value=httpsURL(process.env.APP_URL);if(value.pathname!=='/'||value.search)throw new Error();origin=value.origin;}catch{throw new AutomationError('image_origin_missing','Set APP_URL to the public HTTPS PinCraft origin before using durable Blogger article images.',{status:503});}
 return `${origin}/api/article-image/${id}?sig=${articleImageSignature(id)}`;
}
export function articleImagesConfigured(){try{publicArticleImageURL('a'.repeat(64));return true;}catch{return false;}}
function unpack(dataURL){
 const match=/^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataURL||''));if(!match)throw new AutomationError('invalid_ai_image','The generated article image was not a valid WebP file.',{status:502});
 const bytes=Buffer.from(match[1],'base64');if(bytes.length<100||bytes.length>ARTICLE_IMAGE_MAX_BYTES)throw new AutomationError('invalid_ai_image','The generated article image exceeds the safe durable-image size. No image was published.',{status:502});return bytes;
}
export async function storeArticleImage(db,uid,{requestKey,fingerprint,useCase,generated}){
 const id=articleImageId(uid,requestKey),bytes=unpack(generated?.data?.dataUrl),role=useCase==='article-cover'?'cover':useCase==='article-section'?'section':null;
 if(!role||generated?.data?.mimeType!=='image/webp'||generated?.data?.width!==1200||generated?.data?.height!==630||!/^([a-f0-9]{64})$/.test(fingerprint||''))throw new AutomationError('invalid_ai_image','The generated article image did not meet the verified image contract.',{status:502});
 const ref=collection(db).doc(id),saved=await ref.get(),previous=saved.exists?saved.data():null;
 if(previous){const existing=await readArticleImage(db,id,{uid});if(previous.ownerUID!==uid||previous.requestKey!==requestKey||previous.fingerprint!==fingerprint||previous.role!==role||!existing)throw new AutomationError('article_image_conflict','The saved article image identity or bytes changed. No image was published.',{status:409});return {assetId:id,width:previous.width,height:previous.height,mimeType:previous.mimeType,role:previous.role,storage:'firestore'};}
 const record={ownerUID:uid,requestKey,fingerprint,role,mimeType:'image/webp',width:1200,height:630,bytes,sha256:createHash('sha256').update(bytes).digest('hex'),createdAt:new Date()};
 try{await ref.create(record);}catch(error){if(error.code!==6&&error.code!=='already-exists')throw new AutomationError('article_image_storage_unavailable','The generated image could not be saved to private durable storage. This article will not be published.',{status:503,retryable:true});const existing=(await ref.get()).data();if(existing?.ownerUID!==uid||existing?.fingerprint!==fingerprint)throw new AutomationError('article_image_conflict','The saved article image identity changed. No image was published.',{status:409});}
 return {assetId:id,width:1200,height:630,mimeType:'image/webp',role,storage:'firestore'};
}
export async function readArticleImage(db,id,{uid=null}={}){
 if(!validArticleImageId(id))return null;const snapshot=await collection(db).doc(id).get(),row=snapshot.exists?snapshot.data():null;
 if(!row||!Buffer.isBuffer(row.bytes)||row.bytes.length<100||row.bytes.length>ARTICLE_IMAGE_MAX_BYTES||row.mimeType!=='image/webp'||row.width!==1200||row.height!==630||!['cover','section'].includes(row.role)||(uid&&row.ownerUID!==uid))return null;
 const digest=createHash('sha256').update(row.bytes).digest('hex');if(digest!==row.sha256)return null;
 return {bytes:row.bytes,width:row.width,height:row.height,mimeType:row.mimeType,ownerUID:row.ownerUID,role:row.role};
}
export async function assertOwnedArticleImages(db,uid,images,{required=3}={}){
 if(!Array.isArray(images)||images.length!==required)throw new AutomationError('article_images_required',`Exactly ${required} complete AI article images are required before publication.`);
 const ids=new Set();let covers=0,sections=0;
 for(const image of images){
  if(!image||typeof image!=='object'||!validArticleImageId(image.assetId)||ids.has(image.assetId)||!['cover','section'].includes(image.role)||typeof image.altText!=='string'||image.altText.trim().length<10||image.altText.length>300)throw new AutomationError('invalid_article_images','Review all three article images, their descriptions and unique asset IDs.');
  if(image.role==='cover'){covers++;if(image.sectionIndex!==null)throw new AutomationError('invalid_article_images','The article cover cannot be attached to a section.');}else{sections++;if(!Number.isInteger(image.sectionIndex)||image.sectionIndex<0||image.sectionIndex>3)throw new AutomationError('invalid_article_images','A section image must be attached to one of the article sections.');}
  ids.add(image.assetId);const stored=await readArticleImage(db,image.assetId,{uid});if(!stored||stored.role!==image.role)throw new AutomationError('article_image_missing','A required article image is missing from your private Library or has the wrong role. Recreate it before publishing.');
 }
 if(required===3&&(covers!==1||sections!==2))throw new AutomationError('invalid_article_images','The article must have exactly one cover and two section images.');
 return true;
}
export function safeArticleImageURL(value){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&u.port===''&&u.hash===''&&u.hostname!=='localhost'&&!u.hostname.endsWith('.local')?u.href:'';}catch{return '';}
}
