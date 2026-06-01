-- Remove ciclo 2 espúrio da Amanda (1 dia só)
DELETE FROM training_cycles
WHERE enrollment_id = '225637a1-2133-44e1-9ac7-5cfb89d8dfd9' AND cycle_number = 2;

-- Corrige end_date da matrícula para ser inclusivo
UPDATE enrollments SET end_date = '2026-04-13'
WHERE id = '225637a1-2133-44e1-9ac7-5cfb89d8dfd9';