import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readCapture,validateCapture,verifyCaptureManifest as verifyRuntimeManifest,output} from './commercial-complete-runtime.mjs';
import {schemaPlan,loadAuthCapture,policySQL,loadSequences,loadRoleDefaults} from './commercial-complete-runtime-install.mjs';
import {verifyCaptureManifest as verifyOfflineManifest} from './complete-schema-capture-audit.mjs';

// This independent file never starts Docker, connects to PostgreSQL, or requests HTTP.
// Caller must wait for final worker freeze / root release even for this regression run.
const accepted=process.env.COMPLETE_RUNTIME_INDEPENDENT_RELEASE==='1';
const gate={skip:accepted?false:'Awaiting worker final freeze or root release'};
const loadSupplement=()=>JSON.parse(readFileSync(`${output}/commercial-complete-privilege-detail.private.json`));

test('authoritative business snapshot and privilege supplement remain internally consistent',gate,()=>{
 const {data:c}=readCapture(); const s=loadSupplement();
 assert.equal(c.tables.length,171);
 assert.equal(c.tables.reduce((n,t)=>n+t.columns.length,0),2209);
 assert.equal(c.tables.reduce((n,t)=>n+t.constraints.length,0),692);
 assert.equal(c.functions.length,215);assert.equal(c.policies.length,611);
 assert.equal(c.triggers.length,131);assert.equal(c.indexes.length,208);
 assert.equal(c.views.length,1);assert.equal(c.omittedFunctions.length,0);
 assert.equal(s.columnAcls.length,20);assert.equal(s.sequences.length,2);
 assert.equal(s.functionFingerprints.length,215);
 const hashes=new Map(c.functions.map(f=>[f.signature,createHash('md5').update(f.definition).digest('hex')]));
 assert.equal(s.functionFingerprints.filter(f=>hashes.get(f.signature)!==f.md5).length,0,'Function fingerprints drifted');
});

test('installer enables only owned bootstrap transport before changing connection user',gate,()=>{
 const {data:c}=readCapture();const {data:auth}=loadAuthCapture();
 const plan=schemaPlan(c,auth,loadSequences().data,loadRoleDefaults().data);const first=plan.findIndex(p=>p.phase==='role-attributes');
 assert.ok(first>0);
 assert.match(plan.slice(0,first).map(p=>p.sql).join('\n'),/alter role\s+"?supabase_admin"?\s+login/i);
});

test('complete capture admission rejects removal of security-critical object sets',gate,()=>{
 const {data:c}=readCapture();
 for(const key of ['policies','triggers','roles','schemas','roleMemberships']){
  const altered=structuredClone(c);altered[key]=[];
  assert.throws(()=>validateCapture(altered),`Empty ${key} must not qualify as complete baseline`);
 }
 const altered=structuredClone(c);altered.omittedFunctions=[{signature:'missing_dependency()'}];
 assert.throws(()=>validateCapture(altered),'Omitted functions must block complete certification');
});


test('exact policy enum preserves every captured permissive/restrictive mode',gate,()=>{
 const {data:c}=readCapture();
 for(const p of c.policies){
  assert.ok(['PERMISSIVE','RESTRICTIVE'].includes(p.permissive));
  assert.ok(policySQL(p).includes(` as ${p.permissive.toLowerCase()} for `));
 }
 const p=c.policies[0];
 for(const mode of [true,false,'restrictive',null])assert.throws(()=>policySQL({...p,permissive:mode}));
});

test('precise sequences, full role attributes, membership ADMIN and creator defaults are captured',gate,()=>{
 const seq=loadSequences().data;
 assert.equal(seq.length,2);
 for(const s of seq){
  for(const k of ['start','increment','min','max','cache'])assert.equal(typeof s[k],'string');
  assert.ok(BigInt(s.min)<=BigInt(s.start)&&BigInt(s.start)<=BigInt(s.max));
 }
 assert.ok(seq.some(s=>s.max==='9223372036854775807'));
 const roles=JSON.parse(readFileSync(`${output}/commercial-complete-role-defaults.private.json`));
 assert.equal(roles.roles.length,16);assert.equal(roles.roleMemberships.length,22);
 assert.equal(roles.defaultPrivileges.length,6);
 for(const r of roles.roles)for(const k of ['inherit','bypassrls','superuser','createDb','createRole','replication','login'])assert.equal(typeof r[k],'boolean');
 for(const m of roles.roleMemberships)for(const k of ['admin','inherit','set'])assert.equal(typeof m[k],'boolean');
 for(const d of roles.defaultPrivileges)assert.ok(d.owner&&d.objectType&&Array.isArray(d.acl));
});


