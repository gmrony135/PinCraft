'use client';
import {useEffect,useState} from 'react';
export default function StableLibraryImage({src,alt,portrait=false,eager=false}) {
 const [ready,setReady]=useState(false),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{setReady(false);setFailed(false);setRetry(0)},[src]);
 // Portrait pins use an exact 2:3 frame, centered, so the artwork fills it without side cropping.
 // Landscape article covers keep their full frame (object-contain).
 return <div className={`relative mt-3 overflow-hidden rounded-xl border border-neutral-100 bg-neutral-100 ${portrait?'mx-auto':'w-full'}`} style={portrait?{aspectRatio:'2 / 3',height:256,width:171}:{aspectRatio:'1200 / 630',maxHeight:192}}>
  {!ready&&!failed&&<div role="status" className="absolute inset-0 flex animate-pulse items-center justify-center text-xs text-neutral-500">Loading saved image…</div>}
  {failed?<div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-xs text-neutral-600">Image could not be loaded.<button type="button" className="min-h-10 font-bold underline" onClick={()=>{setFailed(false);setReady(false);setRetry(v=>v+1)}}>Retry image</button></div>:<img key={`${src}:${retry}`} src={src} alt={alt} width={portrait?1000:1200} height={portrait?1500:630} loading={eager?"eager":"lazy"} fetchPriority={eager?"high":"auto"} decoding="async" onLoad={async e=>{try{await e.currentTarget.decode()}catch{}setReady(true)}} onError={()=>setFailed(true)} className={`absolute inset-0 h-full w-full ${portrait?'object-cover':'object-contain'} object-center transition-opacity ${ready?'opacity-100':'opacity-0'}`} />}
 </div>;
}
