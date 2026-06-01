
-- Make whatsapp-media private
UPDATE storage.buckets SET public = false WHERE id = 'whatsapp-media';

-- Drop old broad storage policies
DROP POLICY IF EXISTS "Auth read evaluations" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete evaluations" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload evaluations" ON storage.objects;
DROP POLICY IF EXISTS "Public read whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload exercises videos" ON storage.objects;
DROP POLICY IF EXISTS "Auth update exercises videos" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete exercises videos" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload platform assets" ON storage.objects;
DROP POLICY IF EXISTS "Auth update platform assets" ON storage.objects;

-- ============ evaluations (private bucket, company-scoped by path[1]) ============
CREATE POLICY "evaluations company read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'evaluations'
  AND (
    has_role(auth.uid(), 'master'::app_role)
    OR (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
  )
);

CREATE POLICY "evaluations company insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'evaluations'
  AND (
    has_role(auth.uid(), 'master'::app_role)
    OR (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
  )
);

CREATE POLICY "evaluations company delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'evaluations'
  AND (
    has_role(auth.uid(), 'master'::app_role)
    OR (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
  )
);

-- ============ whatsapp-media (private, company-scoped) ============
CREATE POLICY "whatsapp-media company read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND (
    has_role(auth.uid(), 'master'::app_role)
    OR (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
  )
);

CREATE POLICY "whatsapp-media company insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'whatsapp-media'
  AND (
    has_role(auth.uid(), 'master'::app_role)
    OR (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
  )
);

CREATE POLICY "whatsapp-media company delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND (
    has_role(auth.uid(), 'master'::app_role)
    OR (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
  )
);

-- ============ exercises-videos (public read, scoped writes) ============
CREATE POLICY "exercises-videos company insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'exercises-videos'
  AND (
    has_role(auth.uid(), 'master'::app_role)
    OR (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
  )
);

CREATE POLICY "exercises-videos company update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'exercises-videos'
  AND (
    has_role(auth.uid(), 'master'::app_role)
    OR (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
  )
);

CREATE POLICY "exercises-videos company delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'exercises-videos'
  AND (
    has_role(auth.uid(), 'master'::app_role)
    OR (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
  )
);

-- ============ platform-assets (public read, scoped writes) ============
CREATE POLICY "platform-assets company insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'platform-assets'
  AND (
    has_role(auth.uid(), 'master'::app_role)
    OR (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
  )
);

CREATE POLICY "platform-assets company update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'platform-assets'
  AND (
    has_role(auth.uid(), 'master'::app_role)
    OR (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
  )
);

CREATE POLICY "platform-assets company delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'platform-assets'
  AND (
    has_role(auth.uid(), 'master'::app_role)
    OR (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
  )
);
