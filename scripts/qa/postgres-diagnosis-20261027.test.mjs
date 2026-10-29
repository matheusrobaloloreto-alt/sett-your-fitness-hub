import test from 'node:test';
import assert from 'node:assert/strict';
import {assertOwned,validateSettings,classify,launchArgs,command,image} from './postgres-diagnosis-20261027.mjs';
const token='abcdef012345',name=`sett-pg-diag-20261027-${token}`;
const inspection=()=>({Name:`/${name}`,Image:image,Config:{Labels:{'sett.pg-diagnosis-20261027':token}},HostConfig:{NetworkMode:'none',Binds:null,PortBindings:{}},Mounts:[{Type:'tmpfs'}]});
const settings=()=>({server_version_num:'170006',session_preload_libraries:'supautils',hint_roles:'anon,authenticated,service_role',statement_timeout:'3s',lock_timeout:'1s',plan_cache_mode:'force_generic_plan',jit:'on',listen_addresses:'',max_connections:'8',current_user:'postgres',database:'postgres',in_recovery:false});
test('accepts only owned isolated matching-image container',()=>assert.doesNotThrow(()=>assertOwned(name,token,inspection())));
test('rejects shared/previous container names',()=>{for(const n of ['supabase_db_sett-self-service-local-20261026','sett-self-service-xp-isolated-20261026',name+'x'])assert.throws(()=>assertOwned(n,token,inspection()));});
test('rejects incorrect ownership and image',()=>{for(const mutate of [o=>o.Config.Labels={},o=>o.Image='sha256:other']){const o=inspection();mutate(o);assert.throws(()=>assertOwned(name,token,o));}});
test('rejects network, mounts and exposed ports',()=>{for(const mutate of [o=>o.HostConfig.NetworkMode='bridge',o=>o.HostConfig.Binds=['/tmp:/tmp'],o=>o.Mounts=[{Type:'volume'}],o=>o.HostConfig.PortBindings={'5432/tcp':[]}]){const o=inspection();mutate(o);assert.throws(()=>assertOwned(name,token,o));}});
test('launch has no pull, host mount, exposed port or shared target',()=>{const a=launchArgs(name,token);assert.ok(a.includes('never'));assert.ok(a.includes('none'));assert.ok(a.includes('core=0'));assert.ok(!a.includes('-v'));assert.ok(!a.includes('-p'));assert.throws(()=>launchArgs('supabase_db_sett-self-service-local-20261026',token));});
test('effective settings accepted as structured data',()=>assert.equal(validateSettings(settings(),'supautils','anon,authenticated,service_role').jit,'on'));
test('SET tag, missing fields and falsely claimed settings rejected',()=>{assert.throws(()=>validateSettings('SET','supautils',''));for(const k of Object.keys(settings())){const row=settings();delete row[k];assert.throws(()=>validateSettings(row,'supautils','anon,authenticated,service_role'));}assert.throws(()=>validateSettings({...settings(),session_preload_libraries:''},'supautils','anon,authenticated,service_role'));});
test('client timeout/SIGKILL is not backend SIGSEGV',()=>{const r=classify({code:null,signal:'SIGKILL',timedOut:true});assert.equal(r.backendSigsegv,false);assert.equal(r.backendSigkill,false);assert.equal(r.clientTimeout,true);});
test('backend crash evidence distinguished from SQL/timeout',()=>{assert.equal(classify({code:2,timedOut:false,signal:null},'terminated by signal 11: Segmentation fault').backendSigsegv,true);assert.equal(classify({code:3,timedOut:false,signal:null},'ERROR: permission denied').backendSigsegv,false);assert.equal(classify({},'terminated by signal 9').backendSigkill,true);});
test('bounded runner records actual timeout separately',async()=>{const r=await command(['-e','setInterval(()=>{},1000)'],undefined,60,process.execPath);assert.equal(r.timedOut,true);assert.equal(r.signal,'SIGKILL');assert.equal(classify(r).backendSigsegv,false);});
test('server-startup config uses validated postgres launch parameters',()=>{
  const a=launchArgs(name,token,{preload:'supautils',hints:'anon,authenticated,service_role'});
  assert.match(a.at(-1),/exec postgres .* -c session_preload_libraries=supautils -c supautils.hint_roles=anon,authenticated,service_role$/);
  assert.throws(()=>launchArgs(name,token,{preload:'supautils',hints:'x; touch /bad'}));
  assert.throws(()=>launchArgs(name,token,{preload:'',hints:'anon,authenticated,service_role'}));
});
test('positive hints-on requires registration, sighup context and command-line source',()=>{
  const row={...settings(),hint_registered:true,hint_metadata:{setting:'anon,authenticated,service_role',context:'sighup',source:'command line',pending_restart:false}};
  assert.doesNotThrow(()=>validateSettings(row,'supautils',row.hint_roles,'command line'));
  for(const [k,v] of [['setting',''],['context','user'],['source','default'],['pending_restart',true]])assert.throws(()=>validateSettings({...row,hint_metadata:{...row.hint_metadata,[k]:v}},'supautils',row.hint_roles,'command line'));
  assert.throws(()=>validateSettings({...row,hint_registered:false},'supautils',row.hint_roles,'command line'));
});
test('no-preload baseline must keep extension registration absent',()=>{
 const row={...settings(),session_preload_libraries:'',hint_roles:'',hint_registered:false,hint_metadata:null};
 assert.doesNotThrow(()=>validateSettings(row,'','','command line'));
 assert.throws(()=>validateSettings({...row,hint_registered:true},'','','command line'));
});
test('fresh launch identities do not reuse a postmaster between config controls',()=>{
 const a=launchArgs(name,token,{preload:'supautils',hints:''});
 const nextToken='012345abcdef',nextName=`sett-pg-diag-20261027-${nextToken}`;
 const b=launchArgs(nextName,nextToken,{preload:'supautils',hints:'anon,authenticated,service_role'});
 assert.notEqual(a[a.indexOf('--name')+1],b[b.indexOf('--name')+1]);
 assert.notEqual(a[a.indexOf('--label')+1],b[b.indexOf('--label')+1]);
});
