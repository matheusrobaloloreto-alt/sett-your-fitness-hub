
-- Step 1: Fix duration_days on ALL plans to match duration_weeks * 7
UPDATE plans SET duration_days = duration_weeks * 7;

-- Step 2: Fix cycle_duration_days on ALL enrollments from their plan
UPDATE enrollments e SET cycle_duration_days = p.cycle_duration_days
FROM plans p WHERE e.plan_id = p.id;

-- Step 3: Delete ALL training_cycles (all are wrong/duplicated)
DELETE FROM training_cycles;
