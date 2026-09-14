-- SETT/BN data repair - 2026-09-14
-- Restores the 11 library rows referenced by cycle
-- be282d1b-6d73-407f-b67c-5086337c9022 and applies the canonical
-- exercise taxonomy. Categories are filters; only anatomical targets
-- contribute to weekly volume (primary=100%, secondary=50%).
--
-- Data-only and idempotent. Does not modify workouts, students,
-- enrollments, payments, auth, or secrets.

begin;

with rows(
  id, company_id, name, description, video_url, thumbnail_url,
  muscle_group, equipment, difficulty, is_global, youtube_video_id,
  category, categories
) as (
  values
    ('c78ec371-9f27-5abb-aa6c-a24bdd8015e7'::uuid, 'dad65c62-e700-4ae9-930a-43b18357c171'::uuid, 'Barra Fixa (Pegada Aberta)', 'Restaurado do item importado do ciclo be282d1b-6d73-407f-b67c-5086337c9022.', 'https://vd.mfitpersonal.com.br/543/mp4/543.mp4', 'https://vd.mfitpersonal.com.br/543/jpg/md/543_md.0000000.jpg', 'Dorsal', 'Barra Fixa', 'advanced', false, null::text, 'base', array['base','peso_corporal']::text[]),
    ('bdfadd50-d76a-5dc1-8496-bae5f85db591'::uuid, 'dad65c62-e700-4ae9-930a-43b18357c171'::uuid, 'Desenvolvimento Barra Reta', 'Restaurado do item importado do ciclo be282d1b-6d73-407f-b67c-5086337c9022.', 'https://vd.mfitpersonal.com.br/152/mp4/152.mp4', 'https://vd.mfitpersonal.com.br/152/jpg/md/152_md.0000000.jpg', 'Deltoide Anterior', 'Barra', 'intermediate', false, null::text, 'base', array['base','pesos_livre']::text[]),
    ('ccfae29c-c2cf-5a8e-bb0f-e8dd242a6e01'::uuid, 'dad65c62-e700-4ae9-930a-43b18357c171'::uuid, 'Agachamento com Desenvolvimento (Halter no Chão)', 'Restaurado do item importado do ciclo be282d1b-6d73-407f-b67c-5086337c9022.', 'https://vd.mfitpersonal.com.br/v2/1088/mp4/1088_opt.mp4', 'https://vd.mfitpersonal.com.br/v2/1088/jpg/md/1088_md.0000001.jpg', 'Quadríceps', 'Halteres', 'intermediate', false, null::text, 'funcionais', array['funcionais','base','pesos_livre']::text[]),
    ('627da02e-17f0-5878-84e0-263787e4ac3d'::uuid, 'dad65c62-e700-4ae9-930a-43b18357c171'::uuid, 'Agachamento Sumô com Salto', 'Restaurado do item importado do ciclo be282d1b-6d73-407f-b67c-5086337c9022.', 'https://vd.mfitpersonal.com.br/802/mp4/802.mp4', 'https://vd.mfitpersonal.com.br/802/jpg/md/802_md.0000000.jpg', 'Quadríceps', 'Peso Corporal', 'intermediate', false, null::text, 'base', array['base','pliometria','peso_corporal']::text[]),
    ('7bf6dc5d-28c0-57e3-b104-5a059e2af3d0'::uuid, 'dad65c62-e700-4ae9-930a-43b18357c171'::uuid, 'Alongamento de Abdutor I', 'Restaurado do item importado do ciclo be282d1b-6d73-407f-b67c-5086337c9022.', 'https://vd.mfitpersonal.com.br/748/mp4/748.mp4', 'https://vd.mfitpersonal.com.br/748/jpg/md/748_md.0000000.jpg', null::text, 'Peso Corporal', 'beginner', false, null::text, 'mobilidades', array['mobilidades']::text[]),
    ('7bdb19e1-e88e-59d8-89f1-9a5ae09f7b4a'::uuid, 'dad65c62-e700-4ae9-930a-43b18357c171'::uuid, 'Alongamento de Adutores I', 'Restaurado do item importado do ciclo be282d1b-6d73-407f-b67c-5086337c9022.', 'https://vd.mfitpersonal.com.br/313/mp4/313.mp4', 'https://vd.mfitpersonal.com.br/313/jpg/md/313_md.0000000.jpg', null::text, 'Peso Corporal', 'beginner', false, null::text, 'mobilidades', array['mobilidades']::text[]),
    ('68435077-73bf-4ad9-9f10-1cf1f7fe35b8'::uuid, null::uuid, 'Flexão de Braços', 'Restaurado do roster de gravação SETT/BN; código 838, nome canônico Flexão de braço.', 'https://vd.mfitpersonal.com.br/238/mp4/238.mp4', 'https://vd.mfitpersonal.com.br/238/jpg/md/238_md.0000000.jpg', 'Peitoral', 'Peso Corporal', 'intermediate', true, 'pRzxpe5_LLk', 'base', array['base','peso_corporal']::text[]),
    ('7a8976b1-789e-4ea7-b499-8b81ece87d25'::uuid, null::uuid, 'Agachamento Cálice', 'Restaurado do roster de gravação SETT/BN; código 432.', 'https://vd.mfitpersonal.com.br/v2/1093/mp4/1093_opt.mp4', 'https://vd.mfitpersonal.com.br/v2/1093/jpg/md/1093_md.0000001.jpg', 'Quadríceps', 'Halteres', 'intermediate', true, 'jtlT3l7jD1M', 'base', array['base','pesos_livre']::text[]),
    ('da6ed290-59ef-49c0-a831-51ee224233bf'::uuid, null::uuid, 'Stiff Abduzido Barra', 'Restaurado do roster de gravação SETT/BN; código 074.', 'https://d2vfutiy2j6sqj.cloudfront.net/1/mp4/76nebly78c_opt.mp4', 'https://mfit-video-output.s3.us-east-1.amazonaws.com/1/jpg/md/76nebly78c_md.0000000.jpg', 'Posterior de Coxa', 'Barra', 'intermediate', true, 'GK10LP3wAsA', 'base', array['base','pesos_livre']::text[]),
    ('3e192862-ed2e-4063-b6f9-13b433844cf8'::uuid, null::uuid, 'Agachamento Livre', 'Restaurado do roster de gravação SETT/BN; código 391.', 'https://vd.mfitpersonal.com.br/50/mp4/50.mp4', 'https://vd.mfitpersonal.com.br/50/jpg/md/50_md.0000000.jpg', 'Quadríceps', 'Peso Corporal', 'intermediate', true, 'iGLzCCZr_Xw', 'base', array['base','peso_corporal']::text[]),
    ('d65552e0-a929-4a03-9be0-0bb86899e428'::uuid, null::uuid, 'Kettlebell swing', 'Restaurado do roster de gravação SETT/BN; código 384.', 'https://vd.mfitpersonal.com.br/713/mp4/713.mp4', 'https://vd.mfitpersonal.com.br/713/jpg/md/713_md.0000000.jpg', 'Glúteo', 'Kettlebell', 'intermediate', true, 'n1df4ASFeZU', 'funcionais', array['funcionais','pesos_livre']::text[])
)
insert into public.exercise_library (
  id, company_id, name, description, video_url, thumbnail_url,
  muscle_group, equipment, difficulty, is_global, youtube_video_id,
  category, categories, updated_at
)
select
  id, company_id, name, description, video_url, thumbnail_url,
  muscle_group, equipment, difficulty, is_global, youtube_video_id,
  category, categories, now()
