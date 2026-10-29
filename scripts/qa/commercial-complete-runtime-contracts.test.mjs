import test from 'node:test';
import assert from 'node:assert/strict';
import {readCapture,verifyCaptureManifest,validateCapture} from './commercial-complete-runtime.mjs';
import {loadAuthCapture,loadPrivileges,loadSequences,loadRoleDefaults,schemaPlan,policySQL} from './commercial-complete-runtime-install.mjs';

test('root manifest binds all captures and versioned catalog rejects omitted security, partial metadata and body drift',()=>{
 const m=verifyCaptureManifest();assert.ok(m.verified);assert.ok(m.files.length>=7);verifyCaptureManifest(m.hash);
 const {data:c}=readCapture();
 for(const key of ['policies','triggers','roles','schemas','roleMemberships','indexes','views','functions']){const altered=structuredClone(c);altered[key]=[];assert.throws(()=>validateCapture(altered),key);}
 const altered=structuredClone(c);altered.policies.pop();assert.throws(()=>validateCapture(altered),/integrity/);
 const omission=structuredClone(c);omission.omittedFunctions=[{signature:'missing()'}];assert.throws(()=>validateCapture(omission),/Omitted/);
});
test('all captured restrictive policies survive planning and exact sequence/default/role contracts are required',()=>{
 const {data:c}=readCapture(),{data:auth}=loadAuthCapture(),{data:priv}=loadPrivileges(),{data:seq}=loadSequences(),{data:roles}=loadRoleDefaults();
 assert.equal(c.policies.filter(p=>p.permissive==='RESTRICTIVE').length,201);
 assert.equal(c.policies.filter(p=>policySQL(p).includes(' as restrictive ')).length,201);
 assert.equal(priv.columnAcls.length,20);assert.equal(roles.defaultPrivileges.length,6);
 const plan=schemaPlan(c,auth,seq,roles);assert.ok(plan.some(x=>x.phase==='tables'));assert.ok(plan.some(x=>x.phase==='memberships'&&x.sql.includes('with admin')));
 assert.ok(seq.every(x=>typeof x.max==='string'));assert.ok(seq.some(x=>x.max==='9223372036854775807'));
});
