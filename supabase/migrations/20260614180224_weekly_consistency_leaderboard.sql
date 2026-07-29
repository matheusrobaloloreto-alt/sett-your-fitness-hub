-- Gamification: weekly consistency XP + anonymous monthly leaderboard.
-- Defaults: +40 XP when the student meets weekly_workout_goal; +10 XP per extra day.

CREATE TABLE IF NOT EXISTS public.xp_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  weekly_goal_met_xp integer NOT NULL DEFAULT 40 CHECK (weekly_goal_met_xp >= 0),
  weekly_extra_day_xp integer NOT NULL DEFAULT 10 CHECK (weekly_extra_day_xp >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS xp_settings_one_global
  ON public.xp_settings ((company_id IS NULL))
  WHERE company_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS xp_settings_company_unique
  ON public.xp_settings(company_id)
  WHERE company_id IS NOT NULL;
ALTER TABLE public.xp_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.xp_settings TO authenticated;
GRANT ALL ON public.xp_settings TO service_role;
DROP POLICY IF EXISTS "Master full access xp_settings" ON public.xp_settings;
CREATE POLICY "Master full access xp_settings" ON public.xp_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master'::app_role));
DROP POLICY IF EXISTS "Company scoped select xp_settings" ON public.xp_settings;
CREATE POLICY "Company scoped select xp_settings" ON public.xp_settings
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = public.get_user_company_id(auth.uid()));
DROP POLICY IF EXISTS "Company admins manage xp_settings" ON public.xp_settings;
CREATE POLICY "Company admins manage xp_settings" ON public.xp_settings
  FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'coordinator'::app_role)
    )
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'coordinator'::app_role)
    )
  );
INSERT INTO public.xp_settings (company_id, weekly_goal_met_xp, weekly_extra_day_xp, is_active)
VALUES (NULL, 40, 10, true)
ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.weekly_consistency_source_id(_student_id uuid, _week_start date)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    substr(md5(_student_id::text || ':weekly_consistency:' || _week_start::text), 1, 8) || '-' ||
    substr(md5(_student_id::text || ':weekly_consistency:' || _week_start::text), 9, 4) || '-' ||
    '4' || substr(md5(_student_id::text || ':weekly_consistency:' || _week_start::text), 14, 3) || '-' ||
    '8' || substr(md5(_student_id::text || ':weekly_consistency:' || _week_start::text), 18, 3) || '-' ||
    substr(md5(_student_id::text || ':weekly_consistency:' || _week_start::text), 21, 12)
  )::uuid;
