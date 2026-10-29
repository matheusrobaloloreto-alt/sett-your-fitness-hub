import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {communicationPolicyFixture} from '../../supabase/tests/communication_policy_source.mjs';

// Root-only local QA runner. Captures are schema-only; never contacts target DB.
// Positive synthetic scanner regression, never shared postmaster or old harness.
const root=new URL('../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const captured=JSON.parse(read('output/self-service-local-20261026/commercial-transform-metadata.private.json'));
const schema=JSON.parse(read('output/self-service-local-20261026/commercial-target-metadata.private.json'));
assert.equal(schema.project,'zshrcgbyhzxpnlccssyz');
const container=`sett-target-transform-${randomUUID()}`;
let ownedVolumes=[];
const env={...process.env,DOCKER_HOST:'unix:///Users/macbookpro/.colima/default/docker.sock'};
const docker=(args,input,required=true)=>{
  const r=spawnSync('docker',args,{env,input,encoding:'utf8',timeout:60000,maxBuffer:1024*1024});
  if(required)assert.equal(r.status,0,r.stderr||r.error?.message);
  return r;
};
const sql=input=>docker(['exec','-i',container,'psql','-X','-U','postgres','-At','-v','ON_ERROR_STOP=1'],input).stdout;

test('captured target scanner/payment and dashboard source transformations on disposable postmaster',{timeout:150000},async t=>{
  docker(['run','--pull=never','-d','--name',container,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17']);
  try{
    const inspection=JSON.parse(docker(['inspect',container]).stdout)[0];
    assert.equal(inspection.Name,`/${container}`);
    assert.equal(inspection.HostConfig.NetworkMode,'none');
    ownedVolumes=(inspection.Mounts||[]).filter(m=>m.Type==='volume').map(m=>m.Name);
    let ready=false;
    for(let n=0;n<180;n++){
      if(docker(['logs',container]).stdout.includes('PostgreSQL init process complete; ready for start up.')&&docker(['exec',container,'pg_isready','-U','postgres'],undefined,false).status===0){ready=true;break;}
      await new Promise(r=>setTimeout(r,250));
    }
    assert.ok(ready);
    assert.equal(docker(['inspect',container,'--format','{{.HostConfig.NetworkMode}}']).stdout.trim(),'none');
    sql('create role anon;create role authenticated;create role service_role;');
    await t.test('actual captured trigger/payment definitions accept cadence migration and synthetic regression',()=>{
      let fixture=communicationPolicyFixture();
      for(const name of ['process_automation_triggers','mark_payment_recovery_abandoned']){
        const definition=captured.transformations.find(f=>f.name===name)?.definition;
        assert.ok(definition);
        const pattern=new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,'i');
        assert.ok(pattern.test(fixture),`canonical fixture routine ${name}`);
        // pg_get_functiondef omits the statement terminator. It must be added
        // before concatenating another statement into the disposable fixture.
        fixture=fixture.replace(pattern,()=>definition.trimEnd()+';\n');
      }
      assert.match(sql(fixture),/communication_policy_local_passed/);
      assert.match(sql("select prosrc from pg_proc where oid='public.process_automation_triggers()'::regprocedure"),/company_contact_window_open/);
      assert.match(sql("select prosrc from pg_proc where oid='public.mark_payment_recovery_abandoned()'::regprocedure"),/cart_abandonment_hours/);
    });
    await t.test('actual dashboard body preserves identity/signature while accepting experience transformations',()=>{
      const definition=schema.functions.find(f=>f.name==='get_company_dashboard_snapshot')?.definition;
      assert.ok(definition);
      sql(definition);
      const before=sql("select oid||'|'||pg_get_function_identity_arguments(oid)||'|'||pg_get_function_result(oid) from pg_proc where oid='public.get_company_dashboard_snapshot(uuid)'::regprocedure").trim();
      const migration=read('supabase/migrations/20261026093918_company_experience_gamification.sql');
      const block=migration.slice(migration.indexOf('-- Retain the existing dashboard'));
      assert.ok(block.startsWith('-- Retain'));
      sql(block);
      assert.equal(sql("select oid||'|'||pg_get_function_identity_arguments(oid)||'|'||pg_get_function_result(oid) from pg_proc where oid='public.get_company_dashboard_snapshot(uuid)'::regprocedure").trim(),before);
      const body=sql("select prosrc from pg_proc where oid='public.get_company_dashboard_snapshot(uuid)'::regprocedure");
      assert.match(body,/_experience jsonb := public.company_experience_settings\(_company_id\)/);
      assert.match(body,/risk_no_workout_days/);assert.match(body,/renewal_notice_days/);
      // Actual clinical dashboard query is deliberately not invoked on a small
      // fixture; this verifies migration compatibility, not full report results.
    });
    console.log('CAPTURE_INPUT_SHA256 '+createHash('sha256').update(JSON.stringify({captured,schema})).digest('hex'));
  }finally{
    // Remove only this random run's container and attached anonymous volumes.
    // A cleanup failure is a failing test, never a silent disposal claim.
    docker(['rm','-f','-v',container]);
    assert.equal(docker(['ps','-a','--filter',`name=^/${container}$`,'--format','{{.Names}}']).stdout.trim(),'');
    for(const volume of ownedVolumes){
      assert.equal(docker(['volume','ls','--filter',`name=^${volume}$`,'--format','{{.Name}}']).stdout.trim(),'');
    }
  }
});
