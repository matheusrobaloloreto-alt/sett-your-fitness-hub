// Bounded proposal validation only. No hosted connection or reschedule business call.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const {PGlite}=await import(process.env.SETT_TEST_PGLITE_MODULE||'/tmp/sett-a25-independent-review/node_modules/@electric-sql/pglite/dist/index.js');
const base='output/hosted-staging-preflight-20261028/';
const manifest=JSON.parse(readFileSync(base+'agenda-reschedule-prerequisite.manifest.private.json','utf8'));
const sql=readFileSync(manifest.output.path,'utf8');
const sha=s=>createHash('sha256').update(s).digest('hex');
test('complete proposal DDL DO compiles then refuses absent staging attestation',async()=>{
 const begin=sql.indexOf('DO $agenda_prerequisite$');const marker='END $agenda_prerequisite$;';const end=sql.indexOf(marker,begin)+marker.length;
 assert.ok(begin>=0&&end>begin);
 const db=new PGlite();try{
  let failure;try{await db.exec(sql.slice(begin,end));}catch(error){failure=error;}
  assert.equal(failure?.code,'P0001',failure?.message);assert.equal(failure?.message,'Verified staging operator attestation required');
 }finally{await db.close();}
});
test('captured old native version matches, latest approved canonical body and only canonical generator prefix are proposed',()=>{
 const native=JSON.parse(readFileSync(base+'native-reschedule.private.json','utf8')).rows[0];
 assert.equal(native.definition_md5,'a1482b1d497df5cc1c994fe17a7bc8cd');assert.equal(native.body_md5,'2e8afeac0ff6d5bafe1bc42716a46a11');
 const old=JSON.parse(readFileSync(base+'reschedule-source-alias-analysis.private.json','utf8')).find(row=>row.exact_native_catalog_definition_match);
 assert.ok(old.path.includes('20260804234500'));
 const latest=JSON.parse(readFileSync(base+'reschedule-source-versions.private.json','utf8')).find(row=>row.path.includes('20261015091735'));
 assert.equal(sha(latest.statement),manifest.canonical_reschedule_create_sha256);
 const priorGenerator=JSON.parse(readFileSync(base+'agenda-generator-source-versions.private.json','utf8')).find(row=>row.path.includes('20260718132000'));
 const patched=priorGenerator.statement.replace('\nbegin\n','\nbegin\n'+manifest.canonical_generator_prefix);
 assert.equal(sha(patched),manifest.patched_generator_create_sha256);
 assert.ok(manifest.canonical_generator_prefix.includes('authz.transaction_id = txid_current()'));
 assert.ok(manifest.canonical_generator_prefix.includes('authz.enrollment_id = new.id'));
 const before="  update public.training_cycles cycle\n     set status = 'pending'";
 const after="  delete from private.training_cycle_rebase_authorizations authz\n   where authz.transaction_id = txid_current()\n     and authz.enrollment_id = p_enrollment_id;";
 assert.equal(latest.statement.split(before).length-1,1);assert.equal(latest.statement.split(after).length-1,1);
 assert.equal(latest.statement.includes('A data não pode ser alterada porque já existem treinos realizados'),false);
 assert.ok(latest.statement.includes('public.can_manage_staff_student(v_company_id, v_student_id)'));
 assert.ok(latest.statement.includes('end_date = enrollment.end_date + v_shift_days'));
});
test('both exact proposed CREATE FUNCTION definitions compile without calling enrollment/cycle operations',async()=>{
 const rows=JSON.parse(readFileSync(base+'reschedule-source-versions.private.json','utf8'));
 const latest=rows.find(row=>row.path.includes('20261015091735')).statement;
 const gen=JSON.parse(readFileSync(base+'agenda-generator-source-versions.private.json','utf8')).find(row=>row.path.includes('20260718132000')).statement;
 const patched=gen.replace('\nbegin\n','\nbegin\n'+manifest.canonical_generator_prefix);
 for(const definition of [patched,latest])assert.ok(sql.includes(" EXECUTE '"+definition.replaceAll("'","''")+"';"),'exact SQL literal embedded in proposal');
 const db=new PGlite();try{
  await db.exec(patched);await db.exec(latest);
  for(const [name,expected]of [['generate_training_cycles()',manifest.patched_generator_body_md5],['reschedule_training_cycles_from(uuid,uuid,date)',manifest.canonical_new_reschedule_body_md5]]){
   assert.equal((await db.query('select md5(prosrc) as body from pg_proc where oid=$1::regprocedure',['public.'+name])).rows[0].body,expected);
  }
 }finally{await db.close();}
});
