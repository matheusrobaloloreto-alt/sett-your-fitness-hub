-- Helper para remover acentos
CREATE OR REPLACE FUNCTION public.unaccent_simple(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(t,
    'áàâãäÁÀÂÃÄéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
    'aaaaaAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN');
$$;

-- =========================================================
-- PARTE 1: Mapeamento via CTE com UNION ALL de regras
-- =========================================================
WITH ex AS (
  SELECT id, lower(public.unaccent_simple(name)) AS n, lower(coalesce(muscle_group,'')) AS mg
  FROM public.exercise_library
  WHERE (company_id = 'c051e80e-c10c-4522-a88a-e5da26a74d82' OR is_global = true)
    AND NOT EXISTS (SELECT 1 FROM public.exercise_muscle_targets em WHERE em.exercise_id = exercise_library.id)
),
-- Regra principal: define o "padrão" de cada exercício
patterns AS (
  SELECT id, n, mg, CASE
    WHEN n ~ 'supino|crucifixo|crossover|peck deck|pec deck|cross over|chest press' THEN 'supino'
    WHEN n ~ 'flexao|push.up|pushup' THEN 'flexao'
    WHEN n ~ 'desenvolvimento|military press|arnold|landmine press|press militar|overhead press' THEN 'desenv'
    WHEN n ~ 'elevacao lateral|lateral raise' THEN 'elev_lat'
    WHEN n ~ 'elevacao frontal|front raise' THEN 'elev_front'
    WHEN n ~ 'crucifixo invertido|reverse fly|peck deck invertido|elevacao posterior|face pull|facepull' THEN 'crucinv'
    WHEN n ~ 'puxada|pulldown|pull down|pull-down' THEN 'puxada'
    WHEN n ~ 'remada|seal row|t.bar' OR n ~ ' row' OR n ~ '^row' THEN 'remada'
    WHEN n ~ 'pull.over|pullover' THEN 'pullover'
    WHEN n ~ 'barra fixa|chin.up|chin up|pull.up|pull up' THEN 'barrafixa'
    WHEN n ~ 'levantamento terra|terra|deadlift|stiff' THEN 'terra'
    WHEN n ~ 'encolhimento|shrug' THEN 'shrug'
    WHEN n ~ 'rosca' AND n ~ 'martelo|hammer|inversa' THEN 'rosca_martelo'
    WHEN n ~ 'rosca' THEN 'rosca'
    WHEN n ~ 'triceps|tricep|frances|testa|coice|kickback|extensao.*triceps|mergulho' THEN 'triceps'
    WHEN n ~ 'agachamento|squat|hack|leg press|sissy' THEN 'agacho'
    WHEN n ~ 'afundo|avanco|lunge|bulgaro|passada|step.up|step up|subida no banco' THEN 'afundo'
    WHEN n ~ 'extensora|leg extension' THEN 'extensora'
    WHEN n ~ 'flexora|leg curl|nordic|good morning' THEN 'flexora'
    WHEN n ~ 'hip thrust|elevacao pelvica|ponte|bridge' THEN 'hipthrust'
    WHEN n ~ 'gluteo|abducao|kick back|kickback' THEN 'gluteo'
    WHEN n ~ 'aducao|adutor' THEN 'adutor'
    WHEN n ~ 'panturrilha|gemeo|sole|calf' THEN 'pant'
    WHEN n ~ 'abdominal|prancha|plank|crunch|abs|core|russian twist' THEN 'abd'
    WHEN n ~ 'lombar|hiperextensao|extensao de tronco|back extension|superman' THEN 'lombar'
    WHEN n ~ 'antebraco|wrist|punho|farmer|garra' THEN 'antebraco'
    ELSE 'fallback'
  END AS pat
  FROM ex
),
-- Mapa pattern -> [(grupo, role, vol)]
rules AS (
  SELECT * FROM (VALUES
    ('supino','3-peit','primary',1.0),
    ('supino','12-tri','secondary',0.5),
    ('supino','9-dant','secondary',0.5),
    ('flexao','3-peit','primary',1.0),
    ('flexao','12-tri','secondary',0.5),
    ('flexao','9-dant','secondary',0.5),
    ('desenv','9-dant','primary',1.0),
    ('desenv','10-dlat','secondary',0.5),
    ('desenv','12-tri','secondary',0.5),
    ('elev_lat','10-dlat','primary',1.0),
    ('elev_front','9-dant','primary',1.0),
    ('crucinv','11-dpos','primary',1.0),
    ('crucinv','15-trap','secondary',0.5),
    ('puxada','4-dors','primary',1.0),
    ('puxada','13-bic','secondary',0.5),
    ('puxada','11-dpos','secondary',0.5),
    ('remada','4-dors','primary',1.0),
    ('remada','13-bic','secondary',0.5),
    ('remada','11-dpos','secondary',0.5),
    ('remada','15-trap','secondary',0.5),
    ('pullover','4-dors','primary',1.0),
    ('pullover','3-peit','secondary',0.5),
    ('barrafixa','4-dors','primary',1.0),
    ('barrafixa','13-bic','secondary',0.5),
    ('terra','5-post','primary',1.0),
    ('terra','2-glut','secondary',0.5),
    ('terra','14-lomb','secondary',0.5),
    ('terra','4-dors','secondary',0.5),
    ('shrug','15-trap','primary',1.0),
    ('rosca','13-bic','primary',1.0),
    ('rosca_martelo','13-bic','primary',1.0),
    ('rosca_martelo','16-braq','secondary',0.5),
    ('rosca_martelo','17-ante','secondary',0.5),
    ('triceps','12-tri','primary',1.0),
    ('agacho','1-quad','primary',1.0),
    ('agacho','2-glut','secondary',0.5),
    ('agacho','5-post','secondary',0.5),
    ('agacho','6-adut','secondary',0.5),
    ('afundo','1-quad','primary',1.0),
    ('afundo','2-glut','secondary',0.5),
    ('afundo','5-post','secondary',0.5),
    ('extensora','1-quad','primary',1.0),
    ('flexora','5-post','primary',1.0),
    ('flexora','2-glut','secondary',0.5),
    ('hipthrust','2-glut','primary',1.0),
    ('hipthrust','5-post','secondary',0.5),
    ('gluteo','2-glut','primary',1.0),
    ('adutor','6-adut','primary',1.0),
    ('pant','7-pant','primary',1.0),
    ('abd','8-abd','primary',1.0),
    ('lombar','14-lomb','primary',1.0),
    ('lombar','2-glut','secondary',0.5),
    ('antebraco','17-ante','primary',1.0)
  ) AS r(pat, gcode, role, vol)
),
-- Resolve gcode -> uuid
gmap AS (
  SELECT * FROM (VALUES
    ('1-quad', '3db82e92-5908-410e-91a2-9a62cc2bea46'::uuid),
    ('2-glut', '5cbe97cd-5ae8-4fbe-9f30-5b37203a19d5'::uuid),
    ('5-post', '77d093d5-0a62-4b1f-b47f-b981e8af19fa'::uuid),
    ('6-adut', '1ce81b26-44b1-4c09-b2bf-966381a24e5f'::uuid),
    ('7-pant', '5f32c4c4-b043-4dd5-a65b-a22ecdb64573'::uuid),
    ('3-peit', '835ef882-94b4-4911-9202-d6ebc143192d'::uuid),
    ('4-dors', '6e97ad9f-0428-4513-a00f-08e6421c8597'::uuid),
    ('10-dlat','3f48c850-84a5-46f3-ae18-ad9450a5d929'::uuid),
    ('9-dant', '22b24c2d-1841-4dc9-bc60-34469abd2e18'::uuid),
    ('11-dpos','64d81d34-cb15-44d0-b460-5cd209c664e3'::uuid),
    ('13-bic', '78d9b019-e1b3-4119-b4fe-fca633945cb6'::uuid),
    ('12-tri', '6b925fc8-cf05-40aa-a5f8-18418d7439c4'::uuid),
    ('17-ante','149249ab-3aa4-4651-b054-7c8237b61527'::uuid),
    ('8-abd',  '137f9001-084e-4904-a9b5-a4dedef02c4a'::uuid),
    ('14-lomb','7e57b708-c05c-4532-9d80-45d1c6f7e078'::uuid),
    ('15-trap','a269b423-1a11-4e8a-92d1-ed1293aeab47'::uuid),
    ('16-braq','005324af-3051-4331-b6b3-7e3eb0581d6c'::uuid)
  ) AS g(gcode, gid)
),
-- Para "fallback", usa o muscle_group existente do exercício
fallback_targets AS (
  SELECT p.id AS exercise_id, g.gid AS muscle_group_id, 'primary'::text AS role, 1.0::numeric AS vol
  FROM patterns p
  JOIN gmap g ON g.gcode = CASE
    WHEN p.mg ~ 'peito|peitoral' THEN '3-peit'
    WHEN p.mg ~ 'costa|dorsal' THEN '4-dors'
    WHEN p.mg ~ 'biceps' THEN '13-bic'
    WHEN p.mg ~ 'triceps' THEN '12-tri'
    WHEN p.mg ~ 'ombro' THEN '10-dlat'
    WHEN p.mg ~ 'quadriceps|perna' THEN '1-quad'
    WHEN p.mg ~ 'gluteo' THEN '2-glut'
    WHEN p.mg ~ 'posterior' THEN '5-post'
    WHEN p.mg ~ 'panturrilha' THEN '7-pant'
    WHEN p.mg ~ 'abdom' THEN '8-abd'
    WHEN p.mg ~ 'lombar' THEN '14-lomb'
    WHEN p.mg ~ 'trapezio' THEN '15-trap'
    WHEN p.mg ~ 'antebra' THEN '17-ante'
    WHEN p.mg ~ 'adut' THEN '6-adut'
    ELSE NULL
  END
  WHERE p.pat = 'fallback'
),
-- Targets para padrões mapeados
pattern_targets AS (
  SELECT p.id AS exercise_id, g.gid AS muscle_group_id, r.role, r.vol
  FROM patterns p
  JOIN rules r ON r.pat = p.pat
  JOIN gmap g ON g.gcode = r.gcode
),
all_targets AS (
  SELECT * FROM pattern_targets
  UNION ALL
  SELECT * FROM fallback_targets
)
INSERT INTO public.exercise_muscle_targets (exercise_id, muscle_group_id, role, volume_percentage, is_primary)
SELECT DISTINCT ON (exercise_id, muscle_group_id)
  exercise_id, muscle_group_id, role, vol, (role = 'primary')
FROM all_targets
ORDER BY exercise_id, muscle_group_id, (role = 'primary') DESC;

-- =========================================================
-- PARTE 2: Sessões reais do Syer
-- =========================================================
DELETE FROM public.workout_logs WHERE student_id = '3cb1cfae-4eec-4b2c-957b-b26eaa906dbe';
DELETE FROM public.workout_sessions WHERE student_id = '3cb1cfae-4eec-4b2c-957b-b26eaa906dbe';

DO $$
DECLARE
  v_student_id uuid := '3cb1cfae-4eec-4b2c-957b-b26eaa906dbe';
  v_company_id uuid := 'c051e80e-c10c-4522-a88a-e5da26a74d82';
  v_workouts uuid[] := ARRAY[
    'e5557721-cd5b-4f0f-990f-8f696f10fd66'::uuid,
    'f58f84bc-ce01-4fdd-abb2-3f22b4893ea1'::uuid,
    '8738a6d6-28f6-495d-bd8c-1152c1d3b1e8'::uuid
  ];
  v_base_loads jsonb := '{
    "e5557721-cd5b-4f0f-990f-8f696f10fd66": [60, 12, 20],
    "f58f84bc-ce01-4fdd-abb2-3f22b4893ea1": [55, 80],
    "8738a6d6-28f6-495d-bd8c-1152c1d3b1e8": [80, 120]
  }'::jsonb;
  v_base_reps jsonb := '{
    "e5557721-cd5b-4f0f-990f-8f696f10fd66": [10, 12, 12],
    "f58f84bc-ce01-4fdd-abb2-3f22b4893ea1": [10, 8],
    "8738a6d6-28f6-495d-bd8c-1152c1d3b1e8": [8, 12]
  }'::jsonb;
  v_num_sets jsonb := '{
    "e5557721-cd5b-4f0f-990f-8f696f10fd66": [4, 3, 3],
    "f58f84bc-ce01-4fdd-abb2-3f22b4893ea1": [4, 4],
    "8738a6d6-28f6-495d-bd8c-1152c1d3b1e8": [5, 4]
  }'::jsonb;
  v_session_idx int;
  v_session_id uuid;
  v_workout_id uuid;
  v_week int;
  v_session_in_week int;
  v_session_date timestamptz;
  v_total_volume numeric;
  v_total_sets_completed int;
  v_total_sets_prescribed int;
  v_exercises_summary jsonb;
  v_workout_exercises jsonb;
  v_ex jsonb;
  v_ex_idx int;
  v_loads jsonb;
  v_reps_arr jsonb;
  v_sets_arr jsonb;
  v_n_sets int;
  v_set int;
  v_weight numeric;
  v_reps int;
  v_base_w numeric;
  v_base_r int;
  v_ex_summary jsonb;
  v_ex_sets jsonb;
  v_max_w numeric;
  v_ex_volume numeric;
  v_start_date date := CURRENT_DATE - INTERVAL '28 days';
  v_dow_offsets int[] := ARRAY[0, 2, 4, 6];
