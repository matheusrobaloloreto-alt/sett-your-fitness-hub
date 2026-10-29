import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,writeFileSync,mkdirSync,realpathSync,mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const sha=b=>createHash('sha256').update(b).digest('hex');
export function category(name){
 if(!name||name.includes('\\')||name.split('/').some(p=>p==='..'||p.startsWith('.env'))||/\.(private|log|har|png|jpg|webm|mp4|pdf)(\.|$)/i.test(name))return null;
 if(/^src\/.*\.(tsx?|css)$/.test(name))return /\.(test|spec)\./.test(name)?'verification':'application';
 if(/^supabase\/migrations\/\d{14}_[\w-]+\.sql$/.test(name))return 'migration';
 if(/^supabase\/functions\/.*\.(tsx?|json)$/.test(name))return /(_test|\.test)\./.test(name)?'verification':'application';
 if(/^supabase\/tests\/.*\.sql$/.test(name)||/^qa\/.*\.(tsx?|mjs)$/.test(name))return 'verification';
 if(/^scripts\/.*\.(mjs|js|ts|py|sh)$/.test(name))return 'tooling';
 if(/^public\/.*\.(js|css|html|json|svg)$/.test(name))return 'application';
 if(['docs/project/SETT-AUTONOMIA-ENTREGA.md','docs/project/SETT-AUTONOMIA-RELATORIO-FINAL.md'].includes(name))return 'delivery';
 if(['package.json','package-lock.json','deno.lock','.gitignore'].includes(name))return 'configuration';
 return null;
}
export function secretKinds(text){
 const kinds=[];
 if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))kinds.push('private-key');
 if(/\b(?:sk_live_|sk-proj-|sk-ant-|xox[baprs]-)[A-Za-z0-9_-]{18,}/.test(text))kinds.push('provider-secret');
 for(const match of text.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g)){
  try{if(JSON.parse(Buffer.from(match[0].split('.')[1],'base64url')).role==='service_role')kinds.push('privileged-jwt');}catch{/* Not a JWT. */}
 }
 return [...new Set(kinds)];
}
const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
function assertOrdinaryOutput(root,target){
 const canonical=realpathSync(root);
 if(!target.startsWith(path.join(canonical,'output')+path.sep))throw Error('Manifest output escaped workspace');
 let current=canonical;
 for(const segment of path.relative(canonical,target).split(path.sep)){
  current=path.join(current,segment);
  try{if(lstatSync(current).isSymbolicLink())throw Error('Manifest output cannot follow a symlink');}
  catch(error){if(error.code!=='ENOENT')throw error;}
 }
}
export function createManifest(root,names,baseline){
 const files=[],excluded={};const canonical=realpathSync(root);
 for(const name of [...new Set(names)].sort()){
  const group=category(name);if(!group){excluded.outsideCandidate=(excluded.outsideCandidate||0)+1;continue;}
  const absolute=path.resolve(canonical,name);
  if(!absolute.startsWith(canonical+path.sep))throw Error('Candidate path escaped workspace');
  const stat=lstatSync(absolute);if(!stat.isFile()||stat.isSymbolicLink()||realpathSync(absolute)!==absolute)throw Error(`Candidate requires ordinary file: ${name}`);
  const bytes=readFileSync(absolute),secrets=secretKinds(bytes.toString('utf8'));
  if(secrets.length)throw Error(`Credential review required: ${name} [${secrets.join(',')}]`);
  files.push({path:name,category:group,bytes:bytes.length,sha256:sha(bytes)});
 }
 return {format:1,stage:'local-candidate',baseline,files,excluded,noDeploy:true};
}
export function verifyManifest(root,manifest){
 const current=createManifest(root,manifest.files.map(f=>f.path),manifest.baseline);
 if(JSON.stringify(current.files)!==JSON.stringify(manifest.files))throw Error('Candidate source changed; regenerate after review');
 return {verified:true,files:current.files.length};
}
export function checkpoint(root,manifest){
 verifyManifest(root,manifest);
 if(git(root,['rev-parse','HEAD']).trim()!==manifest.baseline)throw Error('Baseline changed; review candidate again');
 const directory=mkdtempSync(path.join(os.tmpdir(),'sett-candidate-index-'));
 const ref=`refs/candidates/sett-autonomy-${Date.now()}`;
 const env={...process.env,GIT_INDEX_FILE:path.join(directory,'index'),
  GIT_AUTHOR_NAME:'SETT Local Candidate',GIT_AUTHOR_EMAIL:'local@sett.invalid',
  GIT_COMMITTER_NAME:'SETT Local Candidate',GIT_COMMITTER_EMAIL:'local@sett.invalid'};
 const run=(args,input,encoding='utf8')=>execFileSync('git',args,{cwd:root,env,input,encoding,maxBuffer:16*1024*1024});
 try{
  run(['read-tree',manifest.baseline]);
  run(['--literal-pathspecs','add','--pathspec-from-file=-','--pathspec-file-nul'],manifest.files.map(f=>f.path).join('\0')+'\0');
  for(const file of manifest.files){
   if(sha(run(['show',`:${file.path}`],undefined,null))!==file.sha256)throw Error(`Staged bytes changed: ${file.path}`);
  }
  verifyManifest(root,manifest);
  const tree=run(['write-tree']).trim();
  const commit=run(['commit-tree',tree,'-p',manifest.baseline],`SETT autonomy local candidate\n\nExplicit reviewed sources; no deploy.\n`).trim();
  if(git(root,['rev-parse','HEAD']).trim()!==manifest.baseline)throw Error('Baseline changed before checkpoint');
  run(['update-ref',ref,commit,'0000000000000000000000000000000000000000']);
  return {commit,ref,files:manifest.files.length,workingBranchUnchanged:true,noPush:true,noDeploy:true};
 }finally{rmSync(directory,{recursive:true,force:true});}
}
export function main(args=process.argv.slice(2)){
 const root=realpathSync(git(process.cwd(),['rev-parse','--show-toplevel']).trim());
 const mode=args[0]||'inspect',destination=args[1]||'output/self-service-local-candidate/manifest.json';
 const target=path.resolve(root,destination);
 assertOrdinaryOutput(root,target);
 if(mode==='verify')return verifyManifest(root,JSON.parse(readFileSync(target)));
 if(mode==='checkpoint')return checkpoint(root,JSON.parse(readFileSync(target)));
 const deleted=git(root,['diff','--no-renames','--name-only','--diff-filter=D','-z','HEAD']).split('\0').filter(name=>category(name));
 if(deleted.length)throw Error('Candidate contains deletions requiring explicit review');
 const names=git(root,['diff','--name-only','--diff-filter=ACMR','-z','HEAD']).split('\0').filter(Boolean)
  .concat(git(root,['ls-files','--others','--exclude-standard','-z']).split('\0').filter(Boolean));
 const manifest=createManifest(root,names,git(root,['rev-parse','HEAD']).trim());
 if(mode==='write'){mkdirSync(path.dirname(target),{recursive:true,mode:0o700});assertOrdinaryOutput(root,target);writeFileSync(target,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});}
 else if(mode!=='inspect')throw Error('Use inspect, write, or verify');
 return {stage:manifest.stage,files:manifest.files.length,categories:manifest.files.reduce((a,f)=>(a[f.category]=(a[f.category]||0)+1,a),{}),excluded:manifest.excluded,noDeploy:true};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(main()));}catch(error){console.error(error.message);process.exitCode=1;}
}
