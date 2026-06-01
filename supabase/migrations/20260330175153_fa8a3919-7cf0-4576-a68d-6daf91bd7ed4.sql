
-- 1. Create enum for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'coordinator', 'trainer', 'master', 'student');

-- 2. Companies table
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  tier text NOT NULL DEFAULT 'basic',
  owner_id uuid REFERENCES auth.users(id),
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text DEFAULT 'inactive',
  max_students integer DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Company members
CREATE TABLE public.company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

-- 4. User roles (separate table)
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

-- 5. Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name text DEFAULT '',
  avatar_url text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Plans
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric DEFAULT 0,
  duration_days integer DEFAULT 30,
  cycle_duration_days integer DEFAULT 30,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Student categories
CREATE TABLE public.student_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text DEFAULT '#3B82F6',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Students
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  cpf text,
  birth_date date,
  gender text,
  address text,
  city text,
  state text,
  zip_code text,
  emergency_contact text,
  emergency_phone text,
  notes text,
  status text DEFAULT 'pending',
  category_id uuid REFERENCES public.student_categories(id) ON DELETE SET NULL,
  assigned_trainer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  photo_url text,
  asaas_customer_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 9. Enrollments
CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  trainer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text DEFAULT 'active',
  start_date date DEFAULT CURRENT_DATE,
  end_date date,
  training_start_date date,
  cycle_duration_days integer DEFAULT 30,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 10. Training cycles
CREATE TABLE public.training_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid REFERENCES public.enrollments(id) ON DELETE CASCADE NOT NULL,
  cycle_number integer NOT NULL DEFAULT 1,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 11. Workouts
CREATE TABLE public.workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid REFERENCES public.training_cycles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL DEFAULT 'Treino',
  day_of_week integer,
  exercises jsonb DEFAULT '[]'::jsonb,
  notes text,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 12. Workout logs
CREATE TABLE public.workout_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id uuid REFERENCES public.workouts(id) ON DELETE CASCADE NOT NULL,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  completed_at timestamptz DEFAULT now(),
  duration_minutes integer,
  notes text,
  exercises_data jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 13. Muscle groups
CREATE TABLE public.muscle_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 14. Exercise library
CREATE TABLE public.exercise_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  video_url text,
  thumbnail_url text,
  muscle_group_id uuid REFERENCES public.muscle_groups(id) ON DELETE SET NULL,
  equipment text,
  difficulty text DEFAULT 'intermediate',
  is_global boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 15. Exercise muscle targets
CREATE TABLE public.exercise_muscle_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id uuid REFERENCES public.exercise_library(id) ON DELETE CASCADE NOT NULL,
  muscle_group_id uuid REFERENCES public.muscle_groups(id) ON DELETE CASCADE NOT NULL,
  is_primary boolean DEFAULT true,
  UNIQUE(exercise_id, muscle_group_id)
);

-- 16. Anamnesis
CREATE TABLE public.anamnesis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  data jsonb DEFAULT '{}'::jsonb,
  submitted_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 17. Form fields
CREATE TABLE public.form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  form_type text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  field_key text,
  options jsonb DEFAULT '[]'::jsonb,
  is_required boolean DEFAULT false,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 18. Student evaluations
CREATE TABLE public.student_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  evaluator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  evaluation_date date DEFAULT CURRENT_DATE,
  weight numeric,
  height numeric,
  body_fat_percentage numeric,
  notes text,
  photos jsonb DEFAULT '[]'::jsonb,
  measurements jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 19. Payments
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  enrollment_id uuid REFERENCES public.enrollments(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  status text DEFAULT 'pending',
  payment_method text,
  due_date date,
  paid_at timestamptz,
  asaas_payment_id text,
  asaas_invoice_url text,
  asaas_pix_qr_code text,
  asaas_pix_payload text,
  asaas_boleto_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 20. Platform settings
CREATE TABLE public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  primary_color text DEFAULT '#1d4ed8',
  background_color text DEFAULT '#121212',
  card_color text DEFAULT '#1a1a1a',
  text_color text DEFAULT '#ebebeb',
  platform_title text DEFAULT 'SET TRAINING',
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 21. Role permissions
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL,
  module text NOT NULL,
  enabled boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, role, module)
);

