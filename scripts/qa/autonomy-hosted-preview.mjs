// Private, loopback-only frontend for the owned SETT staging environment.
// No production deployment, provider credential, response rewriting or local DB.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chmodSync,cpSync,existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,realpathSync,statSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {secretKinds} from '../autonomy-candidate.mjs';

export const PROJECT='ifymocggowdlqqcxugko';
export const UPSTREAM=`https://${PROJECT}.supabase.co`;
export const ORIGIN='http://127.0.0.1:57650';
export const FUNCTIONS=['public-registration','public-anamnesis','ai-prescribe-workout','student-workout-feedback'];
export const UI_ASSETS=['icon-192.png','icon-512.png','icon.svg','favicon.png','placeholder.svg','manifest.webmanifest','sw.js','bn-content/logo.png','pets/benito-v2/pet.json','pets/benito-v2/spritesheet.webp','pets/benito-v2/spritesheet-compact.webp'];
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const owned=path.join(repo,'output/hosted-staging-preflight-20261028');
const sha=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>{throw new Error(code);};

export function validateConfig(config){
 if(config?.projectRef!==PROJECT||config.backendAccepted!==true)fail('OWNED_BACKEND_NOT_ACCEPTED');
 const aliases=config.functionAliases;
 if(!aliases||typeof aliases!=='object'||Array.isArray(aliases)||Object.keys(aliases).sort().join('|')!==[...FUNCTIONS].sort().join('|'))fail('EXACT_ALIAS_MAP_REQUIRED');
 for(const [name,alias] of Object.entries(aliases))if(typeof alias!=='string'||alias.length>63||!/^qa-[a-z0-9-]+$/.test(alias)||!alias.endsWith(`-${name}`))fail('OWNED_ALIAS_REQUIRED');
 if(new Set(Object.values(aliases)).size!==FUNCTIONS.length)fail('DUPLICATE_ALIAS');
 return {...aliases};
}

export function apiPath(raw,aliases){
 const u=new URL(raw,ORIGIN);
 if(u.origin!==ORIGIN)fail('FOREIGN_REQUEST_ORIGIN');
 let decoded;try{decoded=decodeURIComponent(u.pathname);}catch{fail('INVALID_PATH');}
 if(/[\\\x00-\x1f]/.test(decoded)||/%(?:2e|2f|5c)/i.test(decoded)||decoded.split('/').some(p=>p==='.'||p==='..'))fail('INVALID_PATH');
 if(!/^\/__api\/(?:auth|rest|storage|functions)\/v1(?:\/|$)/.test(decoded))fail('API_ROUTE_NOT_ALLOWED');
 const clean=decoded.replace(/^\/__api/,'');
 let routed=clean;
 if(clean.startsWith('/functions/v1')){
  const match=clean.match(/^\/functions\/v1\/([a-z0-9-]+)(?=\/|$)/);
  if(!match||!Object.hasOwn(aliases,match[1]))fail('FUNCTION_NOT_ALLOWED');
  routed=clean.replace(`/functions/v1/${match[1]}`,`/functions/v1/${aliases[match[1]]}`);
 }
 const target=new URL(UPSTREAM+routed+u.search);
 if(target.origin!==UPSTREAM)fail('FOREIGN_UPSTREAM');
 return target.pathname+target.search;
}

export function checkBearer(header){
 if(header===undefined)return;
 if(typeof header!=='string'||!header.startsWith('Bearer ')||header.length>16000)fail('BEARER_NOT_ALLOWED');
 let payload;try{payload=JSON.parse(Buffer.from(header.slice(7).split('.')[1]||'','base64url').toString());}catch{fail('BEARER_NOT_ALLOWED');}
 const ownIssuer=`${UPSTREAM}/auth/v1`;
 const own=payload.role==='anon' ? payload.ref===PROJECT&&['supabase',ownIssuer].includes(payload.iss) : payload.role==='authenticated'&&payload.iss===ownIssuer;
 if(!own||(payload.ref&&payload.ref!==PROJECT))fail('BEARER_NOT_ALLOWED');
 // Scope screening only. Supabase/GoTrue must still verify the actual signature.
}