from rows
on conflict (id) do update set
  company_id = excluded.company_id,
  name = excluded.name,
  description = coalesce(public.exercise_library.description, excluded.description),
  video_url = coalesce(public.exercise_library.video_url, excluded.video_url),
  thumbnail_url = coalesce(public.exercise_library.thumbnail_url, excluded.thumbnail_url),
  muscle_group = excluded.muscle_group,
  equipment = coalesce(public.exercise_library.equipment, excluded.equipment),
  difficulty = coalesce(public.exercise_library.difficulty, excluded.difficulty),
  is_global = excluded.is_global,
  youtube_video_id = coalesce(public.exercise_library.youtube_video_id, excluded.youtube_video_id),
  category = excluded.category,
  categories = excluded.categories,
  updated_at = now();

delete from public.exercise_muscle_targets
where exercise_id in (
  'c78ec371-9f27-5abb-aa6c-a24bdd8015e7',
  'bdfadd50-d76a-5dc1-8496-bae5f85db591',
  'ccfae29c-c2cf-5a8e-bb0f-e8dd242a6e01',
  '627da02e-17f0-5878-84e0-263787e4ac3d',
  '7bf6dc5d-28c0-57e3-b104-5a059e2af3d0',
  '7bdb19e1-e88e-59d8-89f1-9a5ae09f7b4a',
  '68435077-73bf-4ad9-9f10-1cf1f7fe35b8',
  '7a8976b1-789e-4ea7-b499-8b81ece87d25',
  'da6ed290-59ef-49c0-a831-51ee224233bf',
  '3e192862-ed2e-4063-b6f9-13b433844cf8',
  'd65552e0-a929-4a03-9be0-0bb86899e428'
);

