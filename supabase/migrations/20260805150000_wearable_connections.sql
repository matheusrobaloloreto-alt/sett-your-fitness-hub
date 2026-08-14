-- OAuth state and ownership hardening for student wearable integrations.
CREATE TABLE IF NOT EXISTS public.wearable_oauth_states (
  state text PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('oura', 'strava', 'polar', 'whoop')),
  return_url text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wearable_oauth_states ENABLE ROW LEVEL SECURITY;

-- OAuth states and provider tokens are handled only by the service-role edge function.
REVOKE ALL ON public.wearable_oauth_states FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS wearable_oauth_states_expiry_idx
  ON public.wearable_oauth_states (expires_at)
  WHERE consumed_at IS NULL;
