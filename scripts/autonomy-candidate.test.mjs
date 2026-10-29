import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {category,secretKinds,createManifest,verifyManifest,checkpoint} from './autonomy-candidate.mjs';

test('candidate excludes private execution evidence and accepts product/migration sources',()=>{
 for(const name of ['.env.local','output/credentials.json','qa/report.png','supabase/.temp/token','../src/app.ts','src/link.private.ts'])assert.equal(category(name),null,name);
 assert.equal(category('src/pages/admin/Settings.tsx'),'application');
 assert.equal(category('supabase/migrations/20261028090101_methodology.sql'),'migration');
});
test('local checkpoint captures explicit files without changing branch or ordinary index',()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'sett-candidate-repo-'));
 const git=(args,input)=>execFileSync('git',args,{cwd:root,input,encoding:'utf8'}).trim();
 try{
  git(['init','-q']);git(['config','user.name','Synthetic']);git(['config','user.email','synthetic@example.invalid']);
  mkdirSync(path.join(root,'src'));writeFileSync(path.join(root,'src/app.ts'),'export const version=1;');
  git(['add','src/app.ts']);git(['commit','-qm','baseline']);const baseline=git(['rev-parse','HEAD']);
  writeFileSync(path.join(root,'src/app.ts'),'export const version=2;');
  writeFileSync(path.join(root,'private.env'),'synthetic-only');
  const manifest=createManifest(root,['src/app.ts','private.env'],baseline);
  const before=git(['status','--porcelain']);const result=checkpoint(root,manifest);
  assert.equal(git(['rev-parse','HEAD']),baseline);assert.equal(git(['status','--porcelain']),before);
  assert.equal(git(['show',`${result.commit}:src/app.ts`]),'export const version=2;');
  assert.throws(()=>git(['cat-file','-e',`${result.commit}:private.env`]));
  assert.equal(result.noDeploy,true);assert.equal(result.workingBranchUnchanged,true);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('known privileged credentials fail closed without returning their value',()=>{
 const value='sk_'+'live_'+'q'.repeat(30);assert.deepEqual(secretKinds(value),['provider-secret']);
 const jwt='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.'+'q'.repeat(30);
 assert.deepEqual(secretKinds(jwt),['privileged-jwt']);assert.deepEqual(secretKinds('process.env.SUPABASE_SERVICE_ROLE_KEY'),[]);
});
test('manifest verifies exact bytes and rejects drift and symlink inclusion',()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'sett-candidate-'));
 try{
  mkdirSync(path.join(root,'src'));writeFileSync(path.join(root,'src/app.ts'),'export const ready=true;');
  const manifest=createManifest(root,['src/app.ts','output/private.json'],'baseline');
  assert.equal(manifest.files.length,1);assert.equal(verifyManifest(root,manifest).verified,true);
  writeFileSync(path.join(root,'src/app.ts'),'export const ready=false;');assert.throws(()=>verifyManifest(root,manifest),/changed/);
  symlinkSync(path.join(root,'src/app.ts'),path.join(root,'src/link.ts'));assert.throws(()=>createManifest(root,['src/link.ts'],'baseline'),/ordinary file/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
