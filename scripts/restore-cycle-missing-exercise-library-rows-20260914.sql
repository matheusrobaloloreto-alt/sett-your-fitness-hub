-- SETT/BN data repair - 2026-09-14
-- Scope: restore exercise_library rows referenced by cycle
-- be282d1b-6d73-407f-b67c-5086337c9022 but missing from the live library.
--
-- This is intentionally data-only and idempotent. It does not modify workouts,
-- students, enrollments, payments, auth, or secrets.

begin;

with rows(id, company_id, name, description, video_url, thumbnail_url, muscle_group, equipment, difficulty, is_global, youtube_video_id) as (
  values
    -- Company-scoped MFIT rows present in the workout JSON but absent from exercise_library.
    ('c78ec371-9f27-5abb-aa6c-a24bdd8015e7'::uuid, 'dad65c62-e700-4ae9-930a-43b18357c171'::uuid, 'Barra Fixa (Pegada Aberta)', 'Restaurado do item importado do ciclo be282d1b-6d73-407f-b67c-5086337c9022.', 'https://vd.mfitpersonal.com.br/543/mp4/543.mp4', 'https://vd.mfitpersonal.com.br/543/jpg/md/543_md.0000000.jpg', 'Dorsal', 'Barra Fixa', 'advanced', false, null),
    ('bdfadd50-d76a-5dc1-8496-bae5f85db591'::uuid, 'dad65c62-e700-4ae9-930a-43b18357c171'::uuid, 'Desenvolvimento Barra Reta', 'Restaurado do item importado do ciclo be282d1b-6d73-407f-b67c-5086337c9022.', 'https://vd.mfitpersonal.com.br/152/mp4/152.mp4', 'https://vd.mfitpersonal.com.br/152/jpg/md/152_md.0000000.jpg', 'Ombro', 'Barra', 'intermediate', false, null),
    ('ccfae29c-c2cf-5a8e-bb0f-e8dd242a6e01'::uuid, 'dad65c62-e700-4ae9-930a-43b18357c171'::uuid, 'Agachamento com Desenvolvimento (Halter no Chão)', 'Restaurado do item importado do ciclo be282d1b-6d73-407f-b67c-5086337c9022.', 'https://vd.mfitpersonal.com.br/v2/1088/mp4/1088_opt.mp4', 'https://vd.mfitpersonal.com.br/v2/1088/jpg/md/1088_md.0000001.jpg', 'Inferiores', 'Halteres', 'intermediate', false, null),
    ('627da02e-17f0-5878-84e0-263787e4ac3d'::uuid, 'dad65c62-e700-4ae9-930a-43b18357c171'::uuid, 'Agachamento Sumô com Salto', 'Restaurado do item importado do ciclo be282d1b-6d73-407f-b67c-5086337c9022.', 'https://vd.mfitpersonal.com.br/802/mp4/802.mp4', 'https://vd.mfitpersonal.com.br/802/jpg/md/802_md.0000000.jpg', 'Para Fazer em Casa', 'Peso Corporal', 'intermediate', false, null),
    ('7bf6dc5d-28c0-57e3-b104-5a059e2af3d0'::uuid, 'dad65c62-e700-4ae9-930a-43b18357c171'::uuid, 'Alongamento de Abdutor I', 'Restaurado do item importado do ciclo be282d1b-6d73-407f-b67c-5086337c9022.', 'https://vd.mfitpersonal.com.br/748/mp4/748.mp4', 'https://vd.mfitpersonal.com.br/748/jpg/md/748_md.0000000.jpg', 'Alongamento', 'Peso Corporal', 'beginner', false, null),
    ('7bdb19e1-e88e-59d8-89f1-9a5ae09f7b4a'::uuid, 'dad65c62-e700-4ae9-930a-43b18357c171'::uuid, 'Alongamento de Adutores I', 'Restaurado do item importado do ciclo be282d1b-6d73-407f-b67c-5086337c9022.', 'https://vd.mfitpersonal.com.br/313/mp4/313.mp4', 'https://vd.mfitpersonal.com.br/313/jpg/md/313_md.0000000.jpg', 'Alongamento', 'Peso Corporal', 'beginner', false, null),

    -- Global rows backed by the versioned recording roster / curation artifacts.
    ('68435077-73bf-4ad9-9f10-1cf1f7fe35b8'::uuid, null::uuid, 'Flexão de Braços', 'Restaurado do roster de gravação SETT/BN; código 838, nome canônico Flexão de braço.', 'https://vd.mfitpersonal.com.br/238/mp4/238.mp4', 'https://vd.mfitpersonal.com.br/238/jpg/md/238_md.0000000.jpg', 'Peitoral', 'Peso Corporal', 'intermediate', true, 'pRzxpe5_LLk'),
    ('7a8976b1-789e-4ea7-b499-8b81ece87d25'::uuid, null::uuid, 'Agachamento Cálice', 'Restaurado do roster de gravação SETT/BN; código 432.', 'https://vd.mfitpersonal.com.br/v2/1093/mp4/1093_opt.mp4', 'https://vd.mfitpersonal.com.br/v2/1093/jpg/md/1093_md.0000001.jpg', 'Quadríceps', 'Halteres', 'intermediate', true, 'jtlT3l7jD1M'),
    ('da6ed290-59ef-49c0-a831-51ee224233bf'::uuid, null::uuid, 'Stiff Abduzido Barra', 'Restaurado do roster de gravação SETT/BN; código 074.', 'https://d2vfutiy2j6sqj.cloudfront.net/1/mp4/76nebly78c_opt.mp4', 'https://mfit-video-output.s3.us-east-1.amazonaws.com/1/jpg/md/76nebly78c_md.0000000.jpg', 'Posterior de Coxa', 'Barra', 'intermediate', true, 'GK10LP3wAsA'),
    ('3e192862-ed2e-4063-b6f9-13b433844cf8'::uuid, null::uuid, 'Agachamento Livre', 'Restaurado do roster de gravação SETT/BN; código 391.', 'https://vd.mfitpersonal.com.br/50/mp4/50.mp4', 'https://vd.mfitpersonal.com.br/50/jpg/md/50_md.0000000.jpg', 'Quadríceps', 'Peso Corporal', 'intermediate', true, 'iGLzCCZr_Xw'),
    ('d65552e0-a929-4a03-9be0-0bb86899e428'::uuid, null::uuid, 'Kettlebell swing', 'Restaurado do roster de gravação SETT/BN; código 384.', 'https://vd.mfitpersonal.com.br/713/mp4/713.mp4', 'https://vd.mfitpersonal.com.br/713/jpg/md/713_md.0000000.jpg', 'Funcional', 'Kettlebell', 'intermediate', true, 'n1df4ASFeZU')
)
insert into public.exercise_library (
  id,
  company_id,
  name,
  description,
  video_url,
  thumbnail_url,
  muscle_group,
  equipment,
  difficulty,
  is_global,
  youtube_video_id,
  updated_at
)
select
  id,
  company_id,
  name,
  description,
  video_url,
  thumbnail_url,
  muscle_group,
  equipment,
  difficulty,
  is_global,
  youtube_video_id,
  now()
