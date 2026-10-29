import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// A separate postmaster, not a separate database on the shared postmaster.
const name = process.env.RECOVERY_QA_CONTAINER || `sett-recovery-${randomUUID()}`;
if (!/^sett-recovery-[0-9a-f-]{36}$/.test(name)) throw new Error('Dedicated recovery container required');
const docker = ['--host', 'unix:///Users/macbookpro/.colima/default/docker.sock'];
function run(args, input) {
  const r = spawnSync('docker', [...docker, ...args], { input, encoding: 'utf8', timeout: 45000 });
  if (r.error) throw r.error;
  return r;
}
function query(statement, ok = true) {
  const r = run(['exec', '-i', name, 'psql', '-X', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], statement);
  if (ok) assert.equal(r.status, 0, r.stderr);
  else assert.notEqual(r.status, 0, 'negative probe unexpectedly succeeded');
  return ok ? r.stdout.trim() : r.stderr;
}
function concurrent(statement) {
  return new Promise((resolve, reject) => {
    const p = spawn('docker', [...docker, 'exec', '-i', name, 'psql', '-X', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1']);
    let out = '', err = '';
    p.stdout.on('data', c => { out += c; }); p.stderr.on('data', c => { err += c; });
    p.on('error', reject); p.on('exit', code => code === 0 ? resolve(out.trim()) : reject(new Error(err)));
    p.stdin.end(statement);
  });
}
test('recovery migration on dedicated networkless PostgreSQL postmaster', { timeout: 300000 }, async t => {
  try {
    if (process.env.RECOVERY_QA_CONTAINER) {
      const existing=run(['inspect','--format','{{index .Config.Labels "sett.qa.owner"}}:{{.HostConfig.NetworkMode}}',name]);
      assert.equal(existing.stdout.trim(),'automation-recovery:none');
    } else {
      const start = run(['run', '--pull=never', '--detach', '--name', name, '--network', 'none',
        '--label', 'sett.qa.owner=automation-recovery', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17']);
      assert.equal(start.status, 0, start.stderr);
    }
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (run(['exec', name, 'pg_isready', '-U', 'postgres']).status === 0) { ready = true; break; }
      await new Promise(r => setTimeout(r, 250));
    }
    assert.equal(ready, true);
    query(`create role anon; create role authenticated; create role service_role;
      create table public.flow_sessions(id uuid primary key, flow_id uuid, chat_id uuid,
        current_node_id text, status text, context jsonb default '{}',
        created_at timestamptz default now(), last_activity_at timestamptz, updated_at timestamptz);
      create table public.intercycle_anamnesis_deliveries(id uuid primary key, status text,
        scheduled_for timestamptz default now(), next_attempt_at timestamptz,
        sent_at timestamptz, cancelled_at timestamptz, retry_count integer default 0,
        last_error_code text, updated_at timestamptz);
      create table public.automation_flow_edges(id uuid default gen_random_uuid(),flow_id uuid,
        source_node_id text,target_node_id text);`);
    const upgradeFlow=randomUUID(),upgradeDelivery=randomUUID();
    query(`insert into flow_sessions(id,current_node_id,status,context) values
      ('${upgradeFlow}','node','active','{"dispatch_retries":1,"dispatch_error":"legacy503"}');
      insert into intercycle_anamnesis_deliveries(id,status,last_error_code) values
      ('${upgradeDelivery}','failed','legacy503');`);
    query(readFileSync(new URL('../../supabase/migrations/20261026174533_automation_dispatch_recovery.sql', import.meta.url), 'utf8'));
    await t.test('migration backfill immediately quarantines pre-upgrade retries',()=>{
      assert.equal(query(`select status||':'||(context->>'dispatch_error')||':'||(context->>'_dispatch_previous_error') from flow_sessions where id='${upgradeFlow}';`),'failed:dispatch_uncertain:legacy503');
      assert.equal(query(`select status||':'||last_error_code from intercycle_anamnesis_deliveries where id='${upgradeDelivery}';`),'failed:dispatch_uncertain');
      assert.equal(query(`select count(*) from automation_dispatch_attempts where send_key='_legacy_unknown';`),'2');
    });
    const flow = () => {
      const id = randomUUID();
      query(`insert into flow_sessions(id,current_node_id,status) values('${id}','node','active');`);
      return id;
    };
    const claim = () => JSON.parse(query(`select coalesce(json_agg(s),'[]') from claim_automation_sessions(25) s;`));
    const expire = id => query(`update flow_sessions set dispatch_lease_until=now()-interval '1 second' where id='${id}';`);
    const begin = (id, token, key = 'node', ok = true) => query(`select begin_automation_dispatch('flow','${id}','${token}','${key}');`, ok);
    await t.test('expired claim without send recovers; old token cannot begin', () => {
      const id = flow(); const [a] = claim(); assert.equal(a.id, id);
      assert.equal(claim().length, 0);
      expire(id);
      assert.match(query(`select checkpoint_automation_dispatch('flow','${id}','${a.dispatch_lease_token}',
        '{"status":"completed","updated_at":"2000-01-01T00:00:00Z"}');`,false),/dispatch_lease_lost/);
      const [b] = claim(); assert.equal(b.id, id);
      assert.notEqual(a.dispatch_lease_token, b.dispatch_lease_token);
      query(`select checkpoint_automation_dispatch('flow','${id}','${b.dispatch_lease_token}','{"context":{"server_clock":"checked"}}');`);
      assert.match(begin(id, a.dispatch_lease_token, 'node', false), /dispatch_lease_lost/);
      query(`update flow_sessions set status='completed' where id='${id}';`);
    });
    await t.test('concurrent claims produce one owner', async () => {
      const id = flow();
      const r = await Promise.all([concurrent('select count(*) from claim_automation_sessions(25);'), concurrent('select count(*) from claim_automation_sessions(25);')]);
      assert.equal(r.reduce((n, c) => n + Number(c), 0), 1);
      query(`update flow_sessions set status='completed' where id='${id}';`);
    });
    await t.test('in-flight expired claim parks; repeated scans never resend', () => {
      const id = flow(); const [a] = claim(); assert.equal(begin(id,a.dispatch_lease_token),'in_flight');
      assert.match(begin(id,a.dispatch_lease_token,'node',false),/dispatch_uncertain/);
      expire(id); assert.deepEqual(claim(),[]);
      assert.equal(query(`select status||':'||(context->>'dispatch_error') from flow_sessions where id='${id}';`),'failed:dispatch_uncertain');
      assert.deepEqual(claim(),[]);
    });
    await t.test('ACK before checkpoint survives reclaim and cannot send again', () => {
      const id = flow(); const [a] = claim(); begin(id,a.dispatch_lease_token);
      query(`select ack_automation_dispatch('flow','${id}','${a.dispatch_lease_token}','node','synthetic-ack');`);
      expire(id); const [b] = claim(); assert.equal(begin(id,b.dispatch_lease_token),'acked');
      assert.match(query(`select ack_automation_dispatch('flow','${id}','${a.dispatch_lease_token}','node','late');`,false),/dispatch_lease_lost/);
      assert.equal(query(`select provider_message_id from automation_dispatch_attempts where owner_id='${id}';`),'synthetic-ack');
      query(`update flow_sessions set status='completed' where id='${id}';`);
    });
    await t.test('legacy processing has no proof of unsent and parks', () => {
      const id = flow(); query(`update flow_sessions set status='processing' where id='${id}';`);
      assert.deepEqual(claim(),[]);
      assert.equal(query(`select context->>'dispatch_error' from flow_sessions where id='${id}';`),'dispatch_uncertain');
    });
    await t.test('legacy503 active retry parks; exact pre-I/O consent failure may recover', () => {
      const uncertain=flow(),safe=flow();
      query(`update flow_sessions set context='{"dispatch_retries":1,"dispatch_error":"provider_status_503:whatsapp_provider_failure"}' where id='${uncertain}';
        update flow_sessions set context='{"dispatch_retries":1,"dispatch_error":"weekly_contact_consent_check_failed"}' where id='${safe}';`);
      assert.deepEqual(claim().map(r=>r.id),[safe]);
      assert.equal(query(`select context->>'dispatch_error' from flow_sessions where id='${uncertain}';`),'dispatch_uncertain');
      query(`update flow_sessions set status='active',context='{}' where id='${uncertain}';
        update flow_sessions set status='completed' where id='${safe}';`);
      assert.deepEqual(claim(),[],'clearing context cannot bypass legacy quarantine ledger');
    });
    await t.test('legacy failed intercycle retry quarantines; exact provider-not-configured is safe', () => {
      const uncertain=randomUUID(),safe=randomUUID();
      query(`insert into intercycle_anamnesis_deliveries(id,status,last_error_code) values
        ('${uncertain}','failed','provider_status_503_whatsapp_provider_failure'),
        ('${safe}','failed','intercycle_provider_not_configured');`);
      assert.equal(query(`select id from claim_intercycle_anamnesis_deliveries(25);`),safe);
      assert.equal(query(`select last_error_code from intercycle_anamnesis_deliveries where id='${uncertain}';`),'dispatch_uncertain');
      query(`update intercycle_anamnesis_deliveries set status='cancelled' where id='${safe}';`);
    });
    await t.test('save rejects delayed-cycle graph; DAG remains accepted', () => {
      const flowId=randomUUID();
      query(`insert into automation_flow_edges(flow_id,source_node_id,target_node_id) values('${flowId}','A','B');`);
      assert.match(query(`insert into automation_flow_edges(flow_id,source_node_id,target_node_id) values('${flowId}','B','A');`,false),/flow_graph_cycle_unsupported/);
      assert.equal(query(`select count(*) from automation_flow_edges where flow_id='${flowId}';`),'1');
    });
    await t.test('intercycle ACK atomically completes; in-flight never reclaims', () => {
      for (const ack of [false,true]) {
        const id=randomUUID(); query(`insert into intercycle_anamnesis_deliveries(id,status) values('${id}','scheduled');`);
        const [a]=JSON.parse(query(`select json_agg(s) from claim_intercycle_anamnesis_deliveries(25) s;`));
        query(`select begin_automation_dispatch('intercycle','${id}','${a.dispatch_lease_token}','invite');`);
        if (ack) query(`select ack_automation_dispatch('intercycle','${id}','${a.dispatch_lease_token}','invite','receipt');`);
        else query(`update intercycle_anamnesis_deliveries set dispatch_lease_until=now()-interval '1 second' where id='${id}';`);
        assert.equal(query('select count(*) from claim_intercycle_anamnesis_deliveries(25);'),'0');
        assert.equal(query(`select status from intercycle_anamnesis_deliveries where id='${id}';`),ack?'sent':'failed');
      }
    });
    await t.test('ledger and privileged RPCs unavailable to tenant/public roles', () => {
      assert.equal(query(`select has_function_privilege('anon','begin_automation_dispatch(text,uuid,uuid,text)','execute')
        or has_function_privilege('authenticated','ack_automation_dispatch(text,uuid,uuid,text,text)','execute')
        or has_table_privilege('authenticated','automation_dispatch_attempts','select');`),'f');
    });
  } finally {
    const owner=run(['inspect','--format','{{index .Config.Labels "sett.qa.owner"}}',name]);
    if (owner.stdout.trim()==='automation-recovery') run(['rm','--force',name]);
  }
});
