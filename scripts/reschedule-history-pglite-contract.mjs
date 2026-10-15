#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const migrations = resolve('supabase/migrations');
const readMigration = (name) => readFile(resolve(migrations,name),'utf8');
const oldSql = await readMigration('20260909160943_fix_reschedule_training_cycles_chronological.sql');
const deliverySql = await readMigration('20260903140740_fix_delayed_template_cycle_delivery.sql');
const baseSql = await readMigration('20260330175153_fa8a3919-7cf0-4576-a68d-6daf91bd7ed4.sql');
const staffSql = await readMigration('20260718120000_harden_student_tenant_isolation.sql');
const managementMigration = (await readdir(migrations)).filter((name) => name.endsWith('_company_staff_student_management.sql')).sort().at(-1);
assert.ok(managementMigration,'Missing canonical company staff management migration');
const managementSql = await readMigration(managementMigration);
function functionSql(source,name) {
  const match = new RegExp(`create or replace function public\\.${name}\\(`,'i').exec(source);
  assert.ok(match,`Missing real function ${name}`);
  const rest = source.slice(match.index);
  const quote = /\bas\s+(\$[\w]*\$)/i.exec(rest);
  assert.ok(quote,`Missing SQL body delimiter for ${name}`);
  const end = rest.indexOf(quote[1],quote.index + quote[0].length);
  assert.ok(end >= 0,`Unterminated real function ${name}`);
  assert.equal(rest[end + quote[1].length],';',`Missing terminator for ${name}`);
  return rest.slice(0,end + quote[1].length + 1);
}
const uid = (kind,n) => `${String(kind).padStart(8,'0')}-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ids = {
  trainer:uid(1,1),assignedTrainer:uid(1,2),admin:uid(1,3),coordinator:uid(1,4),master:uid(1,5),
  studentUser:uid(1,6),foreignStaff:uid(1,7),memberOnly:uid(1,8),
  company:uid(2,1),foreignCompany:uid(2,2),student:uid(3,1),otherStudent:uid(3,2),foreignStudent:uid(3,3),
  enrollment:uid(4,1),otherEnrollment:uid(4,2),foreignEnrollment:uid(4,3),
};
const cycle = (n) => uid(5,n);
const workout = (n) => uid(6,n);
const today = '2026-10-15';
const db = new PGlite();
const q = (sql,params = []) => db.query(sql,params);
const scalar = async (sql,params = []) => (await q(sql,params)).rows[0]?.value;
const owner = () => db.exec('reset role');
const login = async (user = ids.trainer,role = 'authenticated') => {
  assert.ok(['authenticated','anon','service_role'].includes(role));
  await db.exec(`reset role; set role ${role}`);
  await q("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)",[
    user || '',JSON.stringify({sub:user,role}),
  ]);
};
async function asOwner(run) {
  const previous = await scalar('select current_user as value');
  await owner();
  try { return await run(); }
  finally {
    if (['authenticated','anon','service_role'].includes(previous)) await db.exec(`set role ${previous}`);
  }
}
const snapshot = () => asOwner(() => scalar(`select jsonb_build_object(
  'enrollments',(select jsonb_agg(to_jsonb(e) order by id) from enrollments e),
  'cycles',(select jsonb_agg(to_jsonb(c) order by id) from training_cycles c),
  'workouts',(select jsonb_agg(to_jsonb(w) order by id) from workouts w),
  'sessions',(select jsonb_agg(to_jsonb(s) order by id) from workout_sessions s),
  'logs',(select jsonb_agg(to_jsonb(l) order by id) from workout_logs l),
  'markers',(select coalesce(jsonb_agg(to_jsonb(a) order by enrollment_id),'[]') from private.training_cycle_rebase_authorizations a)
) as value`));
const callSql = 'select public.reschedule_training_cycles_from($1,$2,$3::date)';
const reschedule = (c,date,e = ids.enrollment) => q(callSql,[e,c,date]);
let passed = 0;
const failures = [];
async function test(name,run) {
  await owner();
  await db.exec('begin');
  const baseline = await snapshot();
  try {
    await run();
    passed += 1;
    console.log(`ok ${passed + failures.length} - ${name}`);
  } catch (error) {
    failures.push({name,message:error.message});
    console.error(`not ok ${passed + failures.length} - ${name}: ${error.message}`);
  } finally {
    await db.exec('rollback; reset role');
    assert.deepEqual(await snapshot(),baseline,`${name}: fixture transaction failed to roll back`);
  }
}
async function rejected(sql,params,code,pattern) {
  const before = await snapshot();
  await db.exec('savepoint expected_failure');
  let error;
  try { await q(sql,params); } catch (caught) { error = caught; }
  await db.exec('rollback to savepoint expected_failure; release savepoint expected_failure');
  assert.ok(error,'Expected SQL rejection');
  assert.equal(error.code,code,error.message);
  if (pattern) assert.match(error.message,pattern);
  assert.deepEqual(await snapshot(),before,'Rejected operation changed schedule/history/markers');
}
const shiftDate = (date,days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0,10);
function assertShift(before,after,selected,days) {
  const target = before.cycles.find((row) => row.id === selected);
  let shifted = 0;
  for (const previous of before.cycles) {
    const next = after.cycles.find((row) => row.id === previous.id);
    const affected = previous.enrollment_id === ids.enrollment && previous.status !== 'superseded'
      && previous.superseded_by_cycle_id === null && previous.start_date >= target.start_date;
    if (!affected) assert.deepEqual(next,previous,'Unrelated, earlier or superseded cycle changed');
    else {
      const start = shiftDate(previous.start_date,days), end = shiftDate(previous.end_date,days);
      assert.deepEqual(next,{...previous,start_date:start,end_date:end,status:end < today ? 'completed' : start <= today && today <= end ? 'active' : 'pending'});
      shifted += 1;
    }
  }
  assert.ok(shifted >= 2,'Fixture must exercise selected and following cycles');
  assert.equal(after.cycles.length,before.cycles.length,'Rebase generated or deleted cycles');
  for (const table of ['workouts','sessions','logs']) assert.deepEqual(after[table],before[table],`Entire ${table} rows, dates, loads and identities must remain immutable`);
  for (const previous of before.enrollments) {
    const next = after.enrollments.find((row) => row.id === previous.id);
    if (previous.id !== ids.enrollment) assert.deepEqual(next,previous);
    else {
      const first = !before.cycles.some((row) => row.enrollment_id === ids.enrollment && row.status !== 'superseded'
        && row.superseded_by_cycle_id === null && row.start_date < target.start_date);
      const {updated_at,...rest} = next;
      const {updated_at:oldUpdated,...expected} = previous;
      assert.ok(updated_at && oldUpdated);
      assert.deepEqual(rest,{...expected,end_date:shiftDate(previous.end_date,days),training_start_date:first ? shiftDate(target.start_date,days) : previous.training_start_date});
    }
  }
  assert.deepEqual(after.markers,[],'Transaction rebase authorization leaked');
}

try {
  await db.exec(`
    set timezone='America/Sao_Paulo';
    create schema auth;
    create role authenticated;
    create role anon;
    create role service_role;
    create type app_role as enum ('trainer','admin','coordinator','master','student');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
    $$;
    create function current_business_date() returns date language sql stable as $$ select date '${today}' $$;
    create table company_members(company_id uuid,user_id uuid,primary key(company_id,user_id));
    create table user_roles(user_id uuid,role app_role,primary key(user_id,role));
    create table students(id uuid primary key,company_id uuid,user_id uuid,assigned_trainer_id uuid);
    create table plans(id uuid primary key,cycle_duration_days integer,duration_days integer,duration_weeks integer);
    create table enrollments(id uuid primary key,company_id uuid,student_id uuid,plan_id uuid,
      start_date date,end_date date,training_start_date date,status text default 'active',
      trainer_id uuid,updated_at timestamptz default '2026-09-01 12:00:00Z');
    create table training_cycles(id uuid primary key default gen_random_uuid(),enrollment_id uuid,
      company_id uuid,student_id uuid,cycle_number integer,start_date date,end_date date,status text,
      created_at timestamptz default '2026-09-01 12:00:00Z',duration_weeks integer default 4,name text,
      prescribed_offline_at timestamptz,prescribed_offline_by uuid,prescribed_offline_note text,
      anamnese_id uuid,bundle_id uuid,objective text,notes text,workouts jsonb default '[]',delivery_status text,
      superseded_by_cycle_id uuid,superseded_at timestamptz,superseded_by uuid,
      superseded_previous_status text,superseded_reason text);
    create table workouts(id uuid primary key,cycle_id uuid references training_cycles(id),company_id uuid,
      name text,title text,description text,day_of_week integer,sort_order integer,notes text,
      exercises jsonb,created_by uuid,revision_id uuid,created_at timestamptz,updated_at timestamptz,
      superseded_at timestamptz,superseded_by_revision_id uuid,superseded_reason text);
    create table workout_sessions(id uuid primary key,workout_id uuid references workouts(id),student_id uuid,
      company_id uuid,status text,session_date date,started_at timestamptz,completed_at timestamptz,
      created_at timestamptz,duration_seconds integer,exercises_summary jsonb,notes text,
      total_sets_completed integer,total_sets_prescribed integer,total_volume numeric);
    create table workout_logs(id uuid primary key,workout_id uuid references workouts(id),student_id uuid,
      completed boolean,completed_at timestamptz,created_at timestamptz,updated_at timestamptz,
      duration_minutes integer,exercise_index integer,exercises_data jsonb,notes text,
      reps_done integer,revision integer,rpe numeric,session_date date,set_number integer,set_type text,weight numeric);
  `);
  for (const [table,column] of [['cycle_feedback','cycle_id'],['ai_plan_versions','cycle_id'],['ai_strength_plans','training_cycle_id'],['running_plans','training_cycle_id'],['nutrition_plans','training_cycle_id'],['prescription_bundles','training_cycle_id']]) {
    await db.exec(`create table ${table}(id uuid primary key,${column} uuid)`);
  }
  await db.exec(functionSql(baseSql,'has_role'));
  await db.exec(functionSql(staffSql,'is_company_staff'));
  await db.exec(functionSql(managementSql,'can_manage_staff_student'));
  const privateStart = deliverySql.indexOf('create schema if not exists private;');
  const privateEnd = deliverySql.indexOf('create or replace function private.snapshot_training_cycle_dependencies');
  assert.ok(privateStart >= 0 && privateEnd > privateStart);
  await db.exec(deliverySql.slice(privateStart,privateEnd));
  await db.exec(functionSql(deliverySql,'generate_training_cycles'));
  const realTrigger = baseSql.match(/CREATE TRIGGER generate_training_cycles_trigger[\s\S]*?;/);
  assert.ok(realTrigger,'Missing actual enrollment rebase trigger');
  await db.exec(realTrigger[0]);
  await db.exec(`
    create unique index training_cycles_one_active_per_enrollment_idx on training_cycles(enrollment_id)
      where enrollment_id is not null and status='active';
    create unique index training_cycles_enrollment_number_uidx on training_cycles(enrollment_id,cycle_number)
      where enrollment_id is not null and status is distinct from 'superseded' and superseded_by_cycle_id is null;
    grant usage on schema public,auth to authenticated,anon,service_role;
  `);
  for (const [key,role,c] of [['trainer','trainer',ids.company],['assignedTrainer','trainer',ids.company],['admin','admin',ids.company],['coordinator','coordinator',ids.company],['master','master',null],['studentUser','student',ids.company],['foreignStaff','admin',ids.foreignCompany],['memberOnly',null,ids.company]]) {
    if (role) await q('insert into user_roles values($1,$2)',[ids[key],role]);
    if (c) await q('insert into company_members values($1,$2)',[c,ids[key]]);
  }
  for (const [s,c,user] of [[ids.student,ids.company,ids.studentUser],[ids.otherStudent,ids.company,null],[ids.foreignStudent,ids.foreignCompany,null]]) {
    await q('insert into students values($1,$2,$3,$4)',[s,c,user,ids.assignedTrainer]);
  }
  for (const [e,c,s] of [[ids.enrollment,ids.company,ids.student],[ids.otherEnrollment,ids.company,ids.otherStudent],[ids.foreignEnrollment,ids.foreignCompany,ids.foreignStudent]]) {
    await q("insert into enrollments(id,company_id,student_id,start_date,end_date,training_start_date,trainer_id) values($1,$2,$3,'2026-09-01','2026-12-09',null,$4)",[e,c,s,ids.assignedTrainer]);
  }
  const cycleFixtures = [
    [1,ids.enrollment,99,'2026-09-01','2026-09-30','completed',null],
    [2,ids.enrollment,10,'2026-10-05','2026-11-03','active',null],
    [3,ids.enrollment,2,'2026-11-10','2026-12-09','pending',null],
    [4,ids.enrollment,99,'2026-10-06','2026-10-07','superseded',null],
    [5,ids.enrollment,6,'2026-10-08','2026-10-09','pending',cycle(2)],
    [7,ids.otherEnrollment,1,'2026-10-01','2026-11-30','active',null],
    [8,ids.foreignEnrollment,1,'2026-10-01','2026-11-30','active',null],
  ];
  for (const [n,e,number,start,end,status,supersededBy] of cycleFixtures) {
    const c = e === ids.foreignEnrollment ? ids.foreignCompany : ids.company;
    const s = e === ids.foreignEnrollment ? ids.foreignStudent : e === ids.otherEnrollment ? ids.otherStudent : ids.student;
    await q('insert into training_cycles(id,enrollment_id,company_id,student_id,cycle_number,start_date,end_date,status,superseded_by_cycle_id,name) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[cycle(n),e,c,s,number,start,end,status,supersededBy,`Synthetic cycle ${n}`]);
    await q(`insert into workouts(id,cycle_id,company_id,name,title,day_of_week,sort_order,exercises,created_by,revision_id,created_at,updated_at,notes)
      values($1,$2,$3,$4,$4,1,1,$5::jsonb,$6,$7,'2026-09-01 12:00Z','2026-09-02 12:00Z','immutable prescription')`,[
      workout(n),cycle(n),c,`Synthetic workout ${n}`,JSON.stringify([{exercise_id:'synthetic-squat',sets:[{reps:8,weight:62.5}],rest_seconds:90}]),ids.assignedTrainer,uid(7,n),
    ]);
    await q(`insert into workout_sessions(id,workout_id,student_id,company_id,status,session_date,started_at,completed_at,created_at,
      duration_seconds,exercises_summary,notes,total_sets_completed,total_sets_prescribed,total_volume)
      values($1,$2,$3,$4,'completed','2026-10-10','2026-10-10 12:00Z','2026-10-10 13:00Z','2026-10-10 12:00Z',3600,
      '[{"weight":62.5,"reps":8}]','immutable completed session',3,3,1500)`,[uid(8,n),workout(n),s,c]);
    await q(`insert into workout_logs(id,workout_id,student_id,completed,completed_at,created_at,updated_at,exercise_index,
      exercises_data,notes,reps_done,revision,rpe,session_date,set_number,set_type,weight)
      values($1,$2,$3,true,'2026-10-10 13:00Z','2026-10-10 12:00Z','2026-10-10 13:01Z',0,
      '[{"sets":[{"weight":62.5,"reps":8}]}]','immutable load',8,3,7.5,'2026-10-10',1,'working',62.5)`,[uid(9,n),workout(n),s]);
  }
  // Seed the training date through the real marker path in a single transaction.
  await db.exec(`begin;
    insert into private.training_cycle_rebase_authorizations values(txid_current(),'${ids.enrollment}');
    update enrollments set training_start_date='2026-09-01' where id='${ids.enrollment}';
    delete from private.training_cycle_rebase_authorizations;
    commit;`);
  await db.exec(oldSql);

  for (const history of ['sessions only','logs only','active session only','both completed and active']) {
    await test(`before: historical RPC rejects ${history} without mutation`, async () => {
      if (history === 'sessions only') await db.exec('delete from workout_logs');
      if (history === 'logs only') await db.exec('delete from workout_sessions');
      if (history === 'active session only') {
        await db.exec('delete from workout_logs');
        await db.exec("update workout_sessions set status='in_progress',completed_at=null");
      }
      if (history === 'both completed and active') {
        await q("update workout_sessions set status='in_progress',completed_at=null where id=$1",[uid(8,2)]);
      }
      await login();
      await rejected(callSql,[ids.enrollment,cycle(2),'2026-10-12'],'P0001',/treinos realizados/);
    });
  }
  const candidates = (await readdir(migrations)).filter((name) => name.endsWith('_allow_reschedule_cycles_with_history.sql')).sort();
  assert.equal(candidates.length,1,'Expected exactly one additive history-reschedule migration');
  const newMigration = candidates[0];
  const newSql = await readMigration(newMigration);
  assert.ok(newSql.trim(),'History-reschedule migration is empty');
  await db.exec(newSql);
  await db.exec(`insert into workout_sessions(id,workout_id,student_id,company_id,status,session_date,started_at,created_at,notes)
    values('${uid(8,20)}','${workout(2)}','${ids.student}','${ids.company}','in_progress','2026-10-15','2026-10-15 12:00Z','2026-10-15 12:00Z','immutable active session')`);

  for (const [selected,days] of [[2,7],[2,-2],[1,20],[1,-7]]) {
    await test(`after: cycle ${selected}, shift ${days} days with completed/active sessions and loads`, async () => {
      const before = await snapshot();
      await login();
      await reschedule(cycle(selected),shiftDate(before.cycles.find((row) => row.id === cycle(selected)).start_date,days));
      assertShift(before,await snapshot(),cycle(selected),days);
    });
  }
  for (const role of ['admin','coordinator','master']) {
    await test(`after: ${role} can reschedule historical same-company schedule`, async () => {
      const before = await snapshot();
      await login(ids[role]);
      await reschedule(cycle(2),'2026-10-12');
      assertShift(before,await snapshot(),cycle(2),7);
    });
  }
  await test('after: service-role authorization path is preserved', async () => {
    const before = await snapshot();
    await login(null,'service_role');
    await reschedule(cycle(2),'2026-10-12');
    assertShift(before,await snapshot(),cycle(2),7);
  });
  await test('after: no-op with history changes no row or marker', async () => {
    const before = await snapshot();
    await login();
    await reschedule(cycle(2),'2026-10-05');
    assert.deepEqual(await snapshot(),before);
  });
  for (const actor of [ids.studentUser,ids.foreignStaff,ids.memberOnly,null]) {
    await test(`after: unauthorized actor ${actor || 'missing uid'} is denied`, async () => {
      await login(actor);
      await rejected(callSql,[ids.enrollment,cycle(2),'2026-10-12'],'P0001',/Sem permissao/);
    });
  }
  await test('after: trainer is denied another company schedule', async () => {
    await login();
    await rejected(callSql,[ids.foreignEnrollment,cycle(8),'2026-10-08'],'P0001',/Sem permissao/);
  });
  await test('after: anon has no execute privilege, authenticated retains it', async () => {
    assert.equal(await scalar("select has_function_privilege('anon','public.reschedule_training_cycles_from(uuid,uuid,date)','EXECUTE') as value"),false);
    assert.equal(await scalar("select has_function_privilege('authenticated','public.reschedule_training_cycles_from(uuid,uuid,date)','EXECUTE') as value"),true);
    await login(null,'anon');
    await rejected(callSql,[ids.enrollment,cycle(2),'2026-10-12'],'42501');
  });
  for (const [label,e,c,date,code,message] of [
    ['null date',ids.enrollment,cycle(2),null,'P0001',/nova data/],
    ['invalid date syntax',ids.enrollment,cycle(2),'not-a-date','22007',/invalid input syntax/],
    ['missing enrollment',uid(4,99),cycle(2),'2026-10-12','P0001',/Matricula nao encontrada/],
    ['wrong enrollment cycle',ids.enrollment,cycle(7),'2026-10-12','P0001',/Ciclo nao encontrado/],
    ['superseded target',ids.enrollment,cycle(4),'2026-10-12','P0001',/Ciclo nao encontrado/],
    ['replaced target',ids.enrollment,cycle(5),'2026-10-12','P0001',/Ciclo nao encontrado/],
    ['crosses previous end',ids.enrollment,cycle(2),'2026-09-30','P0001',/posterior ao termino/],
  ]) {
    await test(`after: ${label} rejects atomically`, async () => {
      await login();
      await rejected(callSql,[e,c,date],code,message);
    });
  }
  for (const [label,sql,pattern] of [
    ['reversed dates',`update training_cycles set end_date=start_date-1 where id='${cycle(3)}'`,/datas invalidas/],
    ['missing following date',`update training_cycles set end_date=null where id='${cycle(3)}'`,/datas invalidas/],
    ['same start tie',`insert into training_cycles(id,enrollment_id,company_id,student_id,cycle_number,start_date,end_date,status) values('${cycle(9)}','${ids.enrollment}','${ids.company}','${ids.student}',51,'2026-10-05','2026-10-06','pending')`,/mesma data de inicio/],
    ['affected overlap',`insert into training_cycles(id,enrollment_id,company_id,student_id,cycle_number,start_date,end_date,status) values('${cycle(9)}','${ids.enrollment}','${ids.company}','${ids.student}',51,'2026-10-20','2026-11-12','pending')`,/sobrepostos no resultado/],
  ]) {
    await test(`after: ${label} still rejects with history`, async () => {
      await db.exec(sql);
      await login();
      await rejected(callSql,[ids.enrollment,cycle(2),'2026-10-12'],'P0001',pattern);
    });
  }
  await test('after: historical unchanged overlaps do not block a safe later shift', async () => {
    await q("insert into training_cycles(id,enrollment_id,company_id,student_id,cycle_number,start_date,end_date,status) values($1,$2,$3,$4,51,'2026-09-15','2026-09-25','completed')",[cycle(9),ids.enrollment,ids.company,ids.student]);
    const before = await snapshot();
    await login();
    await reschedule(cycle(2),'2026-10-12');
    assertShift(before,await snapshot(),cycle(2),7);
  });
  await test('after: direct enrollment date edit still hits the real history guard', async () => {
    await rejected('update enrollments set training_start_date=$2 where id=$1',[ids.enrollment,'2026-09-02'],'23514',/possui prescri.*hist/);
  });
  await test('after: authenticated caller cannot insert a private rebase marker', async () => {
    await login();
    await rejected('insert into private.training_cycle_rebase_authorizations values(txid_current(),$1)',[ids.enrollment],'42501');
  });
  await test('after: outer rollback restores successful date changes and history exactly', async () => {
    const before = await snapshot();
    await db.exec('savepoint outer_operation');
    await login();
    await reschedule(cycle(1),'2026-09-21');
    assertShift(before,await snapshot(),cycle(1),20);
    await db.exec('rollback to savepoint outer_operation; release savepoint outer_operation');
    assert.deepEqual(await snapshot(),before);
  });
  await test('after: late enrollment failure rolls back dates/history and private marker', async () => {
    // Fault injection observes the real marker after the actual generator ran.
    await db.exec(`create function public.fixture_fail_after_rebase() returns trigger language plpgsql as $$
      begin
        if not exists(select 1 from private.training_cycle_rebase_authorizations where transaction_id=txid_current() and enrollment_id=new.id) then
          raise exception 'fixture expected transaction marker';
        end if;
        raise exception 'fixture failure after authorized enrollment update';
      end; $$;
      create trigger zz_fixture_fail_after_rebase after update on enrollments
      for each row execute function fixture_fail_after_rebase();`);
    await login();
    await rejected(callSql,[ids.enrollment,cycle(1),'2026-09-21'],'P0001',/fixture failure after authorized/);
  });
  await test('after: captured manual rollback restores history block and ACL; migration reapplies successfully', async () => {
    const before = await snapshot();
    const rollbackSql = await readFile(resolve('docs/project/rollback-reschedule-history-2026-10-15.sql'),'utf8');
    await db.exec(rollbackSql);
    assert.equal(await scalar("select has_function_privilege('anon','public.reschedule_training_cycles_from(uuid,uuid,date)','EXECUTE') as value"),false);
    assert.equal(await scalar("select has_function_privilege('authenticated','public.reschedule_training_cycles_from(uuid,uuid,date)','EXECUTE') as value"),true);
    await login();
    await rejected(callSql,[ids.enrollment,cycle(2),'2026-10-12'],'P0001',/treinos realizados/);
    assert.deepEqual(await snapshot(),before);
    await owner();
    await db.exec(newSql);
    assert.equal(await scalar("select has_function_privilege('anon','public.reschedule_training_cycles_from(uuid,uuid,date)','EXECUTE') as value"),false);
    await login();
    await reschedule(cycle(1),'2026-09-21');
    assertShift(before,await snapshot(),cycle(1),20);
  });
  console.log(JSON.stringify({ok:failures.length === 0,passed,failed:failures.length,total:passed + failures.length,
    migration:newMigration,realEnrollmentGenerator:true,productionUniqueIndexes:true,
    immutableSnapshots:['entire workouts','entire completed and in-progress sessions','entire logs including weight/reps/nested loads'],
    limitations:['Synthetic minimal schema and auth/JWT claims shim','No simultaneous multi-connection lock scheduling','Intercycle invite/delivery side effects and external sends are not simulated','Fault-injection trigger exists only inside a rolled-back test'],failures},null,2));
  if (failures.length) process.exitCode = 1;
} finally { await db.close(); }
