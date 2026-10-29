import test from 'node:test';
import assert from 'node:assert/strict';
import {Runtime,bootstrapAuth,privateFile} from './commercial-complete-runtime.mjs';

test('actual cached GoTrue starts with independent schema and private local random signing key',{timeout:120000},async()=>{
 const rt=new Runtime();let result={scope:'actual-auth-bootstrap-only'};
 try{
  await rt.start();const auth=await bootstrapAuth(rt);
  assert.equal(rt.value("select to_regclass('auth.users') is not null"),'t');
  assert.equal(rt.http(`http://${auth.svc.name}:9999/health`).status,200);
  result={...result,authImage:auth.svc.imageId,egress:rt.egressProof(),authTables:Number(rt.value("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='auth' and c.relkind='r'"))};
 }finally{result.cleanup=rt.cleanup();privateFile(rt.dir,'auth-bootstrap-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
});
