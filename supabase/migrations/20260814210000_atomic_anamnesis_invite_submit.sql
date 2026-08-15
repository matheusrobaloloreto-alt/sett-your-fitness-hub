-- Consume an anamnesis invite and persist the student/anamnesis snapshot in one
-- transaction. Only the Edge Function service role may call this function.

alter table public.student_anamneses
  add column if not exists custom_answers jsonb not null default '{}'::jsonb;

create or replace function public.submit_anamnesis_invite_atomic(
  _token text,
  _student_patch jsonb default '{}'::jsonb,
  _anamnese jsonb default '{}'::jsonb,
  _effects jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invite_row public.anamnese_invites%rowtype;
  student_row public.students%rowtype;
  saved_row public.student_anamneses%rowtype;
  next_version integer;
  pain_entry record;
  pain_score numeric;
  race_payload jsonb;
begin
  if _token is null or length(btrim(_token)) < 16 then
    raise exception 'invalid anamnesis invite';
  end if;
  if jsonb_typeof(coalesce(_student_patch, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(_anamnese, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(_effects, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid anamnesis payload';
  end if;

  select * into invite_row
  from public.anamnese_invites
  where token = _token
  for update;

  if not found then
    raise exception 'anamnesis invite not found';
  end if;
  if invite_row.status <> 'pending' then
    raise exception 'anamnesis invite already consumed';
  end if;
  if invite_row.expires_at is not null and invite_row.expires_at < now() then
    raise exception 'anamnesis invite expired';
  end if;

  select * into student_row
  from public.students
  where id = invite_row.student_id
    and company_id = invite_row.company_id
  for update;

  if not found then
    raise exception 'anamnesis invite tenant mismatch';
  end if;

  update public.students
  set full_name = coalesce(nullif(btrim(_student_patch->>'full_name'), ''), full_name),
      weight_kg = case when _student_patch ? 'weight_kg'
        then nullif(_student_patch->>'weight_kg', '')::numeric else weight_kg end,
      height_cm = case when _student_patch ? 'height_cm'
        then nullif(_student_patch->>'height_cm', '')::numeric else height_cm end,
      gender = case when _student_patch ? 'gender'
        then nullif(btrim(_student_patch->>'gender'), '') else gender end,
      updated_at = now()
  where id = student_row.id
    and company_id = student_row.company_id;

  insert into public.student_anamneses (
    student_id, company_id, age, body_fat_percent, objective, activity_level,
    is_endurance_athlete, training_modality, days_per_week_strength,
    days_per_week_cardio, session_duration_min, endurance_session_duration_min,
    equipment, experience_months, sport, fcmax, fcrep, current_volume_weekly,
    current_volume_unit, cardio_goal, stress_score, sleep_quality, injuries,
    food_restrictions, nutrition_context, budget_food, meals_per_day,
    has_kitchen, notes, wants_strength, wants_running, wants_cycling,
    wants_swimming, wants_nutrition, has_nutritionist, has_endurance_coach,
    shown_blocks, custom_answers, updated_at
  ) values (
    student_row.id,
    student_row.company_id,
    nullif(_anamnese->>'age', '')::integer,
    nullif(_anamnese->>'body_fat_percent', '')::numeric,
    nullif(_anamnese->>'objective', ''),
    nullif(_anamnese->>'activity_level', ''),
    coalesce((_anamnese->>'is_endurance_athlete')::boolean, false),
    nullif(_anamnese->>'training_modality', ''),
    nullif(_anamnese->>'days_per_week_strength', '')::integer,
    nullif(_anamnese->>'days_per_week_cardio', '')::integer,
    nullif(_anamnese->>'session_duration_min', '')::integer,
    nullif(_anamnese->>'endurance_session_duration_min', '')::integer,
    nullif(_anamnese->>'equipment', ''),
    nullif(_anamnese->>'experience_months', '')::integer,
    nullif(_anamnese->>'sport', ''),
    nullif(_anamnese->>'fcmax', '')::integer,
    nullif(_anamnese->>'fcrep', '')::integer,
    nullif(_anamnese->>'current_volume_weekly', '')::numeric,
    coalesce(nullif(_anamnese->>'current_volume_unit', ''), 'km_week'),
    nullif(_anamnese->>'cardio_goal', ''),
    nullif(_anamnese->>'stress_score', '')::integer,
    nullif(_anamnese->>'sleep_quality', '')::integer,
    nullif(_anamnese->>'injuries', ''),
    nullif(_anamnese->>'food_restrictions', ''),
    nullif(_anamnese->>'nutrition_context', ''),
    nullif(_anamnese->>'budget_food', ''),
    nullif(_anamnese->>'meals_per_day', '')::integer,
    coalesce((_anamnese->>'has_kitchen')::boolean, true),
    nullif(_anamnese->>'notes', ''),
    coalesce((_anamnese->>'wants_strength')::boolean, false),
    coalesce((_anamnese->>'wants_running')::boolean, false),
    coalesce((_anamnese->>'wants_cycling')::boolean, false),
    coalesce((_anamnese->>'wants_swimming')::boolean, false),
    coalesce((_anamnese->>'wants_nutrition')::boolean, false),
    coalesce((_anamnese->>'has_nutritionist')::boolean, false),
    coalesce((_anamnese->>'has_endurance_coach')::boolean, false),
    array(select jsonb_array_elements_text(coalesce(_anamnese->'shown_blocks', '[]'::jsonb))),
    coalesce(_anamnese->'custom_answers', '{}'::jsonb),
    now()
  )
  on conflict (student_id) do update set
    company_id = excluded.company_id,
    age = excluded.age,
    body_fat_percent = excluded.body_fat_percent,
    objective = excluded.objective,
    activity_level = excluded.activity_level,
    is_endurance_athlete = excluded.is_endurance_athlete,
    training_modality = excluded.training_modality,
    days_per_week_strength = excluded.days_per_week_strength,
    days_per_week_cardio = excluded.days_per_week_cardio,
    session_duration_min = excluded.session_duration_min,
    endurance_session_duration_min = excluded.endurance_session_duration_min,
    equipment = excluded.equipment,
    experience_months = excluded.experience_months,
    sport = excluded.sport,
    fcmax = excluded.fcmax,
    fcrep = excluded.fcrep,
    current_volume_weekly = excluded.current_volume_weekly,
    current_volume_unit = excluded.current_volume_unit,
    cardio_goal = excluded.cardio_goal,
    stress_score = excluded.stress_score,
    sleep_quality = excluded.sleep_quality,
    injuries = excluded.injuries,
    food_restrictions = excluded.food_restrictions,
    nutrition_context = excluded.nutrition_context,
    budget_food = excluded.budget_food,
    meals_per_day = excluded.meals_per_day,
    has_kitchen = excluded.has_kitchen,
    notes = excluded.notes,
    wants_strength = excluded.wants_strength,
    wants_running = excluded.wants_running,
    wants_cycling = excluded.wants_cycling,
    wants_swimming = excluded.wants_swimming,
    wants_nutrition = excluded.wants_nutrition,
    has_nutritionist = excluded.has_nutritionist,
    has_endurance_coach = excluded.has_endurance_coach,
    shown_blocks = excluded.shown_blocks,
    custom_answers = excluded.custom_answers,
    updated_at = now()
  where public.student_anamneses.company_id = student_row.company_id
  returning * into saved_row;

  if saved_row.id is null then
    raise exception 'student anamnesis tenant mismatch';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.student_anamnesis_history
  where student_id = student_row.id;

  insert into public.student_anamnesis_history (
    student_id, company_id, version, snapshot
  ) values (
    student_row.id, student_row.company_id, next_version, to_jsonb(saved_row)
  );

  -- BodyMap/AtRisk read this table directly. Replace only limitations created
  -- by anamnesis, keeping the snapshot and its effects in the same transaction.
  delete from public.student_body_limitations
  where student_id = student_row.id
    and company_id = student_row.company_id
    and source = 'anamnese';

  if _effects ? 'pain' then
    if jsonb_typeof(_effects->'pain') <> 'object' then
      raise exception 'invalid anamnesis pain effects';
    end if;
    for pain_entry in select key, value from jsonb_each(_effects->'pain')
    loop
      if pain_entry.key not in ('tornozelo', 'joelho', 'quadril', 'lombar', 'ombro')
        or jsonb_typeof(pain_entry.value) <> 'number' then
        raise exception 'invalid anamnesis pain region';
      end if;
      pain_score := (pain_entry.value #>> '{}')::numeric;
      if pain_score < 0 or pain_score > 10 then
        raise exception 'invalid anamnesis pain score';
      end if;
      if pain_score > 0 then
        insert into public.student_body_limitations (
          company_id, student_id, region, type, severity, note, source, updated_at
        ) values (
          student_row.company_id,
          student_row.id,
          pain_entry.key,
          'articular',
          case when pain_score >= 7 then 'severa'
               when pain_score >= 4 then 'moderada' else 'leve' end,
          format('Dor relatada na anamnese (EVA %s/10)', pain_score),
          'anamnese',
          now()
        )
        on conflict (student_id, region) do update set
          type = excluded.type,
          severity = excluded.severity,
          note = excluded.note,
          source = excluded.source,
          company_id = excluded.company_id,
          updated_at = now();
      end if;
    end loop;
  end if;

  race_payload := _effects->'race';
  delete from public.student_goals
  where student_id = student_row.id
    and company_id = student_row.company_id
    and kind = 'prova'
    and created_by is null
    and description = 'Cadastrada pela anamnese';
  if race_payload is not null and race_payload <> 'null'::jsonb then
    if jsonb_typeof(race_payload) <> 'object'
      or length(btrim(coalesce(race_payload->>'name', ''))) not between 1 and 120
      or coalesce(race_payload->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'invalid anamnesis race effect';
    end if;
    insert into public.student_goals (
      company_id, student_id, title, kind, target_date, status, description, created_by
    ) values (
      student_row.company_id,
      student_row.id,
      btrim(race_payload->>'name'),
      'prova',
      (race_payload->>'date')::date,
      'pending',
      'Cadastrada pela anamnese',
      null
    );
  end if;

  update public.anamnese_invites
  set status = 'completed', completed_at = now()
  where id = invite_row.id
    and company_id = student_row.company_id
    and student_id = student_row.id
    and status = 'pending';

  if not found then
    raise exception 'anamnesis invite consume conflict';
  end if;

  return jsonb_build_object(
    'ok', true,
    'student_anamnese_id', saved_row.id,
    'invite_id', invite_row.id
  );
end;
$$;

revoke all on function public.submit_anamnesis_invite_atomic(text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_anamnesis_invite_atomic(text, jsonb, jsonb, jsonb)
  to service_role;
