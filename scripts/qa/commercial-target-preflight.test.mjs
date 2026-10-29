import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeCommercialTarget} from './commercial-target-preflight.mjs';

// Negative fixtures must identify missing prerequisites, not manufacture a
// universal certification from an empty or drifted catalog.
test('empty metadata cannot pass prerequisite gate',()=>{
  const r=analyzeCommercialTarget({},{});
  assert.equal(r.prerequisitesCompatible,false);
  for(const check of ['canonical project confirmed','column companies.id:uuid','optional target function reassign_student_trainer','payment abandonment transformation anchor']){
    assert.ok(r.failed.includes(check));
  }
});
test('unrelated project and declaration drift fail closed',()=>{
  const r=analyzeCommercialTarget({project:'different',capturedAt:'not-a-date',columns:[],functions:[{name:'get_company_dashboard_snapshot',definition:'LANGUAGE sql select 1'}]},{});
  assert.ok(r.failed.includes('canonical project confirmed'));
  assert.ok(r.failed.includes('capture date declared'));
  assert.ok(r.failed.includes('dashboard declaration transform anchor'));
  assert.ok(r.failed.includes('optional target function get_company_dashboard_snapshot'));
});
test('name alone cannot replace correct column type or policy boundaries',()=>{
  const r=analyzeCommercialTarget({columns:[{table:'companies',column:'id',type:'text'}],policies:[{schema:'public',table:'flow_sessions',command:'ALL',permissive:'PERMISSIVE',using:'true'}]},{});
  assert.ok(r.failed.includes('column companies.id:uuid'));
  assert.ok(r.failed.includes('historical staff policy flow_sessions'));
  assert.match(r.scope,/not a schema replay/);
});
test('exact named arguments and output required, not only function name/language',()=>{
  const schema={functions:[{name:'reassign_student_trainer',definition:'CREATE OR REPLACE FUNCTION public.reassign_student_trainer(_student_id uuid, _trainer_id uuid, _expected_trainer_id uuid)\n RETURNS TABLE(student_id uuid, previous_trainer_id uuid, trainer_id uuid, updated_enrollments integer)\n LANGUAGE plpgsql\n AS $$ BEGIN RETURN; END $$'}]};
  const found=x=>analyzeCommercialTarget(x,{}).checks.find(c=>c.name==='optional target function reassign_student_trainer').ok;
  assert.equal(found(schema),true);
  for(const [before,after] of [['_student_id uuid','_student_id text'],['_expected_trainer_id uuid','_different uuid'],['updated_enrollments integer','updated_enrollments text']]){
    const mutant=structuredClone(schema);mutant.functions[0].definition=mutant.functions[0].definition.replace(before,after);
    assert.equal(found(mutant),false);
  }
});
test('broadened staff policy OR, role and WITH CHECK cannot pass exact baseline match',()=>{
  const predicate='(EXISTS ( SELECT 1 FROM automation_flows f WHERE ((f.id = flow_sessions.flow_id) AND is_company_staff(auth.uid(), f.company_id))))';
  const p={schema:'public',table:'flow_sessions',permissive:'PERMISSIVE',command:'ALL',roles:['authenticated'],using:predicate,check:predicate};
  const found=policy=>analyzeCommercialTarget({policies:[policy]},{}).checks.find(c=>c.name==='historical staff policy flow_sessions').ok;
  assert.equal(found(p),true);
  assert.equal(found({...p,using:predicate+' OR true'}),false);
  assert.equal(found({...p,check:'true'}),false);
  assert.equal(found({...p,roles:['authenticated','anon']}),false);
});
