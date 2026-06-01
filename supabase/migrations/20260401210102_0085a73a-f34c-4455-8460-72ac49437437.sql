
-- Insert simulated workout_sessions and workout_logs for Syer Rodrigues
-- Student ID: 3cb1cfae-4eec-4b2c-957b-b26eaa906dbe
-- Company ID: c051e80e-c10c-4522-a88a-e5da26a74d82

-- Workout A (Peito + Tríceps): 9f832aeb-3bec-4bb1-addc-963fce455ca6
-- Workout B (Costas + Bíceps): a7273f09-4c49-4699-a570-b825ae283509
-- Workout C (Pernas): 9133625b-6940-4d7f-b54a-67e16a36cfaa
-- Workout D (Ombros + Tríceps): ec5111ba-a08d-4326-84d9-da49ab5bb523

DO $$
DECLARE
  v_student_id uuid := '3cb1cfae-4eec-4b2c-957b-b26eaa906dbe';
  v_company_id uuid := 'c051e80e-c10c-4522-a88a-e5da26a74d82';
  v_workouts text[] := ARRAY[
    '9f832aeb-3bec-4bb1-addc-963fce455ca6',
    'a7273f09-4c49-4699-a570-b825ae283509',
    '9133625b-6940-4d7f-b54a-67e16a36cfaa',
    'ec5111ba-a08d-4326-84d9-da49ab5bb523'
  ];
  v_day integer;
  v_workout_idx integer;
  v_session_id uuid;
  v_session_date date;
  v_exercises_count integer[] := ARRAY[6, 6, 5, 5];
  v_sets_count integer[][] := ARRAY[
    ARRAY[4,4,3,3,3,3],
    ARRAY[4,4,3,3,3,3],
    ARRAY[4,4,3,3,4,0],
    ARRAY[4,4,3,3,3,0]
  ];
  v_weights numeric[][] := ARRAY[
    ARRAY[28,60,25,14,30,25],
    ARRAY[70,50,60,30,28,16],
    ARRAY[100,180,50,24,80,0],
    ARRAY[20,10,8,10,50,0]
  ];
  v_reps integer[][] := ARRAY[
    ARRAY[10,10,12,12,12,12],
    ARRAY[10,10,12,12,10,12],
    ARRAY[8,10,12,10,15,0],
    ARRAY[10,12,12,12,10,0]
  ];
  v_ex_idx integer;
  v_set_num integer;
  v_total_volume numeric;
  v_total_sets integer;
BEGIN
  -- Generate 20 sessions over last 30 days (roughly 5x/week)
  FOR v_day IN 1..30 LOOP
    -- Skip some days to simulate rest days
    IF v_day % 7 = 0 OR v_day % 7 = 4 THEN
      CONTINUE;
    END IF;

    v_workout_idx := ((v_day - 1) % 4) + 1;
    v_session_date := CURRENT_DATE - v_day;
    v_session_id := gen_random_uuid();
    v_total_volume := 0;
    v_total_sets := 0;

    -- Insert workout_logs for each exercise
    FOR v_ex_idx IN 1..v_exercises_count[v_workout_idx] LOOP
      FOR v_set_num IN 1..v_sets_count[v_workout_idx][v_ex_idx] LOOP
        -- Add some variation
        INSERT INTO workout_logs (
          student_id, workout_id, exercise_index, set_number,
          weight, reps_done, session_date, created_at
        ) VALUES (
          v_student_id,
          v_workouts[v_workout_idx]::uuid,
          v_ex_idx - 1,
          v_set_num,
          v_weights[v_workout_idx][v_ex_idx] + (random() * 4 - 2),
          v_reps[v_workout_idx][v_ex_idx] + floor(random() * 3 - 1)::integer,
          v_session_date,
          v_session_date + interval '17 hours' + (random() * interval '2 hours')
        );
        v_total_volume := v_total_volume + v_weights[v_workout_idx][v_ex_idx] * v_reps[v_workout_idx][v_ex_idx];
        v_total_sets := v_total_sets + 1;
      END LOOP;
    END LOOP;

    -- Insert workout_session
    INSERT INTO workout_sessions (
      id, student_id, workout_id, company_id,
      session_date, status, started_at, completed_at,
      duration_seconds, total_volume, total_sets_completed, total_sets_prescribed
    ) VALUES (
      v_session_id,
      v_student_id,
      v_workouts[v_workout_idx]::uuid,
      v_company_id,
      v_session_date,
      'completed',
      v_session_date + interval '17 hours',
      v_session_date + interval '18 hours' + (random() * interval '30 minutes'),
      3000 + floor(random() * 1200)::integer,
      v_total_volume,
      v_total_sets,
      v_total_sets
    );
  END LOOP;
END $$;
