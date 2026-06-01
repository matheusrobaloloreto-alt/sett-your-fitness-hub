
CREATE OR REPLACE FUNCTION public.generate_training_cycles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start date;
  v_end date;
  v_cycle_days integer;
  v_plan_days integer;
BEGIN
  IF NEW.training_start_date IS NULL THEN
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'UPDATE' AND OLD.training_start_date = NEW.training_start_date THEN
    RETURN NEW;
  END IF;

  v_start := NEW.training_start_date;
  
  IF NEW.plan_id IS NOT NULL THEN
    SELECT COALESCE(p.cycle_duration_days, 42), COALESCE(p.duration_days, p.duration_weeks * 7, 90)
    INTO v_cycle_days, v_plan_days
    FROM public.plans p WHERE p.id = NEW.plan_id;
  END IF;
  
  v_cycle_days := COALESCE(v_cycle_days, NEW.cycle_duration_days, 42);
  v_plan_days := COALESCE(v_plan_days, 90);
  
  -- Calculate end date strictly from plan duration, NOT from enrollment end_date
  v_end := v_start + v_plan_days - 1;

  DELETE FROM public.training_cycles WHERE enrollment_id = NEW.id;

  DECLARE
    v_cycle_num integer := 1;
    v_cycle_start date := v_start;
    v_cycle_end date;
  BEGIN
    WHILE v_cycle_start <= v_end LOOP
      v_cycle_end := v_cycle_start + v_cycle_days - 1;
      IF v_cycle_end > v_end THEN
        v_cycle_end := v_end;
      END IF;
      
      INSERT INTO public.training_cycles (enrollment_id, cycle_number, start_date, end_date, status, company_id)
      VALUES (NEW.id, v_cycle_num, v_cycle_start, v_cycle_end, 
              CASE WHEN v_cycle_num = 1 THEN 'active' ELSE 'pending' END,
              NEW.company_id);
      
      v_cycle_num := v_cycle_num + 1;
      v_cycle_start := v_cycle_end + 1;
    END LOOP;
  END;

  RETURN NEW;
END;
$function$;

-- Recalculate cycles for all enrollments that have training_start_date set
-- by updating training_start_date to its own value, triggering the function
UPDATE public.enrollments
SET training_start_date = training_start_date
WHERE training_start_date IS NOT NULL AND plan_id IS NOT NULL;
