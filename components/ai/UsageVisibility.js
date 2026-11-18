'use client';
import {useEffect,useState} from 'react';
import {useAuth} from '../providers/AppProvider';
export default function UsageVisibility({refreshWhen}){
 const {user,authLoading}=useAuth();
 const [state,setState]=useState({owner:null,own:null,caps:null,error:''});
 useEffect(()=>{
  if(authLoading)return;
  let active=true,running=false;const controller=new AbortController();
  setState({owner:user?.id||null,own:null,caps:null,error:''});
  async function refresh(){
   if(running||document.hidden)return;running=true;
   try{
    const r=await fetch(user?'/api/ai/usage':'/api/ai/status',{cache:'no-store',credentials:'same-origin',signal:controller.signal});
    if(!r.ok)throw new Error('Usage check unavailable');const data=await r.json();
    if(active)setState({owner:user?.id||null,own:user?data:null,caps:user?data.limits:data.perUserLimits,error:''});
   }catch{if(active)setState({owner:user?.id||null,own:null,caps:null,error:'Your usage could not be checked. No remaining allowance is assumed.'});}
   finally{running=false;}
  }
  refresh();const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{active=false;controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)};
 },[authLoading,user?.id,refreshWhen]);
 const own=state.owner===user?.id?state.own:null,caps=state.caps;
 const exhausted=own&&((own.used.pinPacks>=own.pinPackLimit)||(own.used.text>=own.limits.text)||(own.used.image>=own.limits.image));
 return <section data-testid="ai-usage-visibility" aria-label="Your daily AI usage" className="my-4 rounded-xl border border-neutral-200 bg-white p-4 text-xs leading-relaxed text-neutral-700" aria-live="polite">
  <p className="font-bold">{authLoading?'Checking your usage…':!user?'Sign in to see your own daily usage.':own?`${own.used.pinPacks} of ${own.pinPackLimit} Pin packs used today`:state.error||'Checking your usage…'}</p>
  {own?<><p className="mt-1">{own.used.text} of {own.limits.text} text generations used today · {own.used.image} of {own.limits.image} image generations used today.</p><p className="mt-1 text-neutral-500">Text and image counters count requests, including failed requests. Only successful Pin idea packs count toward your 20 packs.</p></>:caps&&<p className="mt-1">Daily allowance per account: 20 Pin packs · {caps.text} text requests · {caps.image} image requests.</p>}
  {exhausted&&<p role="status" data-testid="user-limit-reached" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 font-semibold text-amber-900">Your account has reached a daily allowance: {[own.used.pinPacks>=own.pinPackLimit?'Pin packs':'',own.used.text>=own.limits.text?'text':'',own.used.image>=own.limits.image?'images':''].filter(Boolean).join(', ')}. Other accounts are unaffected.</p>}
  {own?.resetAt?<p className="mt-2 text-neutral-500">Resets at {new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',dateStyle:'medium',timeStyle:'short'}).format(new Date(own.resetAt))} Bangladesh time (Asia/Dhaka).</p>:<p className="mt-2 text-neutral-500">Allowances reset at midnight Bangladesh time (Asia/Dhaka), separately for every account.</p>}
  <p className="mt-1 text-neutral-500">No shared site-wide daily allowance blocks other users. Provider quotas, temporary outages and per-account cooldowns still apply. Status refreshes every minute and when you return.</p>
  {!user&&state.error&&<p role="status" className="mt-2">{state.error}</p>}
 </section>;
}