$$;
CREATE OR REPLACE FUNCTION public.award_weekly_consistency(_week_start date DEFAULT (date_trunc('week', now())::date - 7))
RETURNS TABLE (
  student_id uuid,
  company_id uuid,
  week_start date,
  trained_days integer,
  weekly_goal integer,
  xp_awarded integer,
  xp_event_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_week_start date := date_trunc('week', COALESCE(_week_start, current_date))::date;
  v_week_end date := (date_trunc('week', COALESCE(_week_start, current_date))::date + 7);
  r record;
  v_base_xp integer;
  v_bonus_xp integer;
  v_xp integer;
  v_source uuid;
  v_event uuid;
BEGIN
  FOR r IN
    WITH attendance AS (
      SELECT
        ws.student_id,
        count(DISTINCT COALESCE(ws.session_date, ws.completed_at::date, ws.started_at::date))::integer AS trained_days
      FROM public.workout_sessions ws
      WHERE ws.status = 'completed'
        AND COALESCE(ws.session_date, ws.completed_at::date, ws.started_at::date) >= v_week_start
        AND COALESCE(ws.session_date, ws.completed_at::date, ws.started_at::date) < v_week_end
      GROUP BY ws.student_id
    )
    SELECT
      s.id AS student_id,
      s.company_id,
      GREATEST(1, LEAST(7, COALESCE(s.weekly_workout_goal, 3)))::integer AS weekly_goal,
      COALESCE(a.trained_days, 0)::integer AS trained_days,
      COALESCE(company_settings.weekly_goal_met_xp, global_settings.weekly_goal_met_xp, 40)::integer AS base_xp,
      COALESCE(company_settings.weekly_extra_day_xp, global_settings.weekly_extra_day_xp, 10)::integer AS bonus_xp
    FROM public.students s
    JOIN attendance a ON a.student_id = s.id
    LEFT JOIN public.xp_settings company_settings
      ON company_settings.company_id = s.company_id
     AND company_settings.is_active = true
    LEFT JOIN public.xp_settings global_settings
      ON global_settings.company_id IS NULL
     AND global_settings.is_active = true
    WHERE s.company_id IS NOT NULL
      AND COALESCE(s.status, '') <> 'inactive'
      AND a.trained_days >= GREATEST(1, LEAST(7, COALESCE(s.weekly_workout_goal, 3)))
  LOOP
    v_base_xp := GREATEST(0, COALESCE(r.base_xp, 40));
    v_bonus_xp := GREATEST(0, COALESCE(r.bonus_xp, 10));
    v_xp := v_base_xp + GREATEST(0, r.trained_days - r.weekly_goal) * v_bonus_xp;
    v_source := public.weekly_consistency_source_id(r.student_id, v_week_start);

    SELECT public.award_xp(
      r.student_id,
      'weekly_consistency',
      v_xp,
      v_source,
      format('Meta semanal ISO %s: %s/%s dias concluídos', v_week_start, r.trained_days, r.weekly_goal)
    ) INTO v_event;

    IF v_event IS NOT NULL THEN
      student_id := r.student_id;
      company_id := r.company_id;
      week_start := v_week_start;
      trained_days := r.trained_days;
      weekly_goal := r.weekly_goal;
      xp_awarded := v_xp;
      xp_event_id := v_event;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.weekly_consistency_source_id(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.award_weekly_consistency(date) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.private_display_name(_full_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH parts AS (
    SELECT regexp_split_to_array(trim(COALESCE(_full_name, 'Aluno')), '\s+') AS p
  )
  SELECT CASE
    WHEN array_length(p, 1) >= 2 THEN initcap(p[1]) || ' ' || upper(left(p[2], 1)) || '.'
    ELSE initcap(COALESCE(NULLIF(p[1], ''), 'Aluno'))
  END
  FROM parts;
$$;
GRANT EXECUTE ON FUNCTION public.private_display_name(text) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.get_monthly_leaderboard(_company_id uuid, _month date DEFAULT current_date)
RETURNS TABLE (top3 jsonb, caller jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_company uuid;
  v_is_master boolean;
  v_month_start date := date_trunc('month', COALESCE(_month, current_date))::date;
  v_month_end date := (date_trunc('month', COALESCE(_month, current_date))::date + interval '1 month')::date;
BEGIN
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'company_id obrigatório';
  END IF;

  SELECT public.get_user_company_id(v_user_id) INTO v_user_company;
  SELECT public.has_role(v_user_id, 'master'::app_role) INTO v_is_master;

  IF NOT COALESCE(v_is_master, false) AND v_user_company IS DISTINCT FROM _company_id THEN
    RAISE EXCEPTION 'Forbidden: company mismatch';
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT
      s.id AS student_id,
      s.user_id,
      s.full_name,
      COALESCE(sum(x.xp_amount) FILTER (
        WHERE x.created_at >= v_month_start
          AND x.created_at < v_month_end
      ), 0)::bigint AS xp
    FROM public.students s
    LEFT JOIN public.xp_events x ON x.student_id = s.id
    WHERE s.company_id = _company_id
      AND COALESCE(s.status, '') <> 'inactive'
    GROUP BY s.id, s.user_id, s.full_name
  ),
  ranked_with_position AS (
    SELECT
      *,
      dense_rank() OVER (ORDER BY xp DESC, full_name ASC, student_id ASC)::integer AS rank
    FROM ranked
  ),
  caller_row AS (
    SELECT *
    FROM ranked_with_position
    WHERE user_id = v_user_id
    ORDER BY student_id
    LIMIT 1
  )
  SELECT
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'display_name', public.private_display_name(r.full_name),
            'xp', r.xp,
            'rank', r.rank
          )
          ORDER BY r.rank, r.full_name
        )
        FROM (
          SELECT *
          FROM ranked_with_position
          ORDER BY rank, full_name, student_id
          LIMIT 3
        ) r
      ),
      '[]'::jsonb
    ) AS top3,
    COALESCE(
      (
        SELECT jsonb_build_object(
          'rank', c.rank,
          'xp', c.xp,
          'total_participantes', (SELECT count(*) FROM ranked_with_position)
        )
        FROM caller_row c
      ),
      jsonb_build_object(
        'rank', NULL,
        'xp', 0,
        'total_participantes', (SELECT count(*) FROM ranked_with_position)
      )
    ) AS caller;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_monthly_leaderboard(uuid, date) TO authenticated, service_role;
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'award-weekly-consistency') THEN
    PERFORM cron.unschedule('award-weekly-consistency');
  END IF;
  PERFORM cron.schedule(
    'award-weekly-consistency',
    '15 6 * * 1',
    'SELECT * FROM public.award_weekly_consistency((date_trunc(''week'', now())::date - 7));'
  );
END;
$cron$;
