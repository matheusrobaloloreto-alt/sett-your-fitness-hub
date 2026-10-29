import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {analyzeCommercialTarget} from './commercial-target-preflight.mjs';

// Independent commercial acceptance only. No diagnostic reproduction/shared DB.
const root=new URL('../../',import.meta.url);
const paths=['supabase/tests/company_feature_entitlements_fixture.sql',
  'supabase/tests/commercial_target_fixture.sql',
  'supabase/migrations/20261026174537_company_feature_entitlements.sql',
  'supabase/migrations/20261027110658_commercial_target_original_oid_guards.sql',
  'supabase/migrations/20261027111459_commercial_target_agenda_reschedule_context.sql',
  'output/self-service-local-20261026/commercial-target-metadata.private.json'];
const frozen=paths.map(p=>readFileSync(new URL(p,root),'utf8'));
const digest=s=>createHash('sha256').update(s).digest('hex');
const name=`sett-independent-agenda-${randomUUID()}`;
const env={PATH:process.env.PATH,HOME:process.env.HOME,DO_NOT_TRACK:'1'};
let stage=0;
const docker=(args,input,required=true)=>{
  const r=spawnSync('docker',['--context','colima',...args],{env,input,encoding:'utf8',timeout:20000,maxBuffer:1024*1024});
  if(required)assert.equal(r.status,0,`Docker/SQL stage ${++stage}; SQLSTATE ${(r.stderr||'').match(/ERROR:\s+([A-Z0-9]{5})/)?.[1]||'unavailable'}; output withheld`);
  return r;
};
const sql=(s,required=true)=>docker(['exec','-i',name,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],s,required);
const val=s=>sql(s).stdout.trim();
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
const admin='20000000-0000-4000-8000-000000000001',master='20000000-0000-4000-8000-000000000002',student='20000000-0000-4000-8000-000000000003',foreign='20000000-0000-4000-8000-000000000004';
const sid='30000000-0000-4000-8000-000000000001',eid='40000000-0000-4000-8000-000000000001',cid='50000000-0000-4000-8000-000000000001';
const actor=(who,q,required=true)=>sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${who}',true);${q};rollback;`,required);
const call=(bound=false,date='2026-10-29')=>`select public.${bound?'independent_bound_reschedule':'reschedule_training_cycles_from'}('${eid}','${cid}','${date}')`;
const deny=(q,who=admin,state='42501')=>{
  const r=actor(who,q,false);assert.notEqual(r.status,0,'expected denial');
  assert.match(r.stderr.split('\n')[0],new RegExp(`ERROR:\\s+${state}\\b`),'expected SQLSTATE; raw output withheld');
};

test('independent preflight preserves case-sensitive SQL policy literals',()=>{
  const schema=JSON.parse(frozen[5]);
  const transform=JSON.parse(readFileSync(new URL('output/self-service-local-20261026/commercial-transform-metadata.private.json',root),'utf8'));
  assert.equal(analyzeCommercialTarget(schema,transform).prerequisitesCompatible,true);
  for(const p of schema.policies){
    if(p.schema==='storage'&&p.table==='objects'&&['INSERT','UPDATE'].includes(p.command)){
      for(const k of ['using','check'])if(p[k])p[k]=p[k].replaceAll("'platform-assets'","'PLATFORM-ASSETS'");
    }
  }
  const changed=analyzeCommercialTarget(schema,transform);
  assert.equal(changed.prerequisitesCompatible,false,'changed bucket text literal must invalidate capture gate');
  for(const command of ['INSERT','UPDATE'])assert.ok(changed.failed.includes(`existing tenant Storage ${command}`));
});

