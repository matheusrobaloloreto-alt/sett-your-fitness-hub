import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Runtime,assertOwned,allowlist,aclSQL,validateCapture,qi,lit,privateFile,sha} from './commercial-complete-runtime.mjs';

const token='0123456789abcdef',name=`sett-complete-${token}`,network=`${name}-internal`,imageId='sha256:cached';
const net={Name:network,Internal:true,EnableIPv6:false,Labels:{'sett.commercial-complete-runtime':token}};
const obj={Name:`/${name}`,Image:imageId,Config:{Labels:{'sett.commercial-complete-runtime':token}},HostConfig:{NetworkMode:network,PortBindings:{},Binds:[]},NetworkSettings:{Networks:{[network]:{}}},Mounts:[{Type:'tmpfs',Destination:'/complete'}]};
test('rejects shared identities, foreign ownership, egress, host exposure and persistent mounts',()=>{
 assertOwned(name,token,network,net,obj,imageId);
 for(const mutate of [x=>x.Name='/supabase_db_shared',x=>x.Config.Labels={},x=>x.Image='other',x=>x.HostConfig.PortBindings={'5432/tcp':[{HostPort:'57422'}]},x=>x.HostConfig.Binds=['/tmp:/tmp'],x=>x.Mounts.push({Type:'volume'}),x=>x.NetworkSettings.Networks.bridge={},x=>x.HostConfig.NetworkMode='bridge']){
  const c=structuredClone(obj);mutate(c);assert.throws(()=>assertOwned(name,token,network,net,c,imageId));
 }
 for(const mutate of [n=>n.Internal=false,n=>n.EnableIPv6=true,n=>n.Labels={}]){const n=structuredClone(net);mutate(n);assert.throws(()=>assertOwned(name,token,network,n,obj,imageId));}
});
test('strict 25-file allowlist excludes historical repairs and freezes application order',()=>{
 assert.equal(allowlist.length,25);assert.equal(new Set(allowlist).size,25);
 assert.equal(allowlist.filter(n=>n.startsWith('20261026')).length,20);
 assert.equal(allowlist.at(-2),'20261027110658_commercial_target_original_oid_guards.sql');
 assert.equal(allowlist.at(-1),'20261027111459_commercial_target_agenda_reschedule_context.sql');
 for(const n of allowlist)assert.match(n,/^2026102[67]\d{6}_[a-z_]+\.sql$/);
});
test('ACL preserves restrictive captured grants, grant option, owner and quoted roles',()=>{
 const sql=aclSQL('function','public.rpc(uuid)','postgres',[{grantee:'authenticated',privilege:'EXECUTE',grantable:false},{grantee:'custom"role',privilege:'EXECUTE',grantable:true}],[{name:'authenticated'},{name:'custom"role'}]);
 assert.match(sql,/revoke all on function public.rpc\(uuid\) from PUBLIC/);
 assert.match(sql,/to "custom""role" with grant option/);
 assert.match(sql,/owner to "postgres"/);
 assert.throws(()=>aclSQL('function','f()','postgres',[{grantee:'anon',privilege:'ALL',grantable:false}],[]));
 assert.throws(()=>aclSQL('function','f()','postgres',[{grantee:'anon',privilege:'EXECUTE'}],[]));
 assert.equal(qi('a"b'),'"a""b"');assert.equal(lit("a'b"),"'a''b'");
});
test('incomplete catalog is a hard blocker rather than a synthetic authorization substitute',()=>{
 assert.throws(()=>validateCapture({}),/project/);
 assert.throws(()=>validateCapture({project:'zshrcgbyhzxpnlccssyz',capturedAt:new Date().toISOString(),enums:[],tables:[],indexes:[],policies:[],triggers:[],functions:[],roles:[],schemas:[],roleMemberships:[],omittedFunctions:[]}),/Empty catalog/);
 const text=readFileSync(new URL('./commercial-complete-runtime.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(text,/from ['"].*self-service-(local|api|sql-fixture)/);
 assert.doesNotMatch(text,/docker.*(?:pull |system prune|volume prune)/);
});
if(process.env.COMMERCIAL_COMPLETE_SMOKE==='1')test('fresh official PG17.6.1.155: internal network, distinct postmaster, SQLSTATE redaction and cleanup read-back',{timeout:120000},async()=>{
 const rt=new Runtime();let started=false;let proof;
 try{
  await rt.start();started=true;proof=rt.egressProof();
  assert.equal(rt.value("select current_setting('server_version_num')"),'170006');
  assert.equal(rt.value("select current_setting('data_directory')"),'/complete/data');
  const fail=rt.sql("select 'PRIVATE_BODY_MUST_NOT_ESCAPE'::integer",{allowError:true});
  assert.equal(fail.status,3);assert.deepEqual(fail.states,['22P02']);assert.ok(!Object.hasOwn(fail,'stderr'));
  assert.throws(()=>rt.sql("select 'PRIVATE_BODY_MUST_NOT_ESCAPE'::integer"),/SQL failed \[22P02\]/);
  assert.equal(rt.value('select 1'),'1');
  console.log(JSON.stringify({scope:'runtime-isolation-smoke-only',image:rt.imageId,egress:proof,resource:{container:rt.name,network:rt.network,volumes:rt.volumes}}));
 }finally{
  const cleanup=rt.cleanup();assert.equal(cleanup.cleanup,true);
  privateFile(rt.dir,'smoke-result.json',JSON.stringify({started,proof,cleanup},null,2));console.log(JSON.stringify(cleanup));
 }
});

test('restrictive captured policy remains restrictive and rejects boolean/unknown metadata',async()=>{
 const {policySQL}=await import('./commercial-complete-runtime-install.mjs');
 const p={schema:'public',table:'students',name:'restrictive',permissive:'RESTRICTIVE',command:'UPDATE',roles:['authenticated'],using:'company_id = auth.uid()',check:'company_id = auth.uid()'};
 assert.match(policySQL(p),/as restrictive for UPDATE/);
 assert.doesNotMatch(policySQL(p),/as permissive/);
 assert.match(policySQL({...p,permissive:'PERMISSIVE'}),/as permissive/);
 for(const value of [true,false,'restrictive',null,'OTHER'])assert.throws(()=>policySQL({...p,permissive:value}));
 // Detect the exact rejected mutant; both nonempty strings were truthy.
 const mutant=p.permissive?'permissive':'restrictive';assert.notEqual(mutant,'restrictive');
});
test('sequence integer TEXT retains bigint precision and rejects unsafe JSON numbers',async()=>{
 const {validateSequence}=await import('./commercial-complete-runtime-install.mjs');
 const s={start:'1',increment:'1',min:'1',max:'9223372036854775807',cache:'1'};
 assert.equal(validateSequence(s).max,'9223372036854775807');
 assert.throws(()=>validateSequence({...s,max:9223372036854775807}),/exact integer TEXT/);
 assert.throws(()=>validateSequence({...s,start:'9223372036854775808'}),/bounds/);
});
