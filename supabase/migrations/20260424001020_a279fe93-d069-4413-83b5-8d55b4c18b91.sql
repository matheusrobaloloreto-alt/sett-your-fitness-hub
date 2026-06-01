
-- 1. Backfill muscle_group nos 3 workouts do Syer
-- Treino A: Supino Reto Barra (Peitoral), Elevação Lateral Halteres (Deltoides), Rosca Direta (Bíceps)
UPDATE public.workouts
SET exercises = jsonb_build_array(
  jsonb_set(exercises->0, '{muscle_group}', '"Peitoral"'),
  jsonb_set(exercises->1, '{muscle_group}', '"Deltoides"'),
  jsonb_set(exercises->2, '{muscle_group}', '"Bíceps"')
)
WHERE id = 'e5557721-cd5b-4f0f-990f-8f696f10fd66';

-- Treino B: Puxada Frontal (Costas), Levantamento Terra (Costas)
UPDATE public.workouts
SET exercises = jsonb_build_array(
  jsonb_set(exercises->0, '{muscle_group}', '"Costas"'),
  jsonb_set(exercises->1, '{muscle_group}', '"Costas"')
)
WHERE id = 'f58f84bc-ce01-4fdd-abb2-3f22b4893ea1';

-- Treino C: Agachamento Livre (Quadríceps), Leg Press 45 (Quadríceps)
UPDATE public.workouts
SET exercises = jsonb_build_array(
  jsonb_set(exercises->0, '{muscle_group}', '"Quadríceps"'),
  jsonb_set(exercises->1, '{muscle_group}', '"Quadríceps"')
)
WHERE id = '8738a6d6-28f6-495d-bd8c-1152c1d3b1e8';

-- 2. Remover Syer duplicado (o sem dados)
DELETE FROM public.enrollments WHERE student_id = 'b7f23db8-d114-457e-b6e1-9c7915274b60';
DELETE FROM public.students WHERE id = 'b7f23db8-d114-457e-b6e1-9c7915274b60';
