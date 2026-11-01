// Synthetic in-memory SQL only. Production interaction was metadata SELECT only.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
const dir=new URL('./',import.meta.url);
const snap=JSON.parse(await readFile(new URL('backend-schema-snapshot.json',dir),'utf8'));
let PGlite;
for(const entry of await readdir(`${homedir()}/.npm/_npx`)){
 try{({PGlite}=await import(pathToFileURL(`${homedir()}/.npm/_npx/${entry}/node_modules/@electric-sql/pglite/dist/index.js`).href));break;}catch{}
}
if(!PGlite)throw Error('Existing PGlite runtime not found; no install performed');
const db=new PGlite();
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const checks=[];
try{
 await db.exec(`
 create role authenticated; create role anon; create role service_role;
 create schema auth; create schema session_private;
 create type public.app_role as enum('master','admin','coordinator','trainer','student');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
 create function current_business_date() returns date language sql immutable as $$select date '2026-11-01'$$;
 create function has_role(uuid,public.app_role) returns boolean language sql as $$select false$$;
 create function is_company_staff(uuid,uuid) returns boolean language sql as $$select false$$;
 create function can_manage_staff_student(uuid,uuid) returns boolean language sql as $$select false$$;
 create function can_read_staff_student(uuid,uuid) returns boolean language sql as $$select false$$;
 create table companies(id uuid primary key);
 create table students(id uuid primary key,user_id uuid,company_id uuid,status text);
 create table enrollments(id uuid primary key,student_id uuid,company_id uuid,status text,start_date date,end_date date);
 create table training_cycles(id uuid primary key,student_id uuid,company_id uuid,enrollment_id uuid,status text,start_date date,end_date date);
 create table workouts(id uuid primary key,cycle_id uuid,company_id uuid,exercises jsonb);
 create table workout_sessions(id uuid primary key default gen_random_uuid(),student_id uuid,company_id uuid,workout_id uuid,status text,session_date date default current_date,started_at timestamptz,completed_at timestamptz,duration_seconds integer,total_volume numeric,total_sets_completed integer,total_sets_prescribed integer,exercises_summary jsonb);
 create table session_private.start_requests(student_id uuid,company_id uuid,request_id uuid,workout_id uuid,session_id uuid,primary key(student_id,company_id,request_id));
 create table workout_logs(id uuid primary key default gen_random_uuid(),student_id uuid,workout_id uuid,exercise_index integer,set_number integer,session_date date,weight numeric,reps_done integer,set_type text,rpe numeric,completed boolean,revision bigint default 1,created_at timestamptz default now(),updated_at timestamptz default now(),unique(student_id,workout_id,exercise_index,set_number,session_date));
 create sequence workout_log_revision_seq;
 create table workout_log_batch_receipts(request_hash text primary key,request_body jsonb,response_body jsonb,post_state jsonb,created_at timestamptz default now());
 insert into companies values('${id(1)}'),('${id(2)}');
 insert into students values('${id(3)}','${id(4)}','${id(1)}','active'),('${id(5)}','${id(6)}','${id(2)}','active');
 insert into enrollments values('${id(7)}','${id(3)}','${id(1)}','active','2026-03-30','2027-03-29');
 insert into training_cycles values('${id(8)}','${id(3)}','${id(1)}','${id(7)}','completed','2026-09-14','2026-10-25'),('${id(9)}','${id(5)}','${id(2)}',null,'completed','2026-09-14','2026-10-25');
 insert into workouts values('${id(10)}','${id(8)}','${id(1)}','[{"sets":"3","exercise_name":"Synthetic","muscle_group":"Synthetic"}]'),('${id(11)}','${id(9)}','${id(2)}','[{"sets":"3"}]');
 grant usage on schema public,auth to authenticated;
 grant select on companies,students,enrollments,training_cycles,workouts,workout_logs to authenticated;
 grant select,insert,update on workout_sessions to authenticated;
 `);
 for(const f of snap.functions)await db.exec(f.definition);
 for(const table of ['training_cycles','workouts','workout_sessions','workout_logs'])await db.exec(`alter table ${table} enable row level security`);
 for(const p of snap.policies){
  const q=s=>'"'+s.replaceAll('"','""')+'"';
  await db.exec(`create policy ${q(p.policyname)} on ${q(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(q).join(',')} ${p.qual?`using (${p.qual})`:''} ${p.with_check?`with check (${p.with_check})`:''}`);
 }
 await db.exec(`create trigger session_transition_guard before insert or update on workout_sessions for each row execute function guard_workout_session_transition();
 create trigger zz_enforce_student_company_integrity before insert or update on workout_sessions for each row execute function enforce_student_company_integrity();
 create trigger zz_enforce_workout_session_reference_integrity before insert or update on workout_sessions for each row execute function enforce_workout_session_reference_integrity();
 create trigger touch_workout_log_revision before insert or update on workout_logs for each row execute function touch_workout_log_revision();
 select set_config('request.jwt.claim.sub','${id(4)}',false),set_config('request.jwt.claim.role','authenticated',false);set role authenticated;`);
 const start=async(workout=id(10),request=id(12))=>(await db.query('select start_workout_session($1,$2,$3,$4) as value',[id(3),id(1),workout,request])).rows[0].value;
 assert.equal((await db.query('select count(*)::int n from workouts')).rows[0].n,1);checks.push('RLS reads own expired completed cycle workout, hides other tenant');
 const session=await start();assert.equal(session.status,'in_progress');checks.push('start RPC accepts C8 completed ending 25/10 on 01/11');
 assert.equal((await start()).id,session.id);checks.push('start request replay stays idempotent');
 const row={student_id:id(3),workout_id:id(10),exercise_index:0,set_number:1,session_date:'2026-11-01',weight:40,reps_done:10,rpe:8.5,set_type:'normal',completed:true};
 const save=async rows=>(await db.query('select save_workout_logs_if_current($1::jsonb) as value',[JSON.stringify(rows)])).rows[0].value;
 let result=await save([row]);assert.equal(result.saved.length,1);assert.deepEqual(result.conflicts,[]);checks.push('save charges/sets via live wrapper+core accepts date after cycle end');
 const revision=result.saved[0].revision;
 result=await save([{...row,weight:42,base_revision:revision}]);assert.equal(result.saved[0].weight,42);checks.push('CAS edits weight after cycle end');
 result=await save([{...row,weight:44,base_revision:revision}]);assert.equal(result.conflicts.length,1);checks.push('stale revision still rejected as conflict');
 const complete=await db.query("update workout_sessions set status='completed',completed_at=now(),duration_seconds=600,total_volume=420,total_sets_completed=1,total_sets_prescribed=3,exercises_summary='[]' where id=$1 and student_id=$2 and company_id=$3 and status='in_progress' returning id",[session.id,id(3),id(1)]);
 assert.equal(complete.rows[0].id,session.id);checks.push('native authenticated UPDATE completion accepted by live RLS + transition/reference triggers');
 await assert.rejects(()=>db.query("update workout_sessions set duration_seconds=601 where id=$1",[session.id]),/session_terminal_immutable/);checks.push('terminal session immutable');
 await assert.rejects(()=>start(id(11),id(13)),/session_workout_mismatch/);checks.push('cross-tenant start rejected');
 await assert.rejects(()=>save([{...row,workout_id:id(11)}]),/workout does not belong/);checks.push('cross-tenant log save rejected');
 await db.exec('reset role');
 const state=(await db.query('select c.status,c.end_date::text,e.status enrollment_status,e.end_date::text enrollment_end from training_cycles c join enrollments e on e.id=c.enrollment_id where c.id=$1',[id(8)])).rows[0];
 assert.equal(state.status,'completed');assert.equal(state.end_date,'2026-10-25');assert.equal(state.enrollment_status,'active');assert.equal(state.enrollment_end,'2027-03-29');checks.push('cycle/enrollment dates and status unchanged');
 console.log(JSON.stringify({ok:true,checks,limits:'Synthetic schema/PGlite + live SELECT-only function/policy snapshot; no hosted writes; after-completion messaging/challenge/streak triggers inspected but not executed'},null,2));
}finally{await db.close();}