test('all nine authoritative catalog supplements match byte manifest and class counts',gate,()=>{
 const manifest=JSON.parse(readFileSync(`${output}/commercial-complete-capture-manifest.private.json`));
 assert.equal(manifest.project,'zshrcgbyhzxpnlccssyz');
 const expected=['schema','auth-acl','privilege-detail','sequences','role-defaults','storage-boundary','managed-gucs','auth-tables-acl','database'].map(n=>`commercial-complete-${n}.private.json`);
 assert.deepEqual(manifest.files.map(f=>f.name).sort(),expected.sort());
 const docs={};
 for(const f of manifest.files){
  assert.ok(!f.name.includes('/')&&!f.name.includes('..'));
  const bytes=readFileSync(`${output}/${f.name}`);
  assert.equal(bytes.length,f.bytes,`Length mismatch: ${f.name}`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256,`Hash mismatch: ${f.name}`);
  docs[f.name]=JSON.parse(bytes);
 }
 const c=docs['commercial-complete-schema.private.json'];
 const p=docs['commercial-complete-privilege-detail.private.json'];
 const r=docs['commercial-complete-role-defaults.private.json'];
 const actual={tables:c.tables.length,columns:c.tables.reduce((n,t)=>n+t.columns.length,0),constraints:c.tables.reduce((n,t)=>n+t.constraints.length,0),functions:c.functions.length,policies:c.policies.length,restrictivePolicies:c.policies.filter(p=>p.permissive==='RESTRICTIVE').length,indexes:c.indexes.length,triggers:c.triggers.length,columnAcls:p.columnAcls.length,sequences:docs['commercial-complete-sequences.private.json'].length,roles:r.roles.length,memberships:r.roleMemberships.length,defaultPrivileges:r.defaultPrivileges.length,storageObjectPolicies:docs['commercial-complete-storage-boundary.private.json'].objectPolicies.length,authTables:docs['commercial-complete-auth-tables-acl.private.json'].length};
 assert.deepEqual(manifest.counts,actual);
});


test('Root frozen manifest helper and runtime admission bind actual nine files; in-memory omissions and mutations denied',gate,()=>{
 const manifest=JSON.parse(readFileSync(`${output}/commercial-complete-capture-manifest.private.json`));
 const bytes=new Map(manifest.files.map(f=>[f.name,readFileSync(`${output}/${f.name}`)]));
 assert.equal(verifyOfflineManifest(manifest,bytes).files,9);
 const admitted=verifyRuntimeManifest();assert.equal(admitted.verified,true);assert.equal(admitted.files.length,9);
 for(const name of bytes.keys()){
  const omitted=new Map(bytes);omitted.delete(name);assert.throws(()=>verifyOfflineManifest(manifest,omitted));
  const changed=new Map(bytes);changed.set(name,Buffer.concat([bytes.get(name),Buffer.from(' ')]));
  assert.throws(()=>verifyOfflineManifest(manifest,changed));
 }
 const duplicate=structuredClone(manifest);duplicate.files[6]=duplicate.files[0];assert.throws(()=>verifyOfflineManifest(duplicate,bytes));
 const extra=new Map(bytes);extra.set('commercial-complete-extra.private.json',Buffer.from('{}'));assert.throws(()=>verifyOfflineManifest(manifest,extra));
});


test('actual Auth table ACL boundary includes both FK targets and captured postgres REFERENCES',gate,()=>{
 const tables=JSON.parse(readFileSync(`${output}/commercial-complete-auth-tables-acl.private.json`));
 assert.deepEqual(tables.map(t=>`${t.schema}.${t.name}`).sort(),['auth.sessions','auth.users']);
 for(const t of tables){
  assert.ok(t.owner);assert.equal(typeof t.rls,'boolean');assert.equal(typeof t.forceRls,'boolean');
  assert.equal((t.columnAcls||[]).length,0);
  assert.ok(t.acl.some(a=>a.grantee==='postgres'&&a.privilege==='REFERENCES'));
  assert.ok(!Object.hasOwn(t,'rows')&&!Object.hasOwn(t,'data'));
 }
});


test('captured database owner/ACL permits actual migration creator without elevated identity',gate,()=>{
 const db=JSON.parse(readFileSync(`${output}/commercial-complete-database.private.json`));
 assert.equal(db.name,'postgres');assert.equal(db.owner,'postgres');
 assert.equal(db.encoding,'UTF8');assert.equal(db.collation,'en_US.UTF-8');assert.equal(db.ctype,'en_US.UTF-8');
 const privileges=db.acl.filter(a=>a.grantee==='postgres').map(a=>a.privilege).sort();
 assert.deepEqual(privileges,['CONNECT','CREATE','TEMPORARY']);
 assert.ok(!Object.hasOwn(db,'rows')&&!Object.hasOwn(db,'data'));
});
