
-- Regenerate training cycles for all enrollments that have training_start_date
-- We do this by updating training_start_date to itself + 1 day then back, to trigger the function
-- But the trigger only fires on change, so we need a two-step approach
-- Step 1: Set to null temporarily
UPDATE enrollments SET training_start_date = training_start_date + interval '1 day'
WHERE training_start_date IS NOT NULL;

-- Step 2: Set back to original (this triggers regeneration again with correct values)
UPDATE enrollments SET training_start_date = training_start_date - interval '1 day'
WHERE training_start_date IS NOT NULL;
