import 'server-only';
// Model names are operator settings, never accepted from browser requests.
const model = (value, fallback) => typeof value === 'string' && /^[A-Za-z0-9@._:/-]{1,100}$/.test(value) ? value : fallback;
const key = value => typeof value === 'string' && value.length >= 16 && value.length <= 6000 && !/[\s\u0000-\u001f\u007f]/.test(value) ? value : null;
const limit = (name, fallback, max) => /^\d+$/.test(process.env[name] || '') ? Math.min(max, Math.max(1, Number(process.env[name]))) : fallback;
// Separate keys in the same provider project/organization may share quota.
let rotation = 0;
// Up to 10 key slots per provider: base name, then _2 … _10. Empty or malformed slots are skipped.
export const KEY_SLOTS = 10;
const credentialSlots = prefix => Array.from({length:KEY_SLOTS},(_,i)=>({key:key(process.env[i?`${prefix}_${i+1}`:prefix]),slot:i+1})).filter(row=>row.key).filter((row,i,all)=>all.findIndex(v=>v.key===row.key)===i);
const rotate = (rows,offset) => rows.length ? [...rows.slice(offset%rows.length),...rows.slice(0,offset%rows.length)] : [];
// Cloudflare text keys pair each token slot with its own account id (CLOUDFLARE_TEXT_ACCOUNT_ID_<n>).
function cloudflareTextSlots() {
  const cfBase=key(process.env.CLOUDFLARE_TEXT_API_TOKEN)||key(process.env.CLOUDFLARE_API_TOKEN);
  return [{key:cfBase,slot:1},...credentialSlots('CLOUDFLARE_TEXT_API_TOKEN').filter(r=>r.slot>1)].filter(r=>r.key).map(r=>({...r,accountId:process.env[r.slot>1?`CLOUDFLARE_TEXT_ACCOUNT_ID_${r.slot}`:'CLOUDFLARE_TEXT_ACCOUNT_ID']||process.env.CLOUDFLARE_TEXT_ACCOUNT_ID||process.env.CLOUDFLARE_ACCOUNT_ID||''})).filter(r=>/^[a-f0-9]{32}$/i.test(r.accountId));
}
// Slot numbers only (never key values) that hold a usable text key, per provider. Used by the owner's admin view.
export function configuredKeySlots() {
  return {
    gemini: credentialSlots('GEMINI_API_KEY').map(r=>r.slot),
    groq: credentialSlots('GROQ_API_KEY').map(r=>r.slot),
    cloudflare: cloudflareTextSlots().map(r=>r.slot),
  };
}
export function textCandidates() {
  const offset=rotation++,gemini=rotate(credentialSlots('GEMINI_API_KEY'),offset),groq=rotate(credentialSlots('GROQ_API_KEY'),offset);
  const cloudflare=rotate(cloudflareTextSlots(),offset);
  const rows=[];
  for(let i=0;i<KEY_SLOTS;i++){
    if(gemini[i])rows.push({provider:'gemini',model:model(process.env.GEMINI_MODEL,'gemini-3.1-flash-lite'),...gemini[i],timeout:18000});
    if(groq[i])rows.push({provider:'groq',model:model(process.env.GROQ_MODEL,'openai/gpt-oss-120b'),...groq[i],timeout:18000});
    if(cloudflare[i])rows.push({provider:'cloudflare',model:model(process.env.CLOUDFLARE_TEXT_MODEL,'@cf/meta/llama-3.3-70b-instruct-fp8-fast'),...cloudflare[i],timeout:18000});
  }
  for(const row of groq)rows.push({provider:'groq',model:model(process.env.GROQ_FALLBACK_MODEL,'openai/gpt-oss-20b'),...row,timeout:14000});
  return rows;
}
export const IMAGE_MODELS = ['@cf/black-forest-labs/flux-1-schnell', '@cf/black-forest-labs/flux-2-klein-4b'];
export function imageSettings() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '', token = key(process.env.CLOUDFLARE_API_TOKEN);
  return /^[a-f0-9]{32}$/i.test(accountId) && token ? { accountId, token, models: [...IMAGE_MODELS] } : null;
}
export function aiLimits() {
  return {
    // Only owner-scoped daily counters gate generation. Old AI_GLOBAL_* vars are ignored.
    user: {text:Math.max(150,limit('AI_USER_DAILY_TEXT_LIMIT',150,10000)),image:limit('AI_USER_DAILY_IMAGE_LIMIT',20,20)},
    maxTextAttempts: 6, maxImageAttempts: 2, resetTimezone: 'Asia/Dhaka',
  };
}
export function publicAIStatus() {
  const candidates = textCandidates();
  return {
    textConfigured: Boolean(candidates.length), imageConfigured: Boolean(imageSettings()),
    pinInfoConfigured: candidates.some(candidate => candidate.provider === 'gemini'),
    automaticFallback: candidates.length > 1,
    tasks: ['pin', 'pin_info', 'article', 'keywords', 'plan', 'quality', 'image'],
    authenticationRequired: true, perUserLimits:aiLimits().user, resetTimezone:'Asia/Dhaka',
    statusMeaning: 'Configuration only, not a live connectivity or quota guarantee. Each generation is verified when requested.',
  };
}