export function checkRequest(req){
 if(req.headers.host!=='127.0.0.1:57650'||(req.headers.origin&&req.headers.origin!==ORIGIN))fail('REQUEST_ORIGIN_NOT_ALLOWED');
 const u=new URL(req.url||'/',ORIGIN);
 if(u.origin!==ORIGIN)fail('FOREIGN_REQUEST_ORIGIN');
 let decoded;try{decoded=decodeURIComponent(u.pathname);}catch{fail('INVALID_PATH');}
 if(/[\\\x00-\x1f]/.test(decoded)||/%(?:2e|2f|5c)/i.test(decoded)||decoded.split('/').some(p=>p==='.'||p==='..'))fail('INVALID_PATH');
 if(!decoded.startsWith('/__api/')&&(/^\/(?:output|src|node_modules|@fs|gravacao)(?:\/|$)/.test(decoded)||decoded.split('/').some(p=>p.startsWith('.'))))fail('PRIVATE_PATH_NOT_ALLOWED');
 checkBearer(req.headers.authorization);
 return decoded.startsWith('/__api/');
}

function sourceHash(){
 const hash=createHash('sha256');
 function visit(dir){for(const name of readdirSync(dir).sort()){const file=path.join(dir,name),s=lstatSync(file);if(s.isSymbolicLink())fail('SOURCE_SYMLINK');if(s.isDirectory())visit(file);else if(/\.(tsx?|css)$/.test(name)&&!/[.](test|spec)[.]/.test(name))hash.update(path.relative(repo,file)+'\0').update(readFileSync(file));}}
 visit(path.join(repo,'src'));return hash.digest('hex');
}

function files(dir){return readdirSync(dir).flatMap(name=>{const file=path.join(dir,name),s=lstatSync(file);if(s.isSymbolicLink())fail('ARTIFACT_SYMLINK');return s.isDirectory()?files(file):[file];});}
function privateJson(file,data){writeFileSync(file,JSON.stringify(data,null,2)+'\n',{mode:0o600});chmodSync(file,0o600);}
function ownedDirectory(dir){
 if(!dir.startsWith(owned+path.sep)||realpathSync(owned)!==owned)fail('OWNED_DIRECTORY_REQUIRED');
 let current=owned;
 for(const segment of path.relative(owned,dir).split(path.sep)){
  current=path.join(current,segment);
  if(existsSync(current)){const s=lstatSync(current);if(s.isSymbolicLink()||!s.isDirectory())fail('OWNED_DIRECTORY_REQUIRED');}
  else mkdirSync(current,{mode:0o700});
 }
 if(realpathSync(dir)!==dir)fail('OWNED_DIRECTORY_REQUIRED');
}

