-- Preserva integralmente documentos alimentares enviados pelo aluno. A camada
-- visual pode estruturar o conteúdo, mas nunca deve substituir a fonte clínica.
alter table public.nutrition_plans
  add column if not exists source_type text,
  add column if not exists source_file_name text,
  add column if not exists source_document jsonb;

comment on column public.nutrition_plans.source_type is
  'Origem do plano: nutritionist_pdf, generated_guidance ou manual.';
comment on column public.nutrition_plans.source_file_name is
  'Nome original do arquivo enviado pelo aluno.';
comment on column public.nutrition_plans.source_document is
  'Documento externo preservado, incluindo texto original, linhas, seções e metas explicitamente encontradas.';

create index if not exists nutrition_plans_source_type_idx
  on public.nutrition_plans(student_id, source_type, created_at desc);
