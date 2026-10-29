import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const container='supabase_db_sett-self-service-local-20261026';
const db=`schedule_contract_qa_${process.pid}`;
const e='00000005-0000-4000-8000-000000000001';
const actor=`set test.actor='00000001-0000-4000-8000-000000000001';`;
function query(database,sql,onOutput){return new Promise((resolve,reject)=>{
 const child=spawn('docker',['--host','unix:///Users/macbookpro/.colima/default/docker.sock','exec','-i',container,'psql','-X','-U','postgres','-At','-v','ON_ERROR_STOP=1','-d',database],{timeout:30000});let stdout='',stderr='';
 child.stdout.on('data',c=>{stdout+=c;onOutput?.(stdout);});child.stderr.on('data',c=>{stderr+=c;});child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));child.stdin.end(sql);
});}
async function sql(statement){const r=await query(db,actor+statement);assert.equal(r.code,0,r.stderr);return r.stdout.trim().split('\n').filter(Boolean).at(-1);}
const insertEnrollment=`insert into public.enrollments(id,student_id,company_id,plan_id,status,start_date,end_date,training_start_date) values('${e}','00000003-0000-4000-8000-000000000001','00000002-0000-4000-8000-000000000001','00000004-0000-4000-8000-000000000001','active','2026-01-01','2026-12-31','2025-01-01');`;
test('native PostgreSQL schedule contract: dates, history, authorization, CAS, triggers and serialized idempotency',{timeout:60000},async()=>{
 assert.equal((await query('postgres',`create database ${db};`)).code,0);
 try{
  const fixture=readFileSync(new URL('./schedule_reconciliation_fixture.sql',import.meta.url),'utf8');
  const migration=readFileSync(new URL('../migrations/20261029181000_schedule_contract_reconciliation.sql',import.meta.url),'utf8');
  let init=fixture;
  if(process.env.SCHEDULE_BASELINE==='1'){
   const old=readFileSync(new URL('../migrations/20260903140740_fix_delayed_template_cycle_delivery.sql',import.meta.url),'utf8');
   const start=old.indexOf('create or replace function public.generate_training_cycles()');const end=old.indexOf('$function$;',start)+12;
   init+=old.slice(start,end);
  }else init+=migration;
  init+='\ncreate trigger generate_training_cycles_trigger after insert or update on public.enrollments for each row execute function public.generate_training_cycles();';
  await sql(init+insertEnrollment);
  if(process.env.SCHEDULE_BASELINE==='1') {
    await sql(`do $$begin assert (select count(*) from public.training_cycles where enrollment_id='${e}')=9, 'actual contract coverage must be 9 slots'; end $$;`);
    return;
  }
  await sql(readFileSync(new URL('./schedule_reconciliation_assertions.sql',import.meta.url),'utf8'));
  // Hold the first native transaction open until pg_stat_activity proves the
  // second connection is waiting on a database lock (not just sequential calls).
  const holder=spawn('docker',['--host','unix:///Users/macbookpro/.colima/default/docker.sock','exec','-i',container,'psql','-X','-U','postgres','-At','-v','ON_ERROR_STOP=1','-d',db],{timeout:30000});
  let releaseReady;const holderReady=new Promise(resolve=>{releaseReady=resolve;});let holderError='';
  holder.stdout.on('data',chunk=>{if(String(chunk).includes('LOCK_READY'))releaseReady();});
  holder.stderr.on('data',chunk=>{holderError+=chunk;});
  const holderDone=new Promise((resolve,reject)=>{holder.on('error',reject);holder.on('close',code=>resolve(code));});
  holder.stdin.write(actor+`begin; select id from public.enrollments where id='${e}' for update; select 'LOCK_READY';\n`);
  await Promise.race([holderReady,holderDone.then(code=>{throw new Error(`lock holder exited: ${code} ${holderError}`);})]);
  let waiterReady; const started=new Promise(resolve=>{waiterReady=resolve;});
  const second=query(db,actor+`set application_name='schedule_fixture_waiter';select 'WAIT_STARTED';select public.reconcile_prescription_schedule('${e}');`,out=>{if(out.includes('WAIT_STARTED'))waiterReady();});
  try {
    await Promise.race([started,second.then(result=>{if(result.code!==0)throw new Error(result.stderr);})]);
    const blocked=await query('postgres',`select count(*) from pg_stat_activity where datname='${db}' and application_name='schedule_fixture_waiter' and wait_event_type='Lock';`);
    assert.equal(blocked.code,0,blocked.stderr);assert.equal(blocked.stdout.trim(),'1','second connection must block on the enrollment lock');
    holder.stdin.end(`update public.enrollments set end_date='2027-03-01' where id='${e}';select public.reconcile_prescription_schedule('${e}');commit;\n`);
    assert.equal(await holderDone,0,holderError);
    const result=await second;assert.equal(result.code,0,result.stderr);
  } finally { if(holder.exitCode===null) { holder.stdin.end('rollback;\n'); await holderDone; } }
  await sql(`do $$begin
   assert not exists(select 1 from public.training_cycles where enrollment_id='${e}' and status<>'superseded' group by start_date,end_date having count(*)>1),'concurrent duplicate intervals';
   assert (select max(end_date) from public.training_cycles where enrollment_id='${e}')='2027-03-01'::date,'serialized extension missing';
   assert jsonb_array_length(public.reconcile_prescription_schedule('${e}')->'created_cycle_ids')=0,'concurrent idempotency';
  end $$;`);
 }finally{const result=await query('postgres',`drop database ${db} with (force);`);assert.equal(result.code,0,result.stderr);}
});