from rows
on conflict (id) do update set
  company_id = excluded.company_id,
  name = excluded.name,
  description = coalesce(public.exercise_library.description, excluded.description),
  video_url = coalesce(public.exercise_library.video_url, excluded.video_url),
  thumbnail_url = coalesce(public.exercise_library.thumbnail_url, excluded.thumbnail_url),
  muscle_group = coalesce(public.exercise_library.muscle_group, excluded.muscle_group),
  equipment = coalesce(public.exercise_library.equipment, excluded.equipment),
  difficulty = coalesce(public.exercise_library.difficulty, excluded.difficulty),
  is_global = excluded.is_global,
  youtube_video_id = coalesce(public.exercise_library.youtube_video_id, excluded.youtube_video_id),
  updated_at = now();

with targets(exercise_id, muscle_group_name) as (
  values
    ('c78ec371-9f27-5abb-aa6c-a24bdd8015e7'::uuid, 'Dorsal'),
    ('bdfadd50-d76a-5dc1-8496-bae5f85db591'::uuid, 'Deltoide Anterior'),
    ('ccfae29c-c2cf-5a8e-bb0f-e8dd242a6e01'::uuid, 'Quadríceps'),
    ('627da02e-17f0-5878-84e0-263787e4ac3d'::uuid, 'Quadríceps'),
    ('7bf6dc5d-28c0-57e3-b104-5a059e2af3d0'::uuid, 'Glúteo Médio'),
    ('7bdb19e1-e88e-59d8-89f1-9a5ae09f7b4a'::uuid, 'Adutores'),
    ('68435077-73bf-4ad9-9f10-1cf1f7fe35b8'::uuid, 'Peitoral'),
    ('7a8976b1-789e-4ea7-b499-8b81ece87d25'::uuid, 'Quadríceps'),
    ('da6ed290-59ef-49c0-a831-51ee224233bf'::uuid, 'Posterior de Coxa'),
    ('3e192862-ed2e-4063-b6f9-13b433844cf8'::uuid, 'Quadríceps'),
    ('d65552e0-a929-4a03-9be0-0bb86899e428'::uuid, 'Funcional')
)
insert into public.exercise_muscle_targets (exercise_id, muscle_group_id, is_primary)
select t.exercise_id, mg.id, true
from targets t
join public.muscle_groups mg on lower(mg.name) = lower(t.muscle_group_name)
on conflict (exercise_id, muscle_group_id) do nothing;

commit;
