
-- 1. EXTERNAL ACTIVITIES
CREATE TABLE public.external_activities (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  company_id uuid not null,
  activity_type text not null,
  activity_date date not null default current_date,
  duration_minutes integer,
  distance_km numeric,
  intensity smallint check (intensity between 1 and 5),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE INDEX idx_external_activities_student_date ON public.external_activities(student_id, activity_date DESC);
CREATE INDEX idx_external_activities_company ON public.external_activities(company_id);

ALTER TABLE public.external_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company scoped select" ON public.external_activities FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Master full access" ON public.external_activities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'master')) WITH CHECK (public.has_role(auth.uid(),'master'));

CREATE POLICY "Student reads own activities" ON public.external_activities FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = external_activities.student_id AND s.user_id = auth.uid()));

CREATE POLICY "Student inserts own activities" ON public.external_activities FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.students s WHERE s.id = external_activities.student_id AND s.user_id = auth.uid()));

CREATE POLICY "Student updates own activities" ON public.external_activities FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = external_activities.student_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.students s WHERE s.id = external_activities.student_id AND s.user_id = auth.uid()));

CREATE POLICY "Student deletes own activities" ON public.external_activities FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = external_activities.student_id AND s.user_id = auth.uid()));

CREATE POLICY "Company members insert" ON public.external_activities FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Company members update" ON public.external_activities FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid())) WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Company members delete" ON public.external_activities FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE TRIGGER trg_external_activities_updated
  BEFORE UPDATE ON public.external_activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-set company_id if missing
CREATE OR REPLACE FUNCTION public.set_external_activity_company_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.students WHERE id = NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_external_activities_company
  BEFORE INSERT ON public.external_activities
  FOR EACH ROW EXECUTE FUNCTION public.set_external_activity_company_id();

-- 2. ANNOUNCEMENTS
CREATE TABLE public.announcements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  author_id uuid,
  title text not null,
  body text not null,
  image_url text,
  pinned boolean not null default false,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE INDEX idx_announcements_company_published ON public.announcements(company_id, pinned DESC, published_at DESC);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company scoped select" ON public.announcements FOR SELECT TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.user_id = auth.uid() AND s.company_id = announcements.company_id)
  );

CREATE POLICY "Master full access" ON public.announcements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'master')) WITH CHECK (public.has_role(auth.uid(),'master'));

CREATE POLICY "Admin company insert" ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'coordinator'))
  );

CREATE POLICY "Admin company update" ON public.announcements FOR UPDATE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'coordinator'))
  );

CREATE POLICY "Admin company delete" ON public.announcements FOR DELETE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'coordinator'))
  );

CREATE TRIGGER trg_announcements_updated
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. ANNOUNCEMENT READS
CREATE TABLE public.announcement_reads (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  read_at timestamptz not null default now(),
  UNIQUE(announcement_id, student_id)
);

CREATE INDEX idx_announcement_reads_student ON public.announcement_reads(student_id);

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master full access" ON public.announcement_reads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'master')) WITH CHECK (public.has_role(auth.uid(),'master'));

CREATE POLICY "Student manages own reads" ON public.announcement_reads FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = announcement_reads.student_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.students s WHERE s.id = announcement_reads.student_id AND s.user_id = auth.uid()));

CREATE POLICY "Company scoped select reads" ON public.announcement_reads FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = announcement_reads.student_id AND s.company_id = public.get_user_company_id(auth.uid())));
