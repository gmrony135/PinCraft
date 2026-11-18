"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {useAuth} from '../providers/AppProvider';
export async function publishRequest(path,{method='GET',body,signal,timeoutMs=0}={}){
 // A hung request must never leave the page silently busy or silently dropped.
 // The timeout is reported as 504 so the composer keeps the same submission ID and
 // offers a safe resume, instead of allowing a second, different submission.
 const controller=new AbortController(), abort=()=>controller.abort();
 if(signal?.aborted)controller.abort(); else signal?.addEventListener('abort',abort,{once:true});
 const timer=timeoutMs>0?setTimeout(()=>controller.abort(),timeoutMs):null;
 let response;
 try{
  response=await fetch('/api/publish/'+path,{method,credentials:'same-origin',cache:'no-store',signal:controller.signal,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
 }catch(issue){
  if(signal?.aborted)throw issue;
  if(timer&&controller.signal.aborted)throw Object.assign(new Error(`PinCraft did not confirm this request within ${Math.round(timeoutMs/1000)} seconds. Nothing is confirmed yet. Open Jobs to check whether it was saved. Resuming uses the same submission ID, so it cannot create a duplicate.`),{status:504,code:'client_timeout'});
  throw Object.assign(new Error('The connection to PinCraft failed before the publishing request was confirmed. Open Jobs to check before trying again.'),{status:504,code:'network_error'});
 }finally{
  if(timer)clearTimeout(timer);
  signal?.removeEventListener('abort',abort);
 }
 let value;
 try{value=await response.json();}catch{throw Object.assign(new Error('The publishing response could not be confirmed. Inspect Jobs before resubmitting.'),{status:504});}
 if(!response.ok)throw Object.assign(new Error(value.error||'Publishing could not be confirmed.'),{code:value.code,status:response.status});
 return value;
}
export function usePublisher(){
 const auth=useAuth(),[snapshot,setSnapshot]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),owner=useRef(null),sequence=useRef(0);owner.current=auth.user?.id||null;
 const refresh=useCallback(async()=>{const uid=owner.current,id=++sequence.current;if(!uid){setSnapshot(null);setLoading(false);return;}try{const result=await publishRequest('status');if(owner.current===uid&&sequence.current===id){setSnapshot(result);setError('');}}catch(issue){if(owner.current===uid&&sequence.current===id){setSnapshot(null);setError(issue.message);}}finally{if(owner.current===uid&&sequence.current===id)setLoading(false);}},[]);
 useEffect(()=>{setSnapshot(null);setError('');setLoading(true);if(!auth.authLoading)refresh();const visible=()=>{if(!document.hidden)refresh();};const timer=setInterval(visible,60000);return()=>{sequence.current++;clearInterval(timer);};},[auth.authLoading,auth.user?.id,refresh]);
 return {...auth,data:snapshot&&auth.user&&snapshot.accountId===auth.user.id?snapshot:null,loading:loading||auth.authLoading,error,refresh};
}
