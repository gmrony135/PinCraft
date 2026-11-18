// Explicit opt-in watcher. Build before committing stable source changes.
// New .env files, credentials, uploads and generated output are never staged.
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const paths=['app','components','lib','public','scripts','tests','.github','.githooks','next.config.js','package.json','package-lock.json','vercel.json'].filter(p=>existsSync(p));
const run=(cmd,args,options={})=>spawnSync(cmd,args,{encoding:'utf8',...options});
const status=()=>{const changed=run('git',['ls-files','-m','-o','--exclude-standard','--',...paths]).stdout.trim().split('\n').filter(Boolean);const deleted=run('git',['diff','--name-only','--diff-filter=D','--',...paths]).stdout;if(!changed.length&&!deleted)return '';const hash=createHash('sha256');for(const file of changed){hash.update(file);if(existsSync(file))hash.update(readFileSync(file));}hash.update(run('git',['diff','--name-only','--diff-filter=D','--',...paths]).stdout);return hash.digest('hex');};
let last=status(),changedAt=last?Date.now():0,busy=false;
console.log('Auto-push watcher active: 15-second debounce, successful build required, no force pushes.');
setInterval(()=>{
 if(busy)return;const current=status();if(current!==last){last=current;changedAt=Date.now();return;}
 if(!current||!changedAt||Date.now()-changedAt<15000)return;
 busy=true;try{
  if(run('git',['diff','--cached','--quiet']).status!==0){console.error('Staged changes found; leaving them for explicit review.');changedAt=Date.now()+45000;return;}
  const build=run('npm',['run','build'],{stdio:'inherit'});if(build.status!==0){console.error('Build failed; no commit or push.');changedAt=Date.now()+45000;return;}
  if(status()!==current){last=status();changedAt=Date.now();return;}
  if(run('git',['add','--',...paths]).status!==0)return;
  const result=run('git',['commit','-m','chore: validated source update'],{stdio:'inherit',env:{...process.env,PINCRAFT_VALIDATED_COMMIT:'1'}});
  if(result.status!==0)console.error('Commit or hook failed; inspect Git status before retrying.');
  last=status();changedAt=last?Date.now():0;
 }finally{busy=false;}
},3000);
