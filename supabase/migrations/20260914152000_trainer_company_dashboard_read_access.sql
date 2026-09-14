-- Company Dashboard is a dedicated read projection, never a broader students RLS grant.
-- DO NOT redefine has_staff_permission/can_read_staff_student/can_manage_staff_student:
-- child FOR ALL policies depend on the caller's existing students visibility.
create or replace function public.get_company_dashboard_snapshot(_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  _today date := (now() at time zone 'America/Sao_Paulo')::date;
  _result jsonb;
begin
  if auth.uid() is null or _company_id is null or not (
    exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'master'::public.app_role)
    or exists (
      select 1 from public.company_members cm
      join public.user_roles ur on ur.user_id = cm.user_id
      where cm.user_id = auth.uid() and cm.company_id = _company_id
        and ur.role in ('admin'::public.app_role, 'coordinator'::public.app_role, 'trainer'::public.app_role)
    )
  ) then
    raise exception 'Company dashboard access denied' using errcode = '42501';
  end if;

  with
  -- Private fiscal inputs exist only inside this statement. The output carries labels.
  fiscal as (
    select s.id,
      upper(btrim(coalesce(nullif(s.country_code, ''), 'BR'))) as country,
      regexp_replace(coalesce(nullif(s.whatsapp, ''), s.phone, ''), '[^0-9]', '', 'g') as phone,
      s.email, s.address, s.city, s.state, s.cpf, s.cep, s.address_number, s.neighborhood
    from public.students s where s.company_id = _company_id
  ), fiscal_labels as (
    select f.id, array_remove(array[
      case when position('@' in coalesce(btrim(f.email), '')) = 0 then 'e-mail válido' end,
      case when length(f.phone) not between 8 and 15 then 'WhatsApp' end,
      case when f.country !~ '^[A-Z]{2}$' then 'país' end,
      case when coalesce(btrim(f.address), '') = '' then 'endereço' end,
      case when coalesce(btrim(f.city), '') = '' then 'cidade' end,
      case when coalesce(btrim(f.state), '') = '' then 'estado/região' end,
      case when (f.country = 'BR' or f.country !~ '^[A-Z]{2}$') and not (
        length(p.local_phone) = 10 or (length(p.local_phone) = 11 and substring(p.local_phone, 3, 1) = '9')
      ) then 'WhatsApp brasileiro válido' end,
      case when (f.country = 'BR' or f.country !~ '^[A-Z]{2}$') and length(regexp_replace(coalesce(f.cpf, ''), '[^0-9]', '', 'g')) not in (11,14) then 'CPF/CNPJ' end,
      case when (f.country = 'BR' or f.country !~ '^[A-Z]{2}$') and length(regexp_replace(coalesce(f.cep, ''), '[^0-9]', '', 'g')) <> 8 then 'CEP' end,
      case when (f.country = 'BR' or f.country !~ '^[A-Z]{2}$') and coalesce(btrim(f.address_number), '') = '' then 'número' end,
      case when (f.country = 'BR' or f.country !~ '^[A-Z]{2}$') and coalesce(btrim(f.neighborhood), '') = '' then 'bairro' end,
      case when (f.country = 'BR' or f.country !~ '^[A-Z]{2}$') and length(btrim(coalesce(f.state, ''))) <> 2 then 'estado com 2 letras' end
    ], null) as missing
    from fiscal f cross join lateral (
      select case when f.phone like '55%' and length(f.phone) in (12,13) then substring(f.phone,3) else f.phone end as local_phone
    ) p
  ), students_scope as materialized (
    select s.id, s.full_name, s.status, s.birth_date, s.assigned_trainer_id,
      s.created_at, s.sales_stage, s.fiscal_completed_at, s.payment_link_sent_at, s.activated_at,
      s.assessment_due_at, s.onboarding_instructions_sent_at,
      coalesce(p.plan_kind = 'influencer', false) as influencer
    from public.students s
    left join public.plans p on p.id = s.selected_plan_id and p.company_id = _company_id
    where s.company_id = _company_id
  ), trainers as (
    select distinct cm.user_id, coalesce(p.full_name, '') as name
    from public.company_members cm join public.user_roles ur on ur.user_id = cm.user_id and ur.role = 'trainer'::public.app_role
    left join public.profiles p on p.user_id = cm.user_id
    where cm.company_id = _company_id
  ), staff_names as (
    select cm.user_id, coalesce(p.full_name, '') as name from public.company_members cm
    join public.profiles p on p.user_id = cm.user_id
    where cm.company_id = _company_id
      and exists (select 1 from public.user_roles ur where ur.user_id = cm.user_id and ur.role in ('admin','coordinator','trainer'))
  ), enrollments_scope as materialized (
    select e.id, e.student_id, e.trainer_id, e.status, e.end_date, e.training_start_date, e.payment_status,
      s.full_name, s.status as student_status, s.assigned_trainer_id, s.influencer,
      p.name as plan_name
    from public.enrollments e join students_scope s on s.id = e.student_id
    left join public.plans p on p.id = e.plan_id and p.company_id = _company_id
    where e.company_id = _company_id
      and (e.plan_id is null or p.id is not null)
  ), cycles_scope as materialized (
    select c.id, c.student_id, c.enrollment_id, c.cycle_number, c.start_date, c.end_date, c.status,
      c.prescribed_offline_at, c.prescription_cleared_at
    from public.training_cycles c join students_scope s on s.id = c.student_id
    where c.company_id = _company_id and coalesce(c.status, '') <> 'superseded'
      and c.superseded_at is null and c.superseded_by_cycle_id is null
      and (c.enrollment_id is null or exists (select 1 from enrollments_scope e where e.id = c.enrollment_id and e.student_id = c.student_id))
  ), workouts_scope as materialized (
    select w.id, w.cycle_id, c.student_id,
      (case when jsonb_typeof(w.exercises) = 'array' then jsonb_array_length(w.exercises) > 0 else false end) as materialized
    from public.workouts w join cycles_scope c on c.id = w.cycle_id
    where w.company_id = _company_id and w.superseded_at is null
  ), bundles_scope as materialized (
    select b.id, b.student_id, b.training_cycle_id, b.created_at, b.status,
      b.has_strength, b.has_cardio, b.has_swimming, b.has_cycling, b.has_nutrition,
      b.strength_plan_id, b.running_plan_id, b.nutrition_plan_id
    from public.prescription_bundles b join students_scope s on s.id = b.student_id
    where b.company_id = _company_id and b.status in ('active', 'scheduled')
      and (b.training_cycle_id is null or exists (select 1 from cycles_scope c where c.id = b.training_cycle_id and c.student_id = b.student_id))
  ), items_scope as materialized (
    select i.bundle_id, i.entity_id, i.entity_type,
      translate(lower(i.modality), 'ãáàâäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') as modality
    from public.prescription_bundle_items i join bundles_scope b on b.id = i.bundle_id and b.student_id = i.student_id
    where i.company_id = _company_id and (
      (i.entity_type = 'ai_strength_plan' and exists (
        select 1 from public.ai_strength_plans p where p.id = i.entity_id and p.company_id = _company_id and p.student_id = b.student_id
          and (p.bundle_id is null or p.bundle_id = b.id)
          and (p.training_cycle_id is null or p.training_cycle_id = b.training_cycle_id)
      )) or (i.entity_type = 'running_plan' and exists (
        select 1 from public.running_plans p where p.id = i.entity_id and p.company_id = _company_id and p.student_id = b.student_id
          and (p.bundle_id is null or p.bundle_id = b.id)
          and (p.training_cycle_id is null or p.training_cycle_id = b.training_cycle_id)
      )) or (i.entity_type = 'nutrition_plan' and exists (
        select 1 from public.nutrition_plans p where p.id = i.entity_id and p.company_id = _company_id and p.student_id = b.student_id
          and (p.bundle_id is null or p.bundle_id = b.id)
          and (p.training_cycle_id is null or p.training_cycle_id = b.training_cycle_id)
      ))
    )
  ), bundle_badges as (
    select b.id, b.student_id, b.training_cycle_id, b.created_at,
      coalesce(b.has_strength, false) and exists (select 1 from items_scope i where i.bundle_id = b.id and i.entity_id = b.strength_plan_id and i.entity_type = 'ai_strength_plan' and i.modality = 'musculacao') as strength,
      coalesce(b.has_cardio, false) and a.anchored and exists (select 1 from items_scope i where i.bundle_id = b.id and i.entity_type = 'running_plan' and i.modality = 'corrida') as cardio,
      coalesce(b.has_swimming, false) and a.anchored and exists (select 1 from items_scope i where i.bundle_id = b.id and i.entity_type = 'running_plan' and i.modality = 'natacao') as swimming,
      coalesce(b.has_cycling, false) and a.anchored and exists (select 1 from items_scope i where i.bundle_id = b.id and i.entity_type = 'running_plan' and i.modality = 'ciclismo') as cycling,
      coalesce(b.has_nutrition, false) and exists (select 1 from items_scope i where i.bundle_id = b.id and i.entity_id = b.nutrition_plan_id and i.entity_type = 'nutrition_plan' and i.modality = 'nutricao') as nutrition
    from bundles_scope b cross join lateral (
      select exists (select 1 from items_scope i where i.bundle_id = b.id and i.entity_id = b.running_plan_id and i.entity_type = 'running_plan' and i.modality in ('corrida','natacao','ciclismo')) as anchored
    ) a
  ), prepared_cycles as (
    select c.id, c.enrollment_id, c.student_id, c.cycle_number, c.start_date, c.end_date, c.status,
      c.prescription_cleared_at is null and (
        c.prescribed_offline_at is not null
        or exists (select 1 from workouts_scope w where w.cycle_id = c.id and w.materialized)
        or exists (select 1 from bundle_badges b where b.training_cycle_id = c.id and (b.strength or b.cardio or b.swimming or b.cycling or b.nutrition))
      ) as ready
    from cycles_scope c
  ), current_cycles as (
    select distinct on (c.enrollment_id) c.id, c.enrollment_id, c.student_id, c.cycle_number, c.end_date
    from prepared_cycles c join enrollments_scope e on e.id = c.enrollment_id and e.student_id = c.student_id
    where e.status in ('active','awaiting_training') and e.training_start_date is not null and c.start_date <= _today and c.end_date >= _today
    order by c.enrollment_id, c.ready desc, coalesce(c.status = 'active', false) desc, c.cycle_number desc, c.start_date desc, c.id
  ), countdowns as (
    select jsonb_build_object('student_name', e.full_name, 'student_id', c.student_id, 'cycle_number', c.cycle_number,
      'end_date', c.end_date, 'days_left', c.end_date - _today, 'trainer_id', coalesce(e.assigned_trainer_id,e.trainer_id),
      'next_cycle_id', n.id, 'next_cycle_number', n.cycle_number, 'next_start_date', n.start_date, 'next_ready', coalesce(n.ready,false)) as row,
      c.end_date - _today as days_left
    from current_cycles c join enrollments_scope e on e.id = c.enrollment_id
    left join lateral (select nc.id, nc.cycle_number, nc.start_date, nc.ready from prepared_cycles nc where nc.enrollment_id = c.enrollment_id and nc.student_id = c.student_id and nc.cycle_number = c.cycle_number + 1 order by nc.start_date, nc.id limit 1) n on true
  ), renewal_countdowns as (
    select jsonb_build_object('student_name', e.full_name, 'student_id', c.student_id, 'cycle_number', c.cycle_number,
      'end_date', c.end_date, 'days_left', c.end_date - _today, 'trainer_id', coalesce(e.assigned_trainer_id,e.trainer_id),
      'next_cycle_id', null, 'next_cycle_number', null, 'next_start_date', null, 'next_ready', false) as row,
      c.end_date - _today as days_left
    from cycles_scope c join enrollments_scope e on e.id = c.enrollment_id and e.student_id = c.student_id
    where c.status = 'active' and e.status in ('active','awaiting_training') and e.training_start_date is not null
  ), contracts as (
    select e.id, e.status, e.student_status, e.end_date,
      jsonb_build_object('id',e.id,'student_id',e.student_id,'end_date',e.end_date,'trainer_id',e.trainer_id,'payment_status',e.payment_status,
        'students',jsonb_build_object('full_name',e.full_name,'status',e.student_status),
        'plans',case when e.plan_name is null then null else jsonb_build_object('name',e.plan_name) end) as row
    from enrollments_scope e
  ), feedback_scope as materialized (
    select f.id, f.student_id, s.full_name, f.nps, f.wants_adjustment, f.adjustment_notes, f.created_at, f.applied
    from public.cycle_feedback f join students_scope s on s.id = f.student_id
    where f.company_id = _company_id
      and (f.enrollment_id is null or exists (select 1 from enrollments_scope e where e.id = f.enrollment_id and e.student_id = f.student_id))
      and (f.cycle_id is null or exists (select 1 from cycles_scope c where c.id = f.cycle_id and c.student_id = f.student_id and (f.enrollment_id is null or c.enrollment_id = f.enrollment_id)))
  ), risk_signals as (
    select s.id, s.full_name, s.status as base_status,
      exists (select 1 from cycles_scope c where c.student_id = s.id and c.status = 'active') as active,
      (select max(c.end_date) - _today from cycles_scope c where c.student_id = s.id and c.status = 'active') as cycle_days,
      exists (select 1 from public.payments p where p.company_id = _company_id and p.student_id = s.id and p.status not in ('CONFIRMED','RECEIVED','RECEIVED_IN_CASH')
        and (p.enrollment_id is null or exists (select 1 from enrollments_scope e where e.id = p.enrollment_id and e.student_id = p.student_id))) as overdue,
      (select floor(extract(epoch from (now() - max(w.completed_at))) / 86400)::int from public.workout_sessions w where w.company_id = _company_id and w.student_id = s.id and w.status = 'completed'
        and (w.workout_id is null or exists (select 1 from workouts_scope ww where ww.id = w.workout_id and ww.student_id = w.student_id))) as training_days,
      (select p.region || ' (' || p.severity || ')' from public.student_body_limitations p where p.company_id = _company_id and p.student_id = s.id and p.severity in ('moderada','severa') order by p.created_at, p.id limit 1) as pain,
      (select floor(extract(epoch from (now() - max(a.created_at))) / 86400)::int from public.functional_assessments a where a.company_id = _company_id and a.student_id = s.id) as assessment_days
    from students_scope s where s.status <> 'inactive'
  ), risk_status as (
    select r.id, r.full_name, r.active, r.cycle_days, r.overdue, r.training_days, r.pain, r.assessment_days,
      case when r.base_status = 'interested' then 'lead' when not r.active then 'aguardando_prescricao'
        when r.base_status = 'awaiting_renewal' or r.cycle_days <= 0 then 'renovacao'
        when r.overdue or r.training_days >= 10 then 'risco' else 'ativo' end as status
    from risk_signals r
  )
  select jsonb_build_object(
    'version',1,'companyId',_company_id,'asOfDate',_today,
    'stats',jsonb_build_object(
      'totalStudents',(select count(*) from students_scope where status='active'),
      'interestedStudents',(select count(*) from public.leads l where l.company_id=_company_id and l.converted_to_student_id is null and l.stage in ('interested','contacted')),
      'pendingStudents',(select count(*) from students_scope where status='pending'),
      'awaitingRenewalStudents',(select count(*) from students_scope where status='awaiting_renewal'),
      'inactiveStudents',(select count(*) from students_scope where status='inactive'),
      'trainers',(select count(*) from trainers)),
    'planChart',coalesce((select jsonb_agg(jsonb_build_object('name',p.name,'count',p.count) order by p.count desc,p.name) from (select coalesce(plan_name,'Sem plano') as name,count(*) as count from enrollments_scope group by 1) p),'[]'::jsonb),
    'trainerMap',coalesce((select jsonb_object_agg(user_id,name) from staff_names),'{}'::jsonb),
    'expiringContracts',coalesce((select jsonb_agg(row order by end_date desc,id) from contracts where status in ('active','awaiting_renewal') and student_status in ('active','pending','awaiting_renewal') and end_date <= _today+7),'[]'::jsonb),
    'cycleCountdowns',coalesce((select jsonb_agg(row order by days_left) from countdowns where days_left between 0 and 7),'[]'::jsonb),
    'renewals',jsonb_build_object(
      'expiringContracts',coalesce((select jsonb_agg(row order by end_date,id) from contracts where status='active' and student_status in ('active','pending') and end_date <= _today+30),'[]'::jsonb),
      'awaitingRenewal',coalesce((select jsonb_agg(row order by end_date,id) from contracts where status='awaiting_renewal' and student_status <> 'inactive'),'[]'::jsonb),
      'cycleCountdowns',coalesce((select jsonb_agg(row order by days_left) from renewal_countdowns),'[]'::jsonb),
      'trainerMap',coalesce((select jsonb_object_agg(user_id,name) from staff_names),'{}'::jsonb)),
    'alerts',jsonb_build_object(
      'pendingActions',coalesce((select jsonb_agg(a.row order by a.created_at desc) from (
        select aa.created_at,jsonb_build_object('id',aa.id,'type',aa.type,'severity',aa.severity,'title',aa.title,'message',aa.message,'created_at',aa.created_at,'student_id',aa.student_id) as row
        from public.admin_alerts aa where aa.company_id=_company_id and aa.resolved_at is null
          and (aa.student_id is null or exists (select 1 from students_scope s where s.id=aa.student_id))
          and (aa.enrollment_id is null or exists (select 1 from enrollments_scope e where e.id=aa.enrollment_id and (aa.student_id is null or aa.student_id=e.student_id)))
          and (aa.target_user_id is null or exists (select 1 from public.company_members cm where cm.company_id=_company_id and cm.user_id=aa.target_user_id))
          and (
            aa.target_user_id is null
            or aa.target_user_id = auth.uid()
            or exists (
              select 1 from public.user_roles ur
              where ur.user_id = auth.uid()
                and ur.role in ('admin'::public.app_role, 'coordinator'::public.app_role, 'master'::public.app_role)
            )
            or public.has_staff_permission(_company_id, 'company_dashboard_full')
          )
        order by aa.created_at desc,aa.id limit 50
      ) a),'[]'::jsonb),
      'birthdays',coalesce((select jsonb_agg(jsonb_build_object('full_name',s.full_name,'student_id',s.id,'day',extract(day from s.birth_date),'isToday',extract(day from s.birth_date)=extract(day from _today)) order by extract(day from s.birth_date),s.id) from students_scope s where s.status='active' and extract(month from s.birth_date)=extract(month from _today)),'[]'::jsonb),
      'missingWorkouts',coalesce((select jsonb_agg(jsonb_build_object('student_name',e.full_name,'student_id',c.student_id,'cycle_number',c.cycle_number,'cycle_id',c.id,'start_date',c.start_date,'end_date',c.end_date,'trainer_name',sn.name) order by c.start_date,c.id)
        from cycles_scope c join enrollments_scope e on e.id=c.enrollment_id and e.student_id=c.student_id left join staff_names sn on sn.user_id=e.trainer_id
        where e.status='active' and c.status='active' and c.prescribed_offline_at is null and not exists (select 1 from workouts_scope w where w.cycle_id=c.id and w.materialized)),'[]'::jsonb),
      'awaitingTrainer',coalesce((select jsonb_agg(jsonb_build_object('student_name',e.full_name,'student_id',e.student_id) order by e.full_name,e.id) from enrollments_scope e where e.status in ('active','awaiting_training','awaiting_renewal') and e.trainer_id is null and not e.influencer),'[]'::jsonb),
      'awaitingTrainingDate',coalesce((select jsonb_agg(a.row order by a.student_id) from (
        select distinct on (e.student_id) e.student_id,jsonb_build_object('student_name',e.full_name,'student_id',e.student_id,'enrollment_id',e.id,'trainer_name',sn.name) as row
        from enrollments_scope e left join staff_names sn on sn.user_id=e.trainer_id
        where e.status in ('active','awaiting_training') and e.training_start_date is null and not e.influencer
          and not exists (select 1 from enrollments_scope dated where dated.student_id=e.student_id and dated.status in ('active','awaiting_training','awaiting_renewal') and dated.training_start_date is not null)
        order by e.student_id,e.id
      ) a),'[]'::jsonb),
      'missingEnrollment',coalesce((select jsonb_agg(jsonb_build_object('student_name',s.full_name,'student_id',s.id) order by s.full_name,s.id) from students_scope s where s.status='active' and not s.influencer and not exists (select 1 from enrollments_scope e where e.student_id=s.id and e.status in ('active','awaiting_training','awaiting_renewal'))),'[]'::jsonb),
      'incompleteBilling',coalesce((select jsonb_agg(jsonb_build_object('student_name',s.full_name,'student_id',s.id,'missing',f.missing) order by cardinality(f.missing) desc,s.id) from students_scope s join fiscal_labels f on f.id=s.id where s.status in ('active','pending') and not s.influencer and cardinality(f.missing)>0),'[]'::jsonb),
      'recentStudents',coalesce((select jsonb_agg(jsonb_build_object('student_name',s.full_name,'student_id',s.id,'status',s.status,'created_at',s.created_at,'sales_stage',s.sales_stage,'fiscal_completed_at',s.fiscal_completed_at,'payment_link_sent_at',s.payment_link_sent_at,'activated_at',s.activated_at,'assessment_due_at',s.assessment_due_at,'onboarding_instructions_sent_at',s.onboarding_instructions_sent_at) order by s.created_at desc,s.id)
        from students_scope s where s.status in ('interested','active','pending')
          and (s.created_at >= now()-interval '30 days' or s.sales_stage in ('interested','fiscal_registration_pending','payment_pending','active_onboarding'))
          and case when s.status='active' then s.sales_stage='active_onboarding' else coalesce(s.sales_stage,'') <> 'active' end),'[]'::jsonb)),
    'monthlyPrescriptions',coalesce((select jsonb_agg(m.row order by m.created_at desc) from (
      select b.created_at,jsonb_build_object('id',b.id,'student_id',b.student_id,'name',s.full_name,'created_at',b.created_at,'completedBadges',jsonb_build_object('strength',b.strength,'cardio',b.cardio,'swimming',b.swimming,'cycling',b.cycling,'nutrition',b.nutrition)) as row
      from bundle_badges b join students_scope s on s.id=b.student_id
      where b.created_at >= (date_trunc('month',_today::timestamp) at time zone 'America/Sao_Paulo') order by b.created_at desc,b.id limit 80
    ) m),'[]'::jsonb),
    'pendingFeedback',coalesce((select jsonb_agg(f.row order by f.created_at desc) from (
      select created_at,jsonb_build_object('id',id,'student_id',student_id,'name',full_name,'nps',nps,'wants_adjustment',wants_adjustment,'adjustment_notes',adjustment_notes,'created_at',created_at) as row from feedback_scope where not applied order by created_at desc,id limit 50
    ) f),'[]'::jsonb),
    'cohortFeedback',coalesce((select jsonb_agg(jsonb_build_object('bucket',f.bucket,'alunos',f.alunos,'media_nps',f.media_nps,'pct_ajuste',f.pct_ajuste) order by f.bucket) from (
      select case when nps>=9 then 'Promotores (9-10)' when nps>=7 then 'Neutros (7-8)' when nps is null then 'Sem nota' else 'Detratores (0-6)' end as bucket,
        count(distinct student_id)::int as alunos,round(avg(nps)::numeric,1) as media_nps,round(100.0*sum(case when wants_adjustment then 1 else 0 end)/nullif(count(*),0),0) as pct_ajuste
      from feedback_scope group by 1
    ) f),'[]'::jsonb),
    'contactCadence',coalesce((select jsonb_agg(jsonb_build_object('chat_id',c.id,'contact_name',c.contact_name,'student_id',s.id,'student_name',s.full_name,'student_status',s.status,'kind',case when s.id is null then 'lead' else 'aluno' end,'last_inbound_at',m.last_inbound_at,'hours_since',round(extract(epoch from (now()-m.last_inbound_at))/3600.0,1)) order by m.last_inbound_at,c.id)
      from public.whatsapp_chats c left join students_scope s on s.id=c.student_id
      join lateral (select max(wm.timestamp) as last_inbound_at from public.whatsapp_messages wm where wm.chat_id=c.id and wm.company_id=_company_id and not wm.is_from_me) m on true
      where c.company_id=_company_id and not coalesce(c.cadence_muted,false) and c.remote_jid not like '%@g.us' and m.last_inbound_at is not null
        and (c.student_id is null or s.id is not null) and (s.id is null or s.status in ('active','pending','awaiting_renewal'))),'[]'::jsonb),
    'atRiskStudents',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.full_name,'status',r.status,'pain',r.pain,'tone',case when r.pain is not null or r.status='risco' then 'red' else 'amber' end,
      'reasons',array_remove(array[
        case when r.pain is not null then 'Dor: '||r.pain end,
        case when r.active and r.assessment_days>60 then 'Reavaliação devida (última há '||r.assessment_days||'d)' end,
        case when r.overdue then 'Pagamento em atraso' end,
        case when r.training_days>=10 then 'Sem treinar há '||r.training_days||' dias' end,
        case when r.cycle_days<=7 then case when r.cycle_days<=0 then 'Ciclo vencido' else 'Ciclo vence em '||r.cycle_days||' dias' end end,
        case when not r.active then 'Sem treino ativo' end
      ],null)) order by (r.pain is not null or r.status='risco') desc,r.full_name,r.id)
      from risk_status r where r.status in ('risco','renovacao') or ((r.pain is not null or (r.active and r.assessment_days>60)) and r.status='ativo')),'[]'::jsonb)
  ) into _result;
  return _result;
end;
$$;

revoke all on function public.get_company_dashboard_snapshot(uuid) from public, anon;
grant execute on function public.get_company_dashboard_snapshot(uuid) to authenticated;

-- Separate legacy leak: USING correlated leads.company_id to itself for ANY staff.
-- Keep the scoped Company staff manage leads policy and ALL other policies intact.
drop policy if exists staff_leads on public.leads;
