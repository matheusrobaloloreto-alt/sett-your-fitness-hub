-- Read-only/dry-run manifest for the 22 legacy SETT/BN enrollment terms.
--
-- Intended target: Supabase PROD zshrcgbyhzxpnlccssyz.
-- Important: this repository may be linked to staging in supabase/.temp.
-- Run only against an explicit PROD link/db-url and keep the transaction read-only.
--
-- No PII is selected. References are pseudonymous technical identifiers.

begin transaction read only;

with manifest_input as (
  select *
  from (values
    ('b7004e616eca','CPF coincidente',date '2026-03-16','GO_DRY_RUN_VIGENCIA','current_start_plus_plan','Compra semestral forte; termo atual soma mais um plano. Sem evidencia de compra nova.'),
    ('df14c3d504f6','CPF coincidente',date '2026-03-06','GO_DRY_RUN_VIGENCIA','current_start_plus_plan','Compra anual forte; termo atual tem 673 dias para plano de 336.'),
    ('f79808183ac6','CPF coincidente',date '2026-08-04','GO_DRY_RUN_VIGENCIA','confirmed_purchase_plus_plan','Nova compra semestral forte; vigencia atual ainda usa inicio antigo.'),
    ('2d93f08d4f16','CPF coincidente',date '2026-03-08','GO_DRY_RUN_VIGENCIA','current_start_plus_plan','Compra anual forte; termo atual tem 673 dias para plano de 336.'),
    ('078e2d2b9409','CPF coincidente',date '2026-01-12','GO_DRY_RUN_BORDER_1D','current_start_plus_plan','Compra anual forte; termo atual e plano + fronteira legada de 1 dia.'),
    ('711a247b40da','CPF coincidente',date '2026-05-25','BLOCK_EXTERNAL_CONTRACT_OR_PLAN','none','Plano SETT semestral, mas parcelamento/valor sugerem anual; contrato define prazo.'),
    ('2370076329b4','CPF coincidente',date '2026-09-02','GO_DRY_RUN_VIGENCIA','confirmed_purchase_plus_plan','Compra nova semestral forte; lifecycle local aplicado; fim financeiro atual ficou acumulado.'),
    ('2dbfaac06276','Candidato sem CPF coincidente',date '2026-02-11','BLOCK_EXTERNAL_IDENTITY','none','Email candidato sem CPF coincidente; nao atribuir contrato automaticamente.'),
    ('711ab66e14f5','CPF coincidente',date '2026-05-21','BLOCK_EXTERNAL_DEFERMENT','none','Compra forte, mas precisa confirmar data inicial operacional antes de encurtar.'),
    ('0f13e58e755f','CPF coincidente',date '2026-06-15','GO_DRY_RUN_VIGENCIA','current_start_plus_plan','Compra semestral forte; termo atual equivale a dois planos de 168 dias.'),
    ('8dc8a2580782','CPF coincidente',date '2026-07-14','BLOCK_EXTERNAL_DEFERMENT','none','Pix confirmado em 14/07; data operacional no app difere e pode representar diferimento.'),
    ('f7047b8d00d2','Nao localizado',null::date,'BLOCK_EXTERNAL_ORIGIN','none','Sem correspondencia Asaas; origem manual/fora Asaas precisa ser confirmada.'),
    ('5d281f90c927','CPF coincidente',date '2026-04-21','GO_DRY_RUN_VIGENCIA','current_start_plus_plan','Compra semestral forte; termo atual equivale a dois planos de 168 dias.'),
    ('5ae9920ce3fa','CPF coincidente',date '2026-03-30','GO_DRY_RUN_VIGENCIA','current_start_plus_plan','Uma compra semestral localizada; sem compra posterior no export; termo sinaliza soma antiga.'),
    ('241dfb3b3c96','CPF coincidente',date '2026-03-20','GO_DRY_RUN_VIGENCIA','current_start_plus_plan','Compra semestral forte; termo de 337 dias sinaliza soma antiga.'),
    ('d389bc608edc','CPF coincidente',date '2026-07-29','NO_COMMERCIAL_ACTION_TEST','none','Conta/plano de teste; nao tratar como contrato comercial comum.'),
    ('868b64104865','Candidato sem CPF coincidente',date '2026-03-30','BLOCK_EXTERNAL_IDENTITY','none','Nome/email coincidem, mas CPF diverge; nao vincular nem mudar automaticamente.'),
    ('c6c818177b56','CPF coincidente',date '2025-12-09','GO_DRY_RUN_BORDER_1D','current_start_plus_plan','Compra anual forte sob outro nome; CPF/email coincidem; fronteira legada de 1 dia.'),
    ('14b9857eb992','CPF coincidente',date '2025-07-11','GO_DRY_RUN_BORDER_1D','current_start_plus_plan','Compra anual antiga forte; sem renovacao posterior; fronteira legada de 1 dia.'),
    ('5f9de190f3c7','CPF coincidente',date '2026-09-01','BLOCK_INTERNAL_TRAINING_QA','confirmed_purchase_plus_plan','Compra nova forte, mas alias/conteudo de treino ainda bloqueia escrita segura.'),
    ('572a44e1703c','CPF coincidente',date '2026-04-04','BLOCK_EXTERNAL_DEFERMENT','none','Compra forte; validar diferimento inicial antes de corrigir termino.'),
    ('40d31da36bcf','CPF coincidente',date '2026-01-13','NO_CHANGE_CURRENT_TERM_MATCHES_PLAN','none','Termo atual bate com plano SETT; export nao comprova eventual renovacao manual de julho.')
  ) as row(enrollment_ref, asaas_evidence, asaas_confirmed_at, decision_bucket, target_rule, rationale)
), prod_scope as (
  select
    input.*,
    enrollment.id as enrollment_id,
    substr(md5(enrollment.student_id::text), 1, 12) as student_ref,
    enrollment.status,
    enrollment.start_date,
    enrollment.end_date,
    enrollment.payment_date,
    plan.name as plan_name,
    coalesce(plan.duration_days, plan.duration_weeks * 7) as plan_days,
    plan.duration_weeks,
    case
      when enrollment.start_date is not null and enrollment.end_date is not null
        then enrollment.end_date - enrollment.start_date + 1
    end as current_term_days
  from manifest_input input
  left join public.enrollments enrollment
    on substr(md5(enrollment.id::text), 1, 12) = input.enrollment_ref
  left join public.companies company
    on company.id = enrollment.company_id
   and company.slug = 'bn-performance-training'
  left join public.plans plan
    on plan.id = enrollment.plan_id
  where company.slug = 'bn-performance-training'
     or enrollment.id is null
), enriched as (
  select
    scope.*,
    case
      when target_rule = 'current_start_plus_plan'
        and start_date is not null and plan_days is not null
        then start_date
      when target_rule = 'confirmed_purchase_plus_plan'
        and asaas_confirmed_at is not null
        then asaas_confirmed_at
    end as proposed_start_date,
    case
      when target_rule = 'current_start_plus_plan'
        and start_date is not null and plan_days is not null
        then start_date + plan_days - 1
      when target_rule = 'confirmed_purchase_plus_plan'
        and asaas_confirmed_at is not null and plan_days is not null
        then asaas_confirmed_at + plan_days - 1
    end as proposed_end_date,
    (
      select count(*)
      from public.training_cycles cycle
      where cycle.enrollment_id = scope.enrollment_id
        and cycle.status <> 'superseded'
        and cycle.superseded_by_cycle_id is null
    ) as visible_cycles,
    (
      select max(cycle.end_date)
      from public.training_cycles cycle
      where cycle.enrollment_id = scope.enrollment_id
        and cycle.status <> 'superseded'
        and cycle.superseded_by_cycle_id is null
    ) as last_visible_cycle_end,
    (
      select count(*)
      from public.payments payment
      where payment.company_id = (
        select company_id from public.enrollments e where e.id = scope.enrollment_id
      )
        and coalesce(payment.lifecycle_enrollment_id, payment.enrollment_id) = scope.enrollment_id
        and payment.lifecycle_applied_at is not null
    ) as lifecycle_payments_applied
  from prod_scope scope
)
select jsonb_pretty(jsonb_agg(
  jsonb_build_object(
    'enrollment_ref', enrollment_ref,
    'student_ref', student_ref,
    'decision_bucket', decision_bucket,
    'asaas_evidence', asaas_evidence,
    'asaas_confirmed_at', asaas_confirmed_at,
    'status', status,
    'start_date', start_date,
    'end_date', end_date,
    'payment_date', payment_date,
    'plan_name', plan_name,
    'plan_days', plan_days,
    'current_term_days', current_term_days,
    'current_delta_days', current_term_days - plan_days,
    'proposed_start_date', proposed_start_date,
    'proposed_end_date', proposed_end_date,
    'visible_cycles', visible_cycles,
    'last_visible_cycle_end', last_visible_cycle_end,
    'lifecycle_payments_applied', lifecycle_payments_applied,
    'rationale', rationale
  )
  order by decision_bucket, enrollment_ref
)) as legacy_vigencias_manifest
from enriched;

rollback;