-- 22. Message templates
CREATE TABLE public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  content text NOT NULL,
  category text,
  variables jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 23. WhatsApp instances
CREATE TABLE public.whatsapp_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  instance_name text NOT NULL,
  instance_id text,
  status text DEFAULT 'disconnected',
  phone_number text,
  qr_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 24. WhatsApp labels
CREATE TABLE public.whatsapp_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#3B82F6',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 25. WhatsApp chats
CREATE TABLE public.whatsapp_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  remote_jid text NOT NULL,
  contact_name text,
  contact_photo text,
  last_message text,
  last_message_at timestamptz,
  unread_count integer DEFAULT 0,
  is_archived boolean DEFAULT false,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 26. WhatsApp messages
CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid REFERENCES public.whatsapp_chats(id) ON DELETE CASCADE NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  message_id text,
  content text,
  media_url text,
  media_type text,
  is_from_me boolean DEFAULT false,
  status text DEFAULT 'sent',
  timestamp timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 27. WhatsApp chat labels
CREATE TABLE public.whatsapp_chat_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid REFERENCES public.whatsapp_chats(id) ON DELETE CASCADE NOT NULL,
  label_id uuid REFERENCES public.whatsapp_labels(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(chat_id, label_id)
);

-- 28. Automation flows
CREATE TABLE public.automation_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL DEFAULT 'keyword',
  trigger_value text,
  is_active boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 29. Automation flow nodes
