
-- More missing columns from the frontend code

-- Anamnesis: more structured fields
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS training_location text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS available_equipment text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS diseases text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS current_pain text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS medical_release text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS supplement_use text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS diet_type text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS daily_meals text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS hydration text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS commits_communication boolean DEFAULT false;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Workouts: title and description aliases
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- WhatsApp messages: additional fields
ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS sender_id text;
ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS message_id_external text;

-- Message templates: title and shortcut
ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS shortcut text;

-- Student categories: sort_order
ALTER TABLE public.student_categories ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- WhatsApp chats: category
ALTER TABLE public.whatsapp_chats ADD COLUMN IF NOT EXISTS category text;

-- Student evaluations: file_url
ALTER TABLE public.student_evaluations ADD COLUMN IF NOT EXISTS file_url text;

-- Companies: owner_user_id alias
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id);
