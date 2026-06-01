-- Update student record with new user_id
UPDATE public.students SET user_id = 'facf65ed-2fbb-43dd-bd23-58dc4512f859' WHERE id = '3cb1cfae-4eec-4b2c-957b-b26eaa906dbe';

-- Remove old role entry and add new one
DELETE FROM public.user_roles WHERE user_id = 'cd246049-58c8-4541-9636-6ee6561d175f';
INSERT INTO public.user_roles (user_id, role) VALUES ('facf65ed-2fbb-43dd-bd23-58dc4512f859', 'student') ON CONFLICT (user_id, role) DO NOTHING;

-- Update company_members
DELETE FROM public.company_members WHERE user_id = 'cd246049-58c8-4541-9636-6ee6561d175f';
INSERT INTO public.company_members (user_id, company_id) SELECT 'facf65ed-2fbb-43dd-bd23-58dc4512f859', company_id FROM public.students WHERE id = '3cb1cfae-4eec-4b2c-957b-b26eaa906dbe' ON CONFLICT DO NOTHING;