test('independent agenda real shifts and adversarial write boundary',{timeout:180000},async t=>{
  const snapshot=JSON.parse(frozen[5]);assert.equal(snapshot.project,'zshrcgbyhzxpnlccssyz');
  const fn=snapshot.functions.find(f=>f.name==='reschedule_training_cycles_from');assert.ok(fn);
  paths.forEach((p,i)=>console.log(`INPUT ${digest(frozen[i])} ${p}`));
  docker(['run','--pull=never','-d','--name',name,'--label','sett.independent-qa=20261027','--network','none','--ulimit','core=0','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17']);
  let volumes=[];
  try{
    const inspection=JSON.parse(docker(['inspect',name]).stdout)[0];
    assert.equal(inspection.Name,`/${name}`);assert.equal(inspection.HostConfig.NetworkMode,'none');
    assert.equal(Object.keys(inspection.HostConfig.PortBindings||{}).length,0);
    assert.equal((inspection.HostConfig.Binds||[]).length,0);
    volumes=(inspection.Mounts||[]).filter(m=>m.Type==='volume').map(m=>m.Name);
    let ready=false;
    for(let i=0;i<100;i++){
      if(docker(['logs',name]).stdout.includes('PostgreSQL init process complete; ready for start up.')&&docker(['exec',name,'pg_isready','-U','postgres'],undefined,false).status===0){ready=true;break;}
      await new Promise(r=>setTimeout(r,150));
    }
    assert.ok(ready);
    sql(frozen[0]);sql(frozen[1]);sql('drop function public.get_company_dashboard_snapshot(uuid)');sql(fn.definition);
    sql(`create function public.independent_bound_reschedule(p_enrollment_id uuid,p_cycle_id uuid,p_new_start_date date) returns void language sql security definer begin atomic select public.reschedule_training_cycles_from(p_enrollment_id,p_cycle_id,p_new_start_date);end;
      revoke all on function public.independent_bound_reschedule(uuid,uuid,date) from public;grant execute on function public.independent_bound_reschedule(uuid,uuid,date) to authenticated;`);
    sql(`insert into auth.users values('${admin}'),('${master}'),('${student}'),('${foreign}');
      insert into user_roles values('${admin}','admin'),('${master}','master'),('${student}','student'),('${foreign}','admin');
      insert into companies values('${a}','basic'),('${b}','basic');
      insert into company_members(company_id,user_id) values('${a}','${admin}'),('${a}','${student}'),('${b}','${foreign}');
      insert into students(id,user_id,company_id,assigned_trainer_id,status) values('${sid}','${student}','${a}','${admin}','active');
      insert into enrollments(id,company_id,student_id,trainer_id,status,training_start_date,end_date) values('${eid}','${a}','${sid}','${admin}','active','2026-10-27','2027-01-18');
      insert into training_cycles(id,company_id,enrollment_id,student_id,cycle_number,start_date,end_date,status,created_at) values
      ('${cid}','${a}','${eid}','${sid}',1,'2026-10-27','2026-12-07','active',now()),
      ('50000000-0000-4000-8000-000000000002','${a}','${eid}','${sid}',2,'2026-12-08','2027-01-18','pending',now()),
      ('50000000-0000-4000-8000-000000000003','${a}','${eid}','${sid}',0,'2026-09-01','2026-10-12','completed',now());
      insert into platform_product_settings values('default','{}',0);`);
    sql(frozen[2]);sql(frozen[3]);sql(frozen[4]);
    sql(`update platform_product_settings set version=1,settings=jsonb_build_object('tiers',jsonb_build_object('basic',jsonb_build_object('features',(select jsonb_object_agg(k,k='hasAgenda') from unnest(commercial_private.feature_keys()) k))));
      begin;select set_config('request.jwt.claim.sub','${master}',true);select public.set_company_feature_policy('${a}','catalog',0,1,true);commit;`);
    const before=val('select jsonb_agg(to_jsonb(c) order by id) from training_cycles c');
    await t.test('real public and prebound shifts alter dates/status and preserve completed history',()=>{
      for(const bound of [false,true]){
        const r=actor(admin,`${call(bound)};select 'SHIFT='||start_date||'/'||status from training_cycles where id='${cid}';select 'HISTORY='||start_date||'/'||status from training_cycles where cycle_number=0`);
        assert.match(r.stdout,/SHIFT=2026-10-29\/pending/);assert.match(r.stdout,/HISTORY=2026-09-01\/completed/);
      }
      assert.equal(val('select jsonb_agg(to_jsonb(c) order by id) from training_cycles c'),before);
    });
    await t.test('agenda direct status, publishing, and mixed clinical writes denied',()=>{
      for(const patch of ["status='pending'","status='completed'","status='pending',start_date='2026-10-29',end_date='2026-12-09'","prescribed_offline_at=now()","prescription_cleared_at=now(),status='active'"])
        deny(`update training_cycles set ${patch} where id='${cid}'`);
    });
    await t.test('foreign/student actors cannot invoke real public or preserved-OID shifts',()=>{
      for(const who of [foreign,student])for(const bound of [false,true]){
        const r=actor(who,call(bound),false);assert.notEqual(r.status,0);
        assert.match(r.stderr.split('\n')[0],/42501|Sem permissao/,'expected authorization denial; raw output withheld');
      }
    });
    await t.test('app cannot insert authorization context, call private validator, or forge GUC capability',()=>{
      deny("insert into commercial_private.agenda_reschedule_authorizations select * from commercial_private.agenda_reschedule_authorizations where false");
      deny("select commercial_private.agenda_reschedule_write_allowed('{}','{}')");
      deny(`select set_config('commercial.agenda_reschedule_authorized','true',true);update training_cycles set status='completed' where id='${cid}'`);
    });
    await t.test('multiple legitimate shifts do not retain usable context or permit subsequent publishing',()=>{
      const r=actor(admin,`${call(false)};${call(true,'2026-10-30')};select 'SHIFT='||start_date from training_cycles where id='${cid}'`);
      assert.match(r.stdout,/SHIFT=2026-10-30/);
      deny(`${call(false)};update training_cycles set status='completed' where id='${cid}'`);
      assert.equal(val('select count(*) from commercial_private.agenda_reschedule_authorizations'),'0');
      assert.equal(val('select jsonb_agg(to_jsonb(c) order by id) from training_cycles c'),before);
    });
  }finally{
    const owned=JSON.parse(docker(['inspect',name]).stdout)[0];
    assert.equal(owned.Config.Labels['sett.independent-qa'],'20261027');assert.equal(owned.Name,`/${name}`);
    docker(['rm','-f','-v',name]);
    assert.equal(docker(['ps','-a','--filter',`name=^/${name}$`,'--format','{{.Names}}']).stdout.trim(),'');
    for(const v of volumes)assert.equal(docker(['volume','ls','--filter',`name=^${v}$`,'--format','{{.Name}}']).stdout.trim(),'');
    paths.forEach((p,i)=>assert.equal(digest(readFileSync(new URL(p,root),'utf8')),digest(frozen[i]),`input drift: ${p}`));
  }
});
