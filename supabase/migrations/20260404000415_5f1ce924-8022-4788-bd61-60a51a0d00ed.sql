ALTER TABLE workout_logs ADD COLUMN IF NOT EXISTS set_type text DEFAULT 'normal';
ALTER TABLE workout_logs ADD COLUMN IF NOT EXISTS rpe smallint;
ALTER TABLE workout_logs ADD COLUMN IF NOT EXISTS completed boolean DEFAULT false;