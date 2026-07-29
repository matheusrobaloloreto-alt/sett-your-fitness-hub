-- The MFIT import ran while the master profile still pointed at an orphaned
-- company. Re-scope only those imported exercises to the active SETT company;
-- muscle targets, metadata and video URLs reference the exercise id and remain
-- intact.
update public.exercise_library
set
  company_id = 'dad65c62-e700-4ae9-930a-43b18357c171'::uuid,
  updated_at = now()
where company_id = '2b844c3a-c12a-4136-b120-011490fb375a'::uuid
  and is_global is not true;
