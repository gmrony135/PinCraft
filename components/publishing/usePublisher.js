"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {useAuth} from '../providers/AppProvider';
export async function publishRequest(path,{method='GET',body,signal}={}){
 const response=await fetch('/api/publish/'+path,{method,credentials:'same-origin',cache:'no-store',signal,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});let value;try{value=await response.json();}catch{throw new Error('The publishing response could not be confirmed. Inspect Jobs before resubmitting.');}if(!response.ok)throw Object.assign(new Error(value.error||'Publishing could not be confirmed.'),{code:value.code,status:response.status});return value;
}
export function usePublisher(){
 const auth=useAuth(),[snapshot,setSnapshot]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),owner=useRef(null),sequence=useRef(0);owner.current=auth.user?.id||null;
 const refresh=useCallback(async()=>{const uid=owner.current,id=++sequence.current;if(!uid){setSnapshot(null);setLoading(false);return;}try{const result=await publishRequest('status');if(owner.current===uid&&sequence.current===id){setSnapshot(result);setError('');}}catch(issue){if(owner.current===uid&&sequence.current===id){setSnapshot(null);setError(issue.message);}}finally{if(owner.current===uid&&sequence.current===id)setLoading(false);}},[]);
 useEffect(()=>{setSnapshot(null);setError('');setLoading(true);if(!auth.authLoading)refresh();const visible=()=>{if(!document.hidden)refresh();};const timer=setInterval(visible,60000);return()=>{sequence.current++;clearInterval(timer);};},[auth.authLoading,auth.user?.id,refresh]);
 return {...auth,data:snapshot&&auth.user&&snapshot.accountId===auth.user.id?snapshot:null,loading:loading||auth.authLoading,error,refresh};
}