with targets(exercise_id, muscle_group_name, role, is_primary, volume_percentage) as (
  values
    ('c78ec371-9f27-5abb-aa6c-a24bdd8015e7'::uuid, 'Dorsal', 'primary', true, 100),
    ('c78ec371-9f27-5abb-aa6c-a24bdd8015e7'::uuid, 'Bíceps', 'secondary', false, 50),
    ('c78ec371-9f27-5abb-aa6c-a24bdd8015e7'::uuid, 'Trapézio', 'secondary', false, 50),
    ('bdfadd50-d76a-5dc1-8496-bae5f85db591'::uuid, 'Deltoide Anterior', 'primary', true, 100),
    ('bdfadd50-d76a-5dc1-8496-bae5f85db591'::uuid, 'Tríceps', 'secondary', false, 50),
    ('bdfadd50-d76a-5dc1-8496-bae5f85db591'::uuid, 'Deltoide Lateral', 'secondary', false, 50),
    ('ccfae29c-c2cf-5a8e-bb0f-e8dd242a6e01'::uuid, 'Quadríceps', 'primary', true, 100),
    ('ccfae29c-c2cf-5a8e-bb0f-e8dd242a6e01'::uuid, 'Deltoide Anterior', 'primary', true, 100),
    ('ccfae29c-c2cf-5a8e-bb0f-e8dd242a6e01'::uuid, 'Glúteo', 'secondary', false, 50),
    ('ccfae29c-c2cf-5a8e-bb0f-e8dd242a6e01'::uuid, 'Tríceps', 'secondary', false, 50),
    ('627da02e-17f0-5878-84e0-263787e4ac3d'::uuid, 'Quadríceps', 'primary', true, 100),
    ('627da02e-17f0-5878-84e0-263787e4ac3d'::uuid, 'Glúteo', 'secondary', false, 50),
    ('627da02e-17f0-5878-84e0-263787e4ac3d'::uuid, 'Adutores', 'secondary', false, 50),
    ('68435077-73bf-4ad9-9f10-1cf1f7fe35b8'::uuid, 'Peitoral', 'primary', true, 100),
    ('68435077-73bf-4ad9-9f10-1cf1f7fe35b8'::uuid, 'Tríceps', 'secondary', false, 50),
    ('68435077-73bf-4ad9-9f10-1cf1f7fe35b8'::uuid, 'Deltoide Anterior', 'secondary', false, 50),
    ('7a8976b1-789e-4ea7-b499-8b81ece87d25'::uuid, 'Quadríceps', 'primary', true, 100),
    ('7a8976b1-789e-4ea7-b499-8b81ece87d25'::uuid, 'Glúteo', 'secondary', false, 50),
    ('da6ed290-59ef-49c0-a831-51ee224233bf'::uuid, 'Posterior de Coxa', 'primary', true, 100),
    ('da6ed290-59ef-49c0-a831-51ee224233bf'::uuid, 'Glúteo', 'secondary', false, 50),
    ('da6ed290-59ef-49c0-a831-51ee224233bf'::uuid, 'Adutores', 'secondary', false, 50),
    ('3e192862-ed2e-4063-b6f9-13b433844cf8'::uuid, 'Quadríceps', 'primary', true, 100),
    ('3e192862-ed2e-4063-b6f9-13b433844cf8'::uuid, 'Glúteo', 'secondary', false, 50),
    ('d65552e0-a929-4a03-9be0-0bb86899e428'::uuid, 'Glúteo', 'primary', true, 100),
    ('d65552e0-a929-4a03-9be0-0bb86899e428'::uuid, 'Posterior de Coxa', 'secondary', false, 50),
    ('d65552e0-a929-4a03-9be0-0bb86899e428'::uuid, 'Abdominais', 'secondary', false, 50)
)
insert into public.exercise_muscle_targets (
  exercise_id, muscle_group_id, role, is_primary, volume_percentage
)
select t.exercise_id, mg.id, t.role, t.is_primary, t.volume_percentage
from targets t
join public.muscle_groups mg on lower(mg.name) = lower(t.muscle_group_name);

commit;
