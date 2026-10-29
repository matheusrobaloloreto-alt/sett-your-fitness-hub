-- Synthetic dependency schema, NOT a production schema replay. Actual four RPC
-- bodies are loaded unmodified from Root's ignored metadata-only snapshot.
alter type app_role add value 'coordinator';
create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('role',coalesce(current_setting('request.jwt.claim.role',true),''))$$;
create function public.is_company_staff(actor uuid, company uuid) returns boolean language sql stable security definer as $$
 select exists(select 1 from public.company_members m join public.user_roles r on r.user_id=m.user_id where m.user_id=actor and m.company_id=company and r.role in ('admin','coordinator','trainer')) or public.has_role(actor,'master')
$$;
-- Permission helpers below are bounded stubs; original tenant/RPC branches run,
-- but permission inheritance/assignment semantics need a full-schema later gate.
create function public.can_manage_staff_student(company uuid, student uuid) returns boolean language sql stable security definer as $$
 select public.is_company_staff(auth.uid(),company) and exists(select 1 from public.students s where s.id=student and s.company_id=company)
$$;
create function public.has_staff_permission(uuid,text) returns boolean language sql stable as $$select false$$;
create function public.current_business_date() returns date language sql stable as $$select date '2026-10-27'$$;
create schema private;
create table private.training_cycle_rebase_authorizations(transaction_id bigint,enrollment_id uuid);
alter table students add assigned_trainer_id uuid, add updated_at timestamptz, add full_name text, add status text, add birth_date date, add created_at timestamptz, add sales_stage text, add fiscal_completed_at timestamptz, add payment_link_sent_at timestamptz, add activated_at timestamptz, add assessment_due_at timestamptz, add onboarding_instructions_sent_at timestamptz, add country_code text, add whatsapp text, add phone text, add email text, add address text, add city text, add state text, add cpf text, add cep text, add address_number text, add neighborhood text, add selected_plan_id uuid;
alter table enrollments add trainer_id uuid, add status text, add end_date date, add training_start_date date, add payment_status text, add plan_id uuid, add updated_at timestamptz;
alter table training_cycles add student_id uuid, add cycle_number int, add prescribed_offline_at timestamptz, add prescription_cleared_at timestamptz, add superseded_at timestamptz, add superseded_by_cycle_id uuid, add created_at timestamptz;
alter table workouts add company_id uuid, add superseded_at timestamptz;
alter table plans add name text, add plan_kind text;
alter table leads add converted_to_student_id uuid, add stage text, add updated_at timestamptz;
alter table prescription_bundles add student_id uuid, add training_cycle_id uuid, add created_at timestamptz, add status text, add has_strength boolean, add has_cardio boolean, add has_swimming boolean, add has_cycling boolean, add has_nutrition boolean, add strength_plan_id uuid, add running_plan_id uuid, add nutrition_plan_id uuid;
alter table ai_strength_plans add student_id uuid, add bundle_id uuid, add training_cycle_id uuid;
alter table running_plans add student_id uuid, add bundle_id uuid, add training_cycle_id uuid;
alter table nutrition_plans add student_id uuid, add bundle_id uuid, add training_cycle_id uuid;
alter table payments add student_id uuid, add status text, add enrollment_id uuid;
alter table functional_assessments add student_id uuid, add created_at timestamptz;
create table profiles(user_id uuid,full_name text);
create table prescription_bundle_items(bundle_id uuid,entity_id uuid,entity_type text,modality text,student_id uuid,company_id uuid);
create table cycle_feedback(id uuid,student_id uuid,company_id uuid,nps integer,wants_adjustment boolean,adjustment_notes text,created_at timestamptz,applied boolean,enrollment_id uuid,cycle_id uuid);
create table workout_sessions(company_id uuid,student_id uuid,status text,completed_at timestamptz,workout_id uuid);
create table student_body_limitations(id uuid,company_id uuid,student_id uuid,region text,severity text,created_at timestamptz);
create table admin_alerts(id uuid,company_id uuid,student_id uuid,enrollment_id uuid,target_user_id uuid,resolved_at timestamptz,created_at timestamptz,type text,severity text,title text,message text);
alter table whatsapp_chats add student_id uuid, add contact_name text, add cadence_muted boolean, add remote_jid text;
alter table whatsapp_messages add chat_id uuid, add timestamp timestamptz, add is_from_me boolean;
