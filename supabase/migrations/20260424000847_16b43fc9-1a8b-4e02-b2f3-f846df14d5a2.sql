
-- Trigger: preencher muscle_group nos exercícios de workouts a partir da exercise_library
CREATE OR REPLACE FUNCTION public.set_workout_exercise_muscle_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_exercises jsonb := '[]'::jsonb;
  v_item jsonb;
  v_name text;
  v_mg text;
  v_lookup text;
BEGIN
  IF NEW.exercises IS NULL OR jsonb_typeof(NEW.exercises) <> 'array' THEN
    RETURN NEW;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.exercises) LOOP
    v_name := v_item->>'exercise_name';
    v_mg := NULLIF(trim(v_item->>'muscle_group'), '');

    IF v_mg IS NULL AND v_name IS NOT NULL THEN
      SELECT COALESCE(NULLIF(trim(el.muscle_group), ''), mg.name)
        INTO v_lookup
      FROM public.exercise_library el
      LEFT JOIN public.muscle_groups mg ON mg.id = el.muscle_group_id
      WHERE lower(el.name) = lower(v_name)
        AND (el.is_global = true OR el.company_id = NEW.company_id)
      ORDER BY (el.company_id = NEW.company_id) DESC NULLS LAST
      LIMIT 1;

      IF v_lookup IS NOT NULL THEN
        v_item := jsonb_set(v_item, '{muscle_group}', to_jsonb(v_lookup));
      END IF;
    END IF;

    v_new_exercises := v_new_exercises || v_item;
  END LOOP;

  NEW.exercises := v_new_exercises;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_workout_exercise_muscle_group ON public.workouts;
CREATE TRIGGER trg_set_workout_exercise_muscle_group
BEFORE INSERT OR UPDATE ON public.workouts
FOR EACH ROW EXECUTE FUNCTION public.set_workout_exercise_muscle_group();
