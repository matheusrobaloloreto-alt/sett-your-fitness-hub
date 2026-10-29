import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {auditCompleteCapture,verifyCaptureManifest} from './complete-schema-capture-audit.mjs';
const fixture=()=>{
  const f={schema:'public',name:'test_function',signature:'test_function()',definition:'select true;',owner:'postgres',acl:[]};
  const role={name:'authenticated',superuser:false,inherit:true,bypassrls:false,createDb:false,createRole:false,replication:false,login:false};
  return [{project:'zshrcgbyhzxpnlccssyz',capturedAt:'2026-10-27T00:00:00Z',omittedFunctions:[],tables:[{schema:'public',name:'records',columns:[{name:'id'}]}],functions:[f],policies:[],sequences:[{name:'ids'}],roles:[role],roleMemberships:[]},
    {functionFingerprints:[{signature:f.signature,md5:createHash('md5').update(f.definition).digest('hex')}],columnAcls:[]},
    [{name:'ids',start:'1',increment:'1',min:'1',max:'9223372036854775807',cache:'1',acl:[]}],
    {roles:[role],roleMemberships:[],defaultPrivileges:[]}];
};
test('complete exact fingerprints and lossless bigint sequence are accepted',()=>assert.equal(auditCompleteCapture(...fixture()).consistent,true));
test('dropped or modified actual routine fails consistency',()=>{
  const a=fixture();a[0].functions[0].definition='select false;';assert.equal(auditCompleteCapture(...a).consistent,false);
  const b=fixture();b[1].functionFingerprints=[];assert.equal(auditCompleteCapture(...b).consistent,false);
});
test('rounded sequence integer and omitted function are not certified',()=>{
  const a=fixture();a[2][0].max=Number(a[2][0].max);assert.equal(auditCompleteCapture(...a).consistent,false);
  const b=fixture();b[0].omittedFunctions=['unavailable()'];assert.equal(auditCompleteCapture(...b).consistent,false);
});
test('policy string modes and column ACL relationship cannot silently drift',()=>{
  const a=fixture();a[0].policies=[{schema:'public',table:'records',name:'restriction',permissive:true}];assert.equal(auditCompleteCapture(...a).consistent,false);
  const b=fixture();b[1].columnAcls=[{schema:'public',table:'records',column:'missing',acl:[]}];assert.equal(auditCompleteCapture(...b).consistent,false);
});
test('membership grant options and required role security attributes must exist',()=>{
  const a=fixture();delete a[3].roles[0].bypassrls;assert.equal(auditCompleteCapture(...a).consistent,false);
  const b=fixture();b[0].roleMemberships=[{}];b[3].roleMemberships=[{role:'a',member:'b',inherit:true,set:true}];assert.equal(auditCompleteCapture(...b).consistent,false);
});
test('manifest binds supplement bytes and rejects omission/modification/extra captures',()=>{
  const bytes=Buffer.from('{"columnAcls":[{"column":"private"}]}');
  const name='commercial-complete-privilege-detail.private.json';
  const m={project:'zshrcgbyhzxpnlccssyz',files:[{name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]};
  assert.equal(verifyCaptureManifest(m,new Map([[name,bytes]])).verified,true);
  assert.throws(()=>verifyCaptureManifest(m,new Map()));
  assert.throws(()=>verifyCaptureManifest(m,new Map([[name,Buffer.from('{"columnAcls":[]}')]])));
  assert.throws(()=>verifyCaptureManifest(m,new Map([[name,bytes],['extra',bytes]])));
  assert.throws(()=>verifyCaptureManifest({...m,files:[...m.files,...m.files]},new Map([[name,bytes]])));
});