CREATE TABLE public.automation_flow_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid REFERENCES public.automation_flows(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL,
  label text,
  position_x numeric DEFAULT 0,
  position_y numeric DEFAULT 0,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 30. Automation flow edges
CREATE TABLE public.automation_flow_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid REFERENCES public.automation_flows(id) ON DELETE CASCADE NOT NULL,
  source_node_id text NOT NULL,
  target_node_id text NOT NULL,
  source_handle text,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 31. Automation flow steps (legacy)
CREATE TABLE public.automation_flow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid REFERENCES public.automation_flows(id) ON DELETE CASCADE NOT NULL,
  step_order integer DEFAULT 0,
  action_type text NOT NULL,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 32. Flow sessions
CREATE TABLE public.flow_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid REFERENCES public.automation_flows(id) ON DELETE CASCADE NOT NULL,
  chat_id uuid REFERENCES public.whatsapp_chats(id) ON DELETE CASCADE,
  current_node_id text,
  status text DEFAULT 'active',
  context jsonb DEFAULT '{}'::jsonb,
  started_at timestamptz DEFAULT now(),
  last_activity_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- FUNCTIONS

-- Verify role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Get primary role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id
  ORDER BY CASE role WHEN 'master' THEN 1 WHEN 'admin' THEN 2 WHEN 'coordinator' THEN 3 WHEN 'trainer' THEN 4 WHEN 'student' THEN 5 END
  LIMIT 1
$$;

-- Get user company_id
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.company_members WHERE user_id = _user_id LIMIT 1
$$;

-- Auto-create profile on new user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply updated_at triggers
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_enrollments_updated_at BEFORE UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_workouts_updated_at BEFORE UPDATE ON public.workouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_exercise_library_updated_at BEFORE UPDATE ON public.exercise_library FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_student_evaluations_updated_at BEFORE UPDATE ON public.student_evaluations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_platform_settings_updated_at BEFORE UPDATE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_message_templates_updated_at BEFORE UPDATE ON public.message_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_whatsapp_instances_updated_at BEFORE UPDATE ON public.whatsapp_instances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_whatsapp_chats_updated_at BEFORE UPDATE ON public.whatsapp_chats FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_automation_flows_updated_at BEFORE UPDATE ON public.automation_flows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Set enrollment company_id from student
CREATE OR REPLACE FUNCTION public.set_enrollment_company_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.students WHERE id = NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_enrollment_company_id_trigger
  BEFORE INSERT ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_enrollment_company_id();

-- Generate training cycles
CREATE OR REPLACE FUNCTION public.generate_training_cycles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start date;
  v_end date;
  v_cycle_days integer;
  v_plan_days integer;
  v_cycle_num integer := 1;
  v_cycle_start date;
  v_cycle_end date;
BEGIN
  IF NEW.training_start_date IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Only generate if training_start_date changed or is new
  IF TG_OP = 'UPDATE' AND OLD.training_start_date = NEW.training_start_date THEN
    RETURN NEW;
  END IF;

  v_start := NEW.training_start_date;
  v_cycle_days := COALESCE(NEW.cycle_duration_days, 30);
  
  -- Get plan duration
  IF NEW.plan_id IS NOT NULL THEN
    SELECT duration_days INTO v_plan_days FROM public.plans WHERE id = NEW.plan_id;
  END IF;
  v_plan_days := COALESCE(v_plan_days, 90);
  
  v_end := v_start + v_plan_days - 1;
  IF NEW.end_date IS NOT NULL THEN
    v_end := NEW.end_date;
  END IF;

  -- Delete existing cycles for this enrollment
  DELETE FROM public.training_cycles WHERE enrollment_id = NEW.id;

  -- Generate cycles
  v_cycle_start := v_start;
  WHILE v_cycle_start <= v_end LOOP
    v_cycle_end := v_cycle_start + v_cycle_days - 1;
    IF v_cycle_end > v_end THEN
      v_cycle_end := v_end;
    END IF;
    
    INSERT INTO public.training_cycles (enrollment_id, cycle_number, start_date, end_date, status)
    VALUES (NEW.id, v_cycle_num, v_cycle_start, v_cycle_end, 
            CASE WHEN v_cycle_num = 1 THEN 'active' ELSE 'pending' END);
    
    v_cycle_num := v_cycle_num + 1;
    v_cycle_start := v_cycle_end + 1;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER generate_training_cycles_trigger
  AFTER INSERT OR UPDATE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.generate_training_cycles();

-- Recalculate training cycles
CREATE OR REPLACE FUNCTION public.recalculate_training_cycles(p_enrollment_id uuid, p_new_start_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.enrollments SET training_start_date = p_new_start_date WHERE id = p_enrollment_id;
END;
$$;

-- RLS POLICIES

-- Enable RLS on all tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_muscle_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.muscle_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anamnesis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_chat_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_flow_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_flow_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_flow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_sessions ENABLE ROW LEVEL SECURITY;

-- Master: full access to everything
CREATE POLICY "Master full access" ON public.companies FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.company_members FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.plans FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.students FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.enrollments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.training_cycles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.workouts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.workout_logs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.exercise_library FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.exercise_muscle_targets FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.muscle_groups FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.anamnesis FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.form_fields FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.student_categories FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.student_evaluations FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.payments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.platform_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.role_permissions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.message_templates FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.whatsapp_instances FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.whatsapp_chats FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.whatsapp_messages FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.whatsapp_labels FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.whatsapp_chat_labels FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.automation_flows FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.automation_flow_nodes FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.automation_flow_edges FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.automation_flow_steps FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master full access" ON public.flow_sessions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master')) WITH CHECK (public.has_role(auth.uid(), 'master'));

-- Company-scoped access for admin/coordinator/trainer
CREATE POLICY "Company members access" ON public.companies FOR SELECT TO authenticated USING (id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Company members access" ON public.company_members FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Company-scoped read for admin/coordinator/trainer
CREATE POLICY "Company scoped select" ON public.plans FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Company scoped select" ON public.students FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Company scoped select" ON public.enrollments FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Company scoped select" ON public.student_categories FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Company scoped select" ON public.student_evaluations FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Company scoped select" ON public.payments FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Company scoped select" ON public.platform_settings FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()) OR company_id IS NULL);
CREATE POLICY "Company scoped select" ON public.role_permissions FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Company scoped select" ON public.message_templates FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Company scoped select" ON public.whatsapp_instances FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Company scoped select" ON public.whatsapp_chats FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Company scoped select" ON public.whatsapp_messages FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Company scoped select" ON public.whatsapp_labels FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Company scoped select" ON public.automation_flows FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Company scoped select" ON public.anamnesis FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Company scoped select" ON public.form_fields FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()) OR company_id IS NULL);

