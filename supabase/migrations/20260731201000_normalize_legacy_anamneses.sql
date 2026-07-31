-- Preserve legacy anamneses in the canonical Studio contract without deleting the source rows.
-- The source id makes the backfill auditable and the student unique key keeps it idempotent.
alter table public.student_anamneses
  add column if not exists legacy_anamnesis_id uuid references public.anamnesis(id) on delete set null;

create unique index if not exists student_anamneses_legacy_source_uidx
  on public.student_anamneses (legacy_anamnesis_id)
  where legacy_anamnesis_id is not null;

with latest_legacy as (
  select distinct on (a.student_id)
    a.*
  from public.anamnesis a
  where a.student_id is not null
  order by a.student_id, coalesce(a.submitted_at, a.updated_at, a.created_at) desc
), normalized as (
  select
    a.id as legacy_anamnesis_id,
    a.student_id,
    coalesce(a.company_id, s.company_id) as company_id,
    nullif(btrim(a.goals), '') as objective,
    nullif(btrim(a.physical_activity_level), '') as activity_level,
    nullif(btrim(a.modalities), '') as training_modality,
    nullif(btrim(a.available_equipment), '') as equipment,
    nullif(btrim(a.nutrition), '') as nutrition_context,
    nullif(btrim(a.sleep_quality), '') as sleep_quality_text,
    nullif(btrim(a.stress_level), '') as stress_text,
    nullif((regexp_match(coalesce(a.available_days, a.training_days, ''), '(\d+)'))[1], '')::integer as available_days_number,
    nullif((regexp_match(coalesce(a.session_duration, ''), '(\d+)'))[1], '')::integer as session_minutes,
    concat_ws(E'\n',
      nullif('Lesoes: ' || nullif(btrim(a.injuries), ''), 'Lesoes: '),
      nullif('Dor atual: ' || nullif(btrim(a.current_pain), ''), 'Dor atual: '),
      nullif('Areas de dor: ' || nullif(btrim(a.pain_areas), ''), 'Areas de dor: '),
      nullif('Condicoes: ' || nullif(btrim(a.health_conditions), ''), 'Condicoes: '),
      nullif('Restricoes: ' || nullif(btrim(a.restrictions), ''), 'Restricoes: ')
    ) as injuries,
    concat_ws(E'\n',
      'Importado da anamnese legada sem apagar o registro original.',
      nullif('Dias de treino: ' || nullif(btrim(a.training_days), ''), 'Dias de treino: '),
      nullif('Dias disponiveis: ' || nullif(btrim(a.available_days), ''), 'Dias disponiveis: '),
      nullif('Experiencia: ' || nullif(btrim(a.experience_level), ''), 'Experiencia: '),
      nullif(btrim(a.additional_notes), '')
    ) as notes,
    coalesce(a.submitted_at, a.created_at, now()) as created_at
  from latest_legacy a
  join public.students s on s.id = a.student_id
  where coalesce(a.company_id, s.company_id) is not null
)
insert into public.student_anamneses (
  student_id,
  company_id,
  legacy_anamnesis_id,
  objective,
  activity_level,
  training_modality,
  wants_strength,
  wants_running,
  wants_swimming,
  wants_cycling,
  wants_nutrition,
  is_endurance_athlete,
  days_per_week_strength,
  days_per_week_cardio,
  session_duration_min,
  equipment,
  sport,
  sleep_quality,
  stress_score,
  injuries,
  food_restrictions,
  nutrition_context,
  notes,
  created_at,
  updated_at
)
select
  n.student_id,
  n.company_id,
  n.legacy_anamnesis_id,
  n.objective,
  n.activity_level,
  n.training_modality,
  -- Legacy modalities describe what the person practiced, not what they requested
  -- from SETT. Keep strength as the historical BN default and never infer extra services.
  true,
  false,
  false,
  false,
  false,
  coalesce(n.training_modality, '') ~* '(corrida|running|triathlon|bike|ciclismo|pedal|natacao|swim)',
  greatest(1, least(6, coalesce(n.available_days_number, 3))),
  case
    when coalesce(n.training_modality, '') ~* '(corrida|running|triathlon|bike|ciclismo|pedal|natacao|swim)'
      then greatest(1, least(7, coalesce(n.available_days_number, 3)))
    else 0
  end,
  greatest(20, least(180, coalesce(n.session_minutes, 60))),
  n.equipment,
  case
    when coalesce(n.training_modality, '') ~* 'triathlon' then 'triathlon'
    when coalesce(n.training_modality, '') ~* '(corrida|running)' then 'corrida'
    when coalesce(n.training_modality, '') ~* '(natacao|swim)' then 'natacao'
    when coalesce(n.training_modality, '') ~* '(bike|ciclismo|pedal)' then 'ciclismo'
    else null
  end,
  case
    when n.sleep_quality_text ~ '^\d+$' then greatest(1, least(5, n.sleep_quality_text::integer))
    else null
  end,
  case
    when n.stress_text ~ '^\d+$' then greatest(1, least(5, n.stress_text::integer))
    else null
  end,
  nullif(n.injuries, ''),
  null,
  n.nutrition_context,
  n.notes,
  n.created_at,
  now()
from normalized n
on conflict (student_id) do nothing;

comment on column public.student_anamneses.legacy_anamnesis_id is
  'Source row from public.anamnesis when the canonical record was backfilled; source is retained.';
