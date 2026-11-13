import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
await mkdir(new URL('../functions/runtime/',import.meta.url),{recursive:true});
await build({entryPoints:[new URL('../functions/index.mjs',import.meta.url).pathname],outfile:new URL('../functions/runtime/index.mjs',import.meta.url).pathname,bundle:true,platform:'node',target:'node22',format:'esm',packages:'external',sourcemap:false,plugins:[{name:'server-only-marker',setup(api){api.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'marker'}));api.onLoad({filter:/.*/,namespace:'marker'},()=>({contents:'',loader:'js'}));}}]});
console.log('Firebase scheduled worker bundled from the same Firestore/OAuth code as the website. No secrets embedded.');
