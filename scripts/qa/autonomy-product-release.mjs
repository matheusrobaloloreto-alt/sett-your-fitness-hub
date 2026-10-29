import {build,preview} from 'vite';
import {stopOwnedChildren} from './owned-child-cleanup.mjs';
import {spawn} from 'node:child_process';
import {createHmac,createHash} from 'node:crypto';
import {readFileSync,openSync,writeFileSync,cpSync,lstatSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../../',import.meta.url));
const input=path.resolve(process.argv[2]||'');
if(!input.startsWith(path.join(repo,'output/self-service-local-20261026/sett-complete-'))||!input.endsWith('.private/preview-access.private.json'))throw Error('Own synthetic preview access required');
const access=JSON.parse(readFileSync(input)),dir=path.dirname(input);
if(access.syntheticOnly!==true||access.api!=='http://127.0.0.1:57621')throw Error('Preview backend is not the owned loopback API');
const credentials=JSON.parse(readFileSync(path.join(dir,'credentials.json'))),api='http://127.0.0.1:57621',ui='http://127.0.0.1:57632';
function key(role){const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const value=`${enc({alg:'HS256',typ:'JWT'})}.${enc({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+604800})}`;return value+'.'+createHmac('sha256',credentials.jwtSecret).update(value).digest('base64url');}
const anonymous=key('anon'),service=key('service_role');
const envFile=path.join(dir,'product-edges.env');
writeFileSync(envFile,`SUPABASE_URL=${api}\nSUPABASE_ANON_KEY=${anonymous}\nSUPABASE_SERVICE_ROLE_KEY=${service}\nPUBLIC_APP_URL=${ui}\nPRESCRIPTION_AI_FIRST=off\n`,{mode:0o600});
const definitions=[['public-anamnesis',57641],['intercycle-anamnesis',57642],['public-registration',57643],['ai-prescribe-workout',57644]],children=[],active=[],blocked=[];
function sourceFingerprint(){
 const entries=[];
 const visit=relative=>{const absolute=path.join(repo,relative);const stat=lstatSync(absolute);if(stat.isSymbolicLink())return;if(stat.isDirectory()){for(const child of readdirSync(absolute).sort())visit(path.join(relative,child));}else if(stat.isFile())entries.push([relative,createHash('sha256').update(readFileSync(absolute)).digest('hex')]);};
 for(const folder of ['src','supabase/functions'])visit(folder);
 return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}
let web;
const removeOrigin=proxy=>proxy.on('proxyReq',request=>request.removeHeader('origin'));
try{
 for(const [name,port] of definitions){
  const log=openSync(path.join(dir,`${name}-release.private.log`),'w',0o600);
  const child=spawn('deno',['run','--no-config','--no-lock','--cached-only','--node-modules-dir=none',
   '--allow-env=SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,PUBLIC_APP_URL,PRESCRIPTION_AI_FIRST,ANTHROPIC_API_KEY,ANTHROPIC_MODEL,PRESCRIPTION_ENGINE_V1',
   `--allow-read=${path.join(repo,'supabase/functions')}`,`--allow-net=127.0.0.1:57621,127.0.0.1:${port}`,
   `--env-file=${envFile}`,'qa/autonomy-product-edge-runner.ts',name],
   {cwd:repo,env:{PATH:process.env.PATH,HOME:process.env.HOME,DENO_DIR:path.join(repo,'output/self-service-local-20261026/deno-cache'),NO_COLOR:'1'},stdio:['ignore',log,log]});
  let spawnFailed=false;child.on('error',()=>{spawnFailed=true;});
  children.push(child);let ready=false;
  for(let n=0;n<16;n++){
   if(spawnFailed||child.exitCode!==null)break;
   try{const r=await fetch(`http://127.0.0.1:${port}/`,{method:'OPTIONS',signal:AbortSignal.timeout(1000)});if(r.status===200||r.status===204){ready=true;break;}}catch{}
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  (ready?active:blocked).push({name,port});
 }
 process.env.VITE_SUPABASE_URL=ui+'/__api';process.env.VITE_SUPABASE_PUBLISHABLE_KEY=anonymous;process.env.VITE_SUPABASE_PROJECT_ID='sett-autonomy-preview';
 const sourceSha256=sourceFingerprint();
 const outDir=path.join(dir,'compiled');
 await build({root:repo,envDir:dir,mode:'production',publicDir:false,cacheDir:path.join(dir,'release-vite-cache'),build:{outDir,emptyOutDir:true}});
 if(sourceFingerprint()!==sourceSha256)throw Error('Product sources changed during build');
 // Preserve ordinary public UI assets; do not copy operational recording pages.
 const publicRoot=path.join(repo,'public');
 for(const name of readdirSync(publicRoot))if(name!=='gravacao'&&!lstatSync(path.join(publicRoot,name)).isSymbolicLink())cpSync(path.join(publicRoot,name),path.join(outDir,name),{recursive:true,filter:source=>!lstatSync(source).isSymbolicLink()});
 const proxy={};
 for(const {name,port} of active)proxy[`/__api/functions/v1/${name}`]={target:`http://127.0.0.1:${port}`,changeOrigin:true,rewrite:p=>p.replace(/^\/__api/,''),configure:removeOrigin};
 proxy['/__api/storage/v1']={target:'http://127.0.0.1:57645',changeOrigin:true,rewrite:p=>p.replace(/^\/__api\/storage\/v1/,''),configure:removeOrigin};
 proxy['/__api']={target:api,changeOrigin:true,rewrite:p=>p.replace(/^\/__api/,''),configure:removeOrigin};
 web=await preview({root:repo,envDir:dir,mode:'production',build:{outDir},preview:{host:'127.0.0.1',port:57632,strictPort:true,proxy}});
 const evidence={ready:true,url:ui,syntheticOnly:true,compiled:true,sourceSha256,activeHandlers:active.map(x=>x.name),blockedHandlers:blocked.map(x=>x.name),noDeploy:true,pid:process.pid};
 writeFileSync(path.join(dir,'compiled-preview.json'),JSON.stringify(evidence,null,2),{mode:0o600});
 console.log(JSON.stringify(evidence));
 await new Promise(resolve=>{process.once('SIGTERM',resolve);process.once('SIGINT',resolve);});
}finally{
 if(web){web.httpServer.closeAllConnections?.();await new Promise(resolve=>web.httpServer.close(resolve));}
 const cleanup=await stopOwnedChildren(children);
 writeFileSync(path.join(dir,'compiled-cleanup.json'),JSON.stringify({children:cleanup,confirmed:cleanup.every(x=>x.stopped),noDeploy:true},null,2),{mode:0o600});
 if(cleanup.some(x=>!x.stopped))process.exitCode=1;
}
