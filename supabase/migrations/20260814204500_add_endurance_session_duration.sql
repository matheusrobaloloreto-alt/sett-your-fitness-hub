alter table public.student_anamneses
  add column if not exists endurance_session_duration_min integer;

comment on column public.student_anamneses.endurance_session_duration_min is
  'Tempo disponível por sessão de corrida, natação ou ciclismo; separado da duração da musculação.';
