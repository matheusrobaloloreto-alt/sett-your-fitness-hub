CREATE OR REPLACE FUNCTION public.advance_training_cycles()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  -- Mark expired active cycles as completed
  UPDATE training_cycles SET status = 'completed'
  WHERE status = 'active' AND end_date < CURRENT_DATE;

  -- Activate next pending cycle for each enrollment that has no active cycle
  UPDATE training_cycles tc SET status = 'active'
  FROM (
    SELECT DISTINCT ON (enrollment_id) id
    FROM training_cycles
    WHERE status = 'pending'
    AND enrollment_id IN (
      SELECT DISTINCT enrollment_id FROM training_cycles
      WHERE status = 'completed'
      AND NOT EXISTS (
        SELECT 1 FROM training_cycles tc2
        WHERE tc2.enrollment_id = training_cycles.enrollment_id AND tc2.status = 'active'
      )
    )
    ORDER BY enrollment_id, cycle_number
  ) next_cycle
  WHERE tc.id = next_cycle.id;
END;
$$;