import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
const database=`session_transition_qa_${process.pid}`;
function query(db,sql){return new Promise((resolve,reject)=>{
 const child=spawn('docker',['--host','unix:///Users/macbookpro/.colima/default/docker.sock','exec','-i','supabase_db_sett-self-service-local-20261026','psql','-X','-U','postgres','-v','ON_ERROR_STOP=1','-At','-d',db],{timeout:20000});
 let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));child.stdin.end(sql);
});}
const student=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const workout=n=>`30000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const request=n=>`40000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const company=student(1);
const auth=n=>`set role authenticated;set request.jwt.claim.sub='10000000-0000-0000-0000-${String(n).padStart(12,'0')}';`;
const rpc=(n,r,w=n)=>`select public.start_workout_session('${student(n)}','${company}','${workout(w)}','${request(r)}')->>'id';`;
async function ok(sql){const r=await query(database,sql);assert.equal(r.code,0,r.stderr);return r.stdout.trim().split('\n').at(-1);}
async function fails(sql,pattern){const r=await query(database,sql);assert.notEqual(r.code,0);assert.match(r.stderr,pattern);}
test('native PostgreSQL session idempotency, legacy preservation, authorization and concurrent transitions',async()=>{
 assert.equal((await query('postgres',`create database ${database};`)).code,0,'Local PostgreSQL unavailable');
 try{
  await ok(readFileSync(new URL('./session_transitions_fixture.sql',import.meta.url),'utf8'));
  await ok(readFileSync(new URL('../migrations/20261029180000_session_transitions_idempotency.sql',import.meta.url),'utf8'));
  assert.equal(await ok(`select count(*) from ((select * from legacy_snapshot except select * from workout_sessions) union all (select * from workout_sessions except select * from legacy_snapshot)) d;`),'0','migration changed legacy sessions');
  for(const n of [3,4,5])await fails(auth(n)+rpc(n,1),/session_legacy_ambiguous/);
  const id=await ok(auth(1)+rpc(1,1));
  assert.equal(await ok(auth(1)+rpc(1,1)),id,'same request retry');
  assert.equal(await ok(auth(1)+rpc(1,2)),id,'different tab adopts open session');
  await fails(auth(1)+rpc(1,1,99),/session_request_reused/);
  await fails(auth(1)+rpc(1,3,99),/session_already_in_progress/);
  await fails(auth(2)+rpc(1,3),/session_not_authorized/);
  await fails(auth(1)+`insert into workout_sessions(student_id,company_id,workout_id) values('${student(1)}','${company}','${workout(1)}');`,/session_already_in_progress/);
  // Concurrent first starts in separate PostgreSQL backends.
  const [a,b]=await Promise.all([ok(auth(2)+rpc(2,10)),ok(auth(2)+rpc(2,11))]);assert.equal(a,b);
  assert.equal(await ok(`select count(*) from workout_sessions where student_id='${student(2)}';`),'1');
  // Old direct clients cannot override the terminal winner. CAS losers return no row.
  const finish=query(database,auth(1)+`begin;update workout_sessions set status='completed',completed_at=now(),total_volume=123 where id='${id}' and status='in_progress' returning id;select pg_sleep(0.2);commit;`);
  const abandon=query(database,auth(1)+`update workout_sessions set status='abandoned',completed_at=now() where id='${id}' and status='in_progress' returning id;`);
  const results=await Promise.all([finish,abandon]);for(const r of results)assert.equal(r.code,0,r.stderr);
  const state=await ok(`select status from workout_sessions where id='${id}';`);assert.ok(['completed','abandoned'].includes(state));
  const winner=results.filter(r=>r.stdout.includes(id));assert.equal(winner.length,1,'only one terminal writer acknowledges a row');
  await fails(auth(1)+`update workout_sessions set status='${state==='completed'?'abandoned':'completed'}' where id='${id}';`,/session_terminal_immutable/);
  await fails(auth(1)+`update workout_sessions set total_volume=999 where id='${id}';`,/session_terminal_immutable/);
  assert.equal(await ok(auth(1)+rpc(1,1)),id,'a completed request cannot create a new session');
  assert.equal(await ok(`select count(*) from legacy_snapshot l join workout_sessions w using(id) where to_jsonb(l)<>to_jsonb(w);`),'0','legacy history untouched');
  assert.equal(await ok(`select count(*) from pg_constraint where conrelid='public.workout_sessions'::regclass and contype='u';`),'0','no retroactive unique constraint');
 }finally{const r=await query('postgres',`drop database ${database} with (force);`);assert.equal(r.code,0,r.stderr);}
});
