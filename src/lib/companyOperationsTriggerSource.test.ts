import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { expect, it } from 'vitest';
const sql=readFileSync(new NodeURL('../../supabase/migrations/20261028113017_company_operations.sql',import.meta.url),'utf8');
it('invokes the student guard for status-only changes as well as explicit sales stage changes',()=>{
 const trigger=sql.match(/create trigger company_operations_student_transition ([\s\S]*?);/)?.[1]??'';
 expect(trigger).toMatch(/before update of sales_stage\s*,\s*status on public\.students/);
});
it('normalizes old and new active statuses before operational stage fallback',()=>{
 for(const [assignment,row] of [['source','old'],['target','new']]){
  const expression=sql.match(new RegExp(`${assignment}:=case([\\s\\S]*?);`))?.[1]??'';
  expect(expression).toContain(`when ${row}.status in ('active','awaiting_renewal')`);
  expect(expression).toContain(`when ${row}.sales_stage='active_onboarding' then 'active_onboarding' else 'active' end`);
  expect(expression).toContain(`when ${row}.status='pending' then 'payment_pending'`);
  expect(expression).toContain(`when ${row}.status='inactive' then 'lost'`);
  expect(expression).toContain("else 'interested' end");
  expect(expression.indexOf(`${row}.status in`)).toBeLessThan(expression.indexOf(`${row}.sales_stage in`));
 }
});
