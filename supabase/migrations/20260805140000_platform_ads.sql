-- Optional platform campaigns controlled only by master users.
CREATE TABLE IF NOT EXISTS public.platform_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  image_url text,
  cta_label text,
  cta_url text,
  audience text NOT NULL CHECK (audience IN ('professional', 'student')),
  placement text NOT NULL CHECK (placement IN ('dashboard_banner', 'footer')),
  scope text NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'company', 'student')),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_ads_target_check CHECK (
    (scope = 'all' AND company_id IS NULL AND student_id IS NULL)
    OR (scope = 'company' AND company_id IS NOT NULL AND student_id IS NULL)
    OR (scope = 'student' AND company_id IS NOT NULL AND student_id IS NOT NULL)
  ),
  CONSTRAINT platform_ads_period_check CHECK (
    starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at
  ),
  CONSTRAINT platform_ads_student_scope_check CHECK (
    audience = 'student' OR scope <> 'student'
  )
);

CREATE INDEX IF NOT EXISTS platform_ads_delivery_idx
  ON public.platform_ads (audience, placement, is_active, priority DESC);
CREATE INDEX IF NOT EXISTS platform_ads_company_idx
  ON public.platform_ads (company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS platform_ads_student_idx
  ON public.platform_ads (student_id) WHERE student_id IS NOT NULL;

ALTER TABLE public.platform_ads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Master manages platform ads" ON public.platform_ads;
CREATE POLICY "Master manages platform ads"
  ON public.platform_ads
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'master'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master'::public.app_role));

DROP TRIGGER IF EXISTS update_platform_ads_updated_at ON public.platform_ads;
CREATE TRIGGER update_platform_ads_updated_at
  BEFORE UPDATE ON public.platform_ads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'platform-ads',
  'platform-ads',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Master uploads platform ad images" ON storage.objects;
CREATE POLICY "Master uploads platform ad images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'platform-ads'
    AND public.has_role(auth.uid(), 'master'::public.app_role)
  );

DROP POLICY IF EXISTS "Master updates platform ad images" ON storage.objects;
CREATE POLICY "Master updates platform ad images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'platform-ads'
    AND public.has_role(auth.uid(), 'master'::public.app_role)
  )
  WITH CHECK (
    bucket_id = 'platform-ads'
    AND public.has_role(auth.uid(), 'master'::public.app_role)
  );

DROP POLICY IF EXISTS "Master deletes platform ad images" ON storage.objects;
CREATE POLICY "Master deletes platform ad images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'platform-ads'
    AND public.has_role(auth.uid(), 'master'::public.app_role)
  );

CREATE OR REPLACE FUNCTION public.get_active_platform_ads(
  _audience text,
  _placement text,
  _company_id_hint uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  body text,
  image_url text,
  cta_label text,
  cta_url text,
  placement text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _resolved_company_id uuid;
  _student_id uuid;
  _is_student boolean := false;
BEGIN
  IF _user_id IS NULL
     OR _audience NOT IN ('professional', 'student')
     OR _placement NOT IN ('dashboard_banner', 'footer') THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'student'
  ) INTO _is_student;

  IF _is_student THEN
    SELECT s.id, s.company_id
      INTO _student_id, _resolved_company_id
    FROM public.students s
    WHERE s.user_id = _user_id
    ORDER BY s.created_at DESC
    LIMIT 1;
  ELSE
    IF _company_id_hint IS NOT NULL AND (
      public.has_role(_user_id, 'master'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = _user_id AND cm.company_id = _company_id_hint
      )
    ) THEN
      _resolved_company_id := _company_id_hint;
    ELSE
      SELECT cm.company_id
        INTO _resolved_company_id
      FROM public.company_members cm
      WHERE cm.user_id = _user_id
      ORDER BY cm.created_at DESC
      LIMIT 1;
    END IF;
  END IF;

  IF (_audience = 'student' AND NOT _is_student)
     OR (_audience = 'professional' AND _is_student) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ad.id,
    ad.title,
    ad.body,
    ad.image_url,
    ad.cta_label,
    ad.cta_url,
    ad.placement
  FROM public.platform_ads ad
  WHERE ad.audience = _audience
    AND ad.placement = _placement
    AND ad.is_active
    AND (ad.starts_at IS NULL OR ad.starts_at <= now())
    AND (ad.ends_at IS NULL OR ad.ends_at >= now())
    AND (
      ad.scope = 'all'
      OR (ad.scope = 'company' AND ad.company_id = _resolved_company_id)
      OR (ad.scope = 'student' AND ad.student_id = _student_id)
    )
  ORDER BY ad.priority DESC, ad.created_at DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_platform_ads(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_platform_ads(text, text, uuid) TO authenticated;
