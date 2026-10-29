import assert from 'node:assert/strict';
import {sql} from '../scripts/qa/self-service-local.mjs';
import {quote} from './self-service-dispatch-snapshot.mjs';

// Match the installed scanner's read-only candidate sets; never disable another
// fixture or substitute a successful scanner implementation for this preflight.
export function assertDispatchIdle(company){
  const definitions=JSON.parse(sql("select json_object_agg(proname,pg_get_functiondef(oid)) from pg_proc where pronamespace='public'::regnamespace and proname in ('process_intercycle_anamnesis_schedule','mark_payment_recovery_abandoned');"));
  const scheduler=definitions.process_intercycle_anamnesis_schedule;
  const start=scheduler.indexOf('with due as ('),end=scheduler.indexOf('), inserted as (',start);
  assert.ok(start>=0&&end>start,'Intercycle scanner shape drift');
  const due=scheduler.slice(start,end).replaceAll('v_today','public.current_business_date()')+')';
  const recovery=definitions.mark_payment_recovery_abandoned;
  const rs=recovery.indexOf('WITH candidates AS ('),re=recovery.indexOf('),\n  inserted AS (',rs);
  assert.ok(rs>=0&&re>rs,'Recovery scanner shape drift');
  const candidates=recovery.slice(rs,re)+')';
  const foreign=alias=>company?` and ${alias}.company_id is distinct from ${quote(company)}::uuid`:'';
  const session=company?` and exists(select 1 from public.automation_flows f where f.id=s.flow_id${foreign('f')})`:'';
  const count=Number(sql(`select
    (select count(*) from public.flow_sessions s where s.status in ('active','processing','waiting_response')${session})+
    (select count(*) from public.automation_flows f where f.is_active and f.trigger_type in ('weekly_contact','no_workout_7d','payment_pending')${foreign('f')})+
    (select count(*) from public.intercycle_anamnesis_deliveries d where ((d.status in ('scheduled','failed') and coalesce(d.last_error_code,'') not in ('dispatch_uncertain','company_feature_denied','company_feature_unavailable')) or (d.status='sending' and (d.dispatch_lease_until<=now() or d.dispatch_lease_token is null))) and d.scheduled_for<=now() and (d.next_attempt_at is null or d.next_attempt_at<=now())${foreign('d')})+
    (${due} select count(*) from due where not exists(select 1 from public.intercycle_anamnesis_deliveries d where d.company_id=due.company_id and d.training_cycle_id=due.training_cycle_id)${foreign('due')})+
    (${candidates} select count(*) from candidates c where true${foreign('c')});`));
  assert.equal(count,0,'Exclusive serial local dispatcher window: foreign scanner work is actionable');
}
