-- Assign master role
INSERT INTO public.user_roles (user_id, role)
VALUES ('0b09ea5a-8e81-4698-9d42-f9d6837d7b6c', 'master')
ON CONFLICT (user_id, role) DO NOTHING;

-- Ensure profile exists
INSERT INTO public.profiles (user_id, full_name)
VALUES ('0b09ea5a-8e81-4698-9d42-f9d6837d7b6c', 'Syer Rodrigues')
ON CONFLICT (user_id) DO NOTHING;