-- Admin can insert/update/delete within company
CREATE POLICY "Admin company insert" ON public.plans FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company update" ON public.plans FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company delete" ON public.plans FOR DELETE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admin company insert" ON public.students FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company update" ON public.students FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company delete" ON public.students FOR DELETE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admin company insert" ON public.enrollments FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company update" ON public.enrollments FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company delete" ON public.enrollments FOR DELETE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admin company insert" ON public.student_categories FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company update" ON public.student_categories FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company delete" ON public.student_categories FOR DELETE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admin company insert" ON public.student_evaluations FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company update" ON public.student_evaluations FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company delete" ON public.student_evaluations FOR DELETE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admin company insert" ON public.payments FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company update" ON public.payments FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admin company insert" ON public.platform_settings FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company update" ON public.platform_settings FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admin company insert" ON public.role_permissions FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company update" ON public.role_permissions FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admin company insert" ON public.message_templates FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company update" ON public.message_templates FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company delete" ON public.message_templates FOR DELETE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admin company insert" ON public.whatsapp_instances FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company update" ON public.whatsapp_instances FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admin company insert" ON public.whatsapp_chats FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company update" ON public.whatsapp_chats FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admin company insert" ON public.whatsapp_messages FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admin company insert" ON public.whatsapp_labels FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company update" ON public.whatsapp_labels FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company delete" ON public.whatsapp_labels FOR DELETE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admin company insert" ON public.automation_flows FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company update" ON public.automation_flows FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company delete" ON public.automation_flows FOR DELETE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admin company insert" ON public.form_fields FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company update" ON public.form_fields FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()) OR company_id IS NULL);
CREATE POLICY "Admin company delete" ON public.form_fields FOR DELETE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()) OR company_id IS NULL);

CREATE POLICY "Admin company insert" ON public.anamnesis FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

-- Training cycles / workouts / logs - via enrollment company
CREATE POLICY "Company scoped select" ON public.training_cycles FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.enrollments e WHERE e.id = enrollment_id AND e.company_id = public.get_user_company_id(auth.uid()))
);
CREATE POLICY "Company scoped select" ON public.workouts FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.training_cycles tc JOIN public.enrollments e ON e.id = tc.enrollment_id WHERE tc.id = cycle_id AND e.company_id = public.get_user_company_id(auth.uid()))
);
CREATE POLICY "Admin company insert" ON public.workouts FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.training_cycles tc JOIN public.enrollments e ON e.id = tc.enrollment_id WHERE tc.id = cycle_id AND e.company_id = public.get_user_company_id(auth.uid()))
);
CREATE POLICY "Admin company update" ON public.workouts FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.training_cycles tc JOIN public.enrollments e ON e.id = tc.enrollment_id WHERE tc.id = cycle_id AND e.company_id = public.get_user_company_id(auth.uid()))
);
CREATE POLICY "Admin company delete" ON public.workouts FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.training_cycles tc JOIN public.enrollments e ON e.id = tc.enrollment_id WHERE tc.id = cycle_id AND e.company_id = public.get_user_company_id(auth.uid()))
);

CREATE POLICY "Company scoped select" ON public.workout_logs FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.company_id = public.get_user_company_id(auth.uid()))
);
CREATE POLICY "Admin company insert" ON public.workout_logs FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.company_id = public.get_user_company_id(auth.uid()))
);