export async function main(configFile){
 if(process.env.NODE_DEBUG||process.env.NODE_DEBUG_NATIVE)fail('NATIVE_DEBUG_ENV_NOT_ALLOWED');
 const absolute=path.resolve(configFile||'');
 if(!absolute.startsWith(owned+path.sep)||!lstatSync(absolute).isFile()||lstatSync(absolute).isSymbolicLink()||realpathSync(absolute)!==absolute||((statSync(absolute).mode&0o7777)!==0o600)||statSync(absolute).size>262144)fail('PRIVATE_OWNED_CONFIG_REQUIRED');
 const config=JSON.parse(readFileSync(absolute,'utf8')),aliases=validateConfig(config);
 const response=execFileSync('supabase',['projects','api-keys','--project-ref',PROJECT,'--output','json'],{cwd:repo,encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe'],maxBuffer:1024*1024});
 const keys=JSON.parse(response),anon=keys.find(row=>row.name==='anon')?.api_key;
 if(typeof anon!=='string')fail('STAGING_PUBLIC_KEY_UNAVAILABLE');
 checkBearer(`Bearer ${anon}`);
 const request=async(route,options={})=>fetch(UPSTREAM+route,{...options,redirect:'error',headers:{apikey:anon,Authorization:`Bearer ${anon}`,...options.headers},signal:AbortSignal.timeout(15000)});
 if((await request('/auth/v1/health')).status!==200)fail('STAGING_AUTH_NOT_READY');
 if((await request('/rest/v1/rpc/get_public_platform_content',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status!==200)fail('CURRENT_CANDIDATE_NOT_READY');
 const aliasReady=config.aliasReadiness!==false;
 if(aliasReady)for(const alias of Object.values(aliases)){const r=await request(`/functions/v1/${alias}`,{method:'OPTIONS',headers:{Origin:ORIGIN}});if(![200,204].includes(r.status))fail('ALIAS_NOT_READY');}
 const dir=path.join(owned,'frontend.private');ownedDirectory(dir);
 const envDir=path.join(dir,'empty-env');ownedDirectory(envDir);
 if(readdirSync(envDir).length)fail('EMPTY_BUILD_ENV_REQUIRED');
 for(const key of Object.keys(process.env))if(key.startsWith('VITE_'))delete process.env[key];
 // Vite/debug reads these at module load; never inherit request-query logging.
 delete process.env.DEBUG;delete process.env.NODE_DEBUG;delete process.env.NODE_DEBUG_NATIVE;
 process.env.VITE_SUPABASE_URL=ORIGIN+'/__api';process.env.VITE_SUPABASE_PROJECT_ID=PROJECT;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=anon;
 const before=sourceHash(),outDir=path.join(dir,'compiled');ownedDirectory(outDir);ownedDirectory(path.join(dir,'vite-cache'));
 const {build,preview}=await import('vite');
 await build({root:repo,envDir,mode:'production',publicDir:false,logLevel:'silent',cacheDir:path.join(dir,'vite-cache'),build:{outDir,emptyOutDir:true,sourcemap:false}});
 if(sourceHash()!==before)fail('SOURCE_CHANGED_DURING_BUILD');
 for(const name of UI_ASSETS){const from=path.join(repo,'public',name);if(!existsSync(from))continue;if(lstatSync(from).isSymbolicLink()||realpathSync(from)!==from)fail('PUBLIC_ASSET_SYMLINK');ownedDirectory(path.dirname(path.join(outDir,name)));cpSync(from,path.join(outDir,name));}
 for(const file of files(outDir))if(/\.(js|html|json|svg|webmanifest)$/.test(file)&&secretKinds(readFileSync(file,'utf8')).length)fail('ARTIFACT_CREDENTIAL_REVIEW_REQUIRED');
 const gatewayPlugin={name:'owned-staging-preview',configurePreviewServer(server){server.middlewares.use((req,res,next)=>{
  try{if(checkRequest(req)){const targetPath=apiPath(req.url,aliases);if(!aliasReady&&targetPath.startsWith('/functions/v1/'))fail('EDGE_ALIASES_NOT_READY');}}
  catch{res.writeHead(403,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"Request not allowed in owned preview"}');return;}
  res.setHeader('Cache-Control','no-store');next();
 });}};
 const web=await preview({root:repo,envDir,mode:'production',logLevel:'silent',plugins:[gatewayPlugin],build:{outDir},preview:{host:'127.0.0.1',port:57650,strictPort:true,proxy:{'/__api/':{
  target:UPSTREAM,changeOrigin:true,secure:true,ws:false,timeout:30000,proxyTimeout:30000,
  rewrite:raw=>apiPath(raw,aliases),
  configure(proxy){proxy.removeAllListeners('error');proxy.on('error',(_error,_req,res)=>{if(res&&!res.headersSent){res.writeHead(502,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"Staging request unavailable"}');}});
   proxy.on('proxyReq',request=>{request.setHeader('apikey',anon);for(const header of ['origin','cookie','referer','x-forwarded-for','x-forwarded-host','x-forwarded-proto','forwarded'])request.removeHeader(header);});
   proxy.on('proxyRes',response=>{response.headers['cache-control']='no-store';delete response.headers['set-cookie'];});
  },
 }}}});
 try{
  privateJson(path.join(owned,'hosted-preview.private.json'),{ready:true,url:ORIGIN,projectRef:PROJECT,upstream:UPSTREAM,compiled:true,sourceSha256:before,anonymousKeySha256:sha(anon),functionAliases:aliases,loopbackOnly:true,noProductionDeploy:true,aliasReadiness:aliasReady,mode:aliasReady?'full':'core-auth-rest-storage',pid:process.pid});
  console.log(JSON.stringify({ready:true,url:ORIGIN,projectRef:PROJECT,loopbackOnly:true,noProductionDeploy:true,aliasReadiness:aliasReady}));
  await new Promise(resolve=>{process.once('SIGTERM',resolve);process.once('SIGINT',resolve);});
 }finally{
  web.httpServer.closeAllConnections?.();await new Promise(resolve=>web.httpServer.close(resolve));
  privateJson(path.join(owned,'hosted-preview.private.json'),{ready:false,stopped:true,projectRef:PROJECT,noProductionDeploy:true});
 }
}

if(process.argv[1]===fileURLToPath(import.meta.url))main(process.argv[2]).catch(()=>{console.error('OWNED_PREVIEW_START_FAILED — inspect owned readiness gates; no credentials logged');process.exitCode=1;});
