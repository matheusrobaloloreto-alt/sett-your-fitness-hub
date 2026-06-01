-- Add unique constraint on company_members.user_id if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'company_members_user_id_key' 
    AND conrelid = 'public.company_members'::regclass
  ) THEN
    ALTER TABLE public.company_members ADD CONSTRAINT company_members_user_id_key UNIQUE (user_id);
  END IF;
END $$;