-- Exercise library: global or company-scoped
CREATE POLICY "Company scoped select" ON public.exercise_library FOR SELECT TO authenticated USING (is_global = true OR company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin company insert" ON public.exercise_library FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id(auth.uid()) OR is_global = true);
CREATE POLICY "Admin company update" ON public.exercise_library FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()) OR is_global = true);
CREATE POLICY "Admin company delete" ON public.exercise_library FOR DELETE TO authenticated USING (company_id = public.get_user_company_id(auth.uid()) OR is_global = true);

CREATE POLICY "Select muscle groups" ON public.muscle_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Select exercise targets" ON public.exercise_muscle_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert exercise targets" ON public.exercise_muscle_targets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Delete exercise targets" ON public.exercise_muscle_targets FOR DELETE TO authenticated USING (true);

-- Chat labels junction
CREATE POLICY "Company scoped select" ON public.whatsapp_chat_labels FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.whatsapp_chats c WHERE c.id = chat_id AND c.company_id = public.get_user_company_id(auth.uid()))
);
CREATE POLICY "Admin company insert" ON public.whatsapp_chat_labels FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.whatsapp_chats c WHERE c.id = chat_id AND c.company_id = public.get_user_company_id(auth.uid()))
);
CREATE POLICY "Admin company delete" ON public.whatsapp_chat_labels FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.whatsapp_chats c WHERE c.id = chat_id AND c.company_id = public.get_user_company_id(auth.uid()))
);

-- Automation nodes/edges/steps/sessions
CREATE POLICY "Company scoped select" ON public.automation_flow_nodes FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND f.company_id = public.get_user_company_id(auth.uid()))
);
CREATE POLICY "Admin company insert" ON public.automation_flow_nodes FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND f.company_id = public.get_user_company_id(auth.uid()))
);
CREATE POLICY "Admin company update" ON public.automation_flow_nodes FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND f.company_id = public.get_user_company_id(auth.uid()))
);
CREATE POLICY "Admin company delete" ON public.automation_flow_nodes FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND f.company_id = public.get_user_company_id(auth.uid()))
);

CREATE POLICY "Company scoped select" ON public.automation_flow_edges FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND f.company_id = public.get_user_company_id(auth.uid()))
);
CREATE POLICY "Admin company insert" ON public.automation_flow_edges FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND f.company_id = public.get_user_company_id(auth.uid()))
);
CREATE POLICY "Admin company delete" ON public.automation_flow_edges FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND f.company_id = public.get_user_company_id(auth.uid()))
);

CREATE POLICY "Company scoped select" ON public.automation_flow_steps FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND f.company_id = public.get_user_company_id(auth.uid()))
);

CREATE POLICY "Company scoped select" ON public.flow_sessions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND f.company_id = public.get_user_company_id(auth.uid()))
);

-- Anon access for public forms
CREATE POLICY "Anon can read form fields" ON public.form_fields FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "Anon can read plans" ON public.plans FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "Anon can insert students" ON public.students FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can read students" ON public.students FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert anamnesis" ON public.anamnesis FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can read platform settings" ON public.platform_settings FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can read companies" ON public.companies FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can read enrollments" ON public.enrollments FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert payments" ON public.payments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can read payments" ON public.payments FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can update students" ON public.students FOR UPDATE TO anon USING (true);

-- Student access to own data
CREATE POLICY "Student reads own data" ON public.students FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Student reads own enrollments" ON public.enrollments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid())
);

-- Profiles readable by company members
CREATE POLICY "Company profiles readable" ON public.profiles FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = profiles.user_id AND cm.company_id = public.get_user_company_id(auth.uid()))
);

-- Enable realtime for chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_chats;

-- Seed muscle groups
INSERT INTO public.muscle_groups (name) VALUES
  ('Peito'), ('Costas'), ('Ombros'), ('Bíceps'), ('Tríceps'),
  ('Antebraço'), ('Abdômen'), ('Quadríceps'), ('Posterior de Coxa'),
  ('Glúteos'), ('Panturrilha'), ('Trapézio'), ('Lombar');
