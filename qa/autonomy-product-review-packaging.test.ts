import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createManifest,checkpoint,main,verifyManifest} from '../scripts/autonomy-candidate.mjs';

function fixture(run: (root: string, git: (args: string[]) => string) => void) {
 const root=mkdtempSync(path.join(os.tmpdir(),'sett-independent-packaging-'));
 const git=(args: string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 try {
  git(['init','-q']);git(['config','user.name','Synthetic QA']);git(['config','user.email','qa@example.invalid']);
  writeFileSync(path.join(root,'README.md'),'synthetic baseline');
  git(['add','README.md']);git(['commit','-qm','baseline']);
  mkdirSync(path.join(root,'src'));
  run(root,git);
 } finally {rmSync(root,{recursive:true,force:true});}
}

test('checkpoint must stage only literal reviewed paths, even wildcard filenames',()=>fixture((root,git)=>{
 writeFileSync(path.join(root,'src','*.ts'),'export const reviewed=true;');
 writeFileSync(path.join(root,'src','unreviewed.ts'),'export const unrelated=true;');
 const manifest=createManifest(root,['src/*.ts'],git(['rev-parse','HEAD']));
 const result=checkpoint(root,manifest);
 const added=git(['diff-tree','--no-commit-id','--name-only','-r',result.commit]).split('\n');
 assert.deepEqual(added,['src/*.ts']);
}));

test('manifest output must not follow a symlink outside the workspace',()=>fixture((root)=>{
 const external=mkdtempSync(path.join(os.tmpdir(),'sett-independent-outside-'));
 const previous=process.cwd();
 try {
  mkdirSync(path.join(root,'output'));
  symlinkSync(external,path.join(root,'output','self-service-local-candidate'));
  writeFileSync(path.join(external,'manifest.json'),'SYNTHETIC SENTINEL');
  process.chdir(root);
  assert.throws(()=>main(['write']),/symlink|ordinary|escaped|workspace|output/i);
  assert.equal(readFileSync(path.join(external,'manifest.json'),'utf8'),'SYNTHETIC SENTINEL');
 } finally {process.chdir(previous);rmSync(external,{recursive:true,force:true});}
}));

test('changed reviewed bytes are rejected before any checkpoint',()=>fixture((root,git)=>{
 writeFileSync(path.join(root,'src','app.ts'),'export const version=1;');
 const manifest=createManifest(root,['src/app.ts'],git(['rev-parse','HEAD']));
 writeFileSync(path.join(root,'src','app.ts'),'export const version=2;');
 assert.throws(()=>verifyManifest(root,manifest),/changed/);
 assert.throws(()=>checkpoint(root,manifest),/changed/);
 assert.equal(git(['for-each-ref','--format=%(refname)','refs/candidates']), '');
}));


test('staged rename must be rejected until removal is explicitly supported',()=>fixture((root,git)=>{
 writeFileSync(path.join(root,'src','old.ts'),'export const retained=true;');
 git(['add','src/old.ts']);git(['commit','-qm','tracked source baseline']);
 git(['mv','src/old.ts','src/new.ts']);
 const previous=process.cwd();
 try {
  process.chdir(root);
  assert.throws(()=>main(['write']),/deletion|rename|removal|review/i);
 } finally {process.chdir(previous);}
}));