BEGIN
  FOR v_session_idx IN 0..15 LOOP
    v_week := v_session_idx / 4;
    v_session_in_week := v_session_idx % 4;
    v_workout_id := v_workouts[(v_session_idx % 3) + 1];
    v_session_date := (v_start_date + (v_week * 7 + v_dow_offsets[v_session_in_week + 1]) * INTERVAL '1 day') + INTERVAL '14 hours';

    SELECT exercises INTO v_workout_exercises FROM public.workouts WHERE id = v_workout_id;
    v_loads := v_base_loads -> v_workout_id::text;
    v_reps_arr := v_base_reps -> v_workout_id::text;
    v_sets_arr := v_num_sets -> v_workout_id::text;

    INSERT INTO public.workout_sessions
      (student_id, workout_id, company_id, started_at, completed_at, status, session_date, duration_seconds)
    VALUES
      (v_student_id, v_workout_id, v_company_id, v_session_date, v_session_date + INTERVAL '70 minutes',
       'completed', v_session_date::date, 4200)
    RETURNING id INTO v_session_id;

    v_total_volume := 0;
    v_total_sets_completed := 0;
    v_total_sets_prescribed := 0;
    v_exercises_summary := '[]'::jsonb;

    FOR v_ex_idx IN 0..(jsonb_array_length(v_workout_exercises) - 1) LOOP
      v_ex := v_workout_exercises -> v_ex_idx;
      v_base_w := (v_loads ->> v_ex_idx)::numeric;
      v_base_r := (v_reps_arr ->> v_ex_idx)::int;
      v_n_sets := (v_sets_arr ->> v_ex_idx)::int;
      v_max_w := 0;
      v_ex_volume := 0;
      v_ex_sets := '[]'::jsonb;
      v_weight := v_base_w + v_week * (CASE WHEN v_base_w >= 50 THEN 2.5 ELSE 1.0 END);

      FOR v_set IN 1..v_n_sets LOOP
        v_reps := v_base_r;
        IF v_set > (v_n_sets / 2) THEN v_reps := v_base_r - 1; END IF;
        IF v_reps < 5 THEN v_reps := 5; END IF;

        INSERT INTO public.workout_logs
          (student_id, workout_id, exercise_index, set_number, weight, reps_done, completed, completed_at, session_date)
        VALUES
          (v_student_id, v_workout_id, v_ex_idx, v_set, v_weight, v_reps, true,
           v_session_date + (v_set * INTERVAL '3 minutes'), v_session_date::date);

        v_ex_sets := v_ex_sets || jsonb_build_object('weight', v_weight, 'reps', v_reps);
        IF v_weight > v_max_w THEN v_max_w := v_weight; END IF;
        v_ex_volume := v_ex_volume + (v_weight * v_reps);
        v_total_sets_completed := v_total_sets_completed + 1;
      END LOOP;

      v_total_sets_prescribed := v_total_sets_prescribed + v_n_sets;
      v_total_volume := v_total_volume + v_ex_volume;

      v_ex_summary := jsonb_build_object(
        'name', v_ex ->> 'exercise_name',
        'muscleGroup', '',
        'sets', v_ex_sets,
        'maxWeight', v_max_w,
        'volume', v_ex_volume,
        'isPR', (v_week = 3)
      );
      v_exercises_summary := v_exercises_summary || v_ex_summary;
    END LOOP;

    UPDATE public.workout_sessions
       SET total_volume = v_total_volume,
           total_sets_completed = v_total_sets_completed,
           total_sets_prescribed = v_total_sets_prescribed,
           exercises_summary = v_exercises_summary
     WHERE id = v_session_id;
  END LOOP;
END $$;