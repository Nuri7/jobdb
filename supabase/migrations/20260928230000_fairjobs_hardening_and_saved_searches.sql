-- FairJobs security boundary and candidate features.
-- Public job discovery is served by the `api` Edge Function using the service role.
-- Direct table access is restricted to authenticated admins or the row owner.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'supporter', 'user');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Remove every legacy policy from the JobDB-owned tables. Some historical migrations granted
-- anonymous insert/update/delete access, and policy names changed between environments, so a
-- name-independent cleanup is safer than selectively dropping known names.
DO $$
DECLARE
  target_table text;
  policy_name text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'api_keys', 'company_career_sites', 'job_opportunities',
    'job_synonyms', 'scraper_settings', 'scrape_history'
  ]
  LOOP
    IF to_regclass('public.' || target_table) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
      FOR policy_name IN
        SELECT pol.policyname FROM pg_policies pol
        WHERE pol.schemaname = 'public' AND pol.tablename = target_table
      LOOP
        EXECUTE format('DROP POLICY %I ON public.%I', policy_name, target_table);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- Admin-only access to operational data. service_role bypasses RLS for pipelines and Edge
-- Functions, while authenticated users must hold the shared `admin` role.
CREATE POLICY "JobDB admins manage API keys"
  ON public.api_keys FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "JobDB admins manage companies"
  ON public.company_career_sites FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "JobDB admins manage jobs"
  ON public.job_opportunities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "JobDB admins manage synonyms"
  ON public.job_synonyms FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "JobDB admins manage scraper settings"
  ON public.scraper_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "JobDB admins manage scrape history"
  ON public.scrape_history FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Preserve the shared account's ability to see its own role without exposing other users.
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.job_saved_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.job_opportunities(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_saved_items_user_created
  ON public.job_saved_items (user_id, created_at DESC);

ALTER TABLE public.job_saved_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their saved jobs"
  ON public.job_saved_items FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.job_saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(criteria) = 'object'),
  email_enabled boolean NOT NULL DEFAULT true,
  last_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_saved_searches_alerts
  ON public.job_saved_searches (email_enabled, last_notified_at)
  WHERE email_enabled = true;

ALTER TABLE public.job_saved_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their saved searches"
  ON public.job_saved_searches FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_job_saved_search()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_job_saved_search ON public.job_saved_searches;
CREATE TRIGGER trg_touch_job_saved_search
  BEFORE UPDATE ON public.job_saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.touch_job_saved_search();

-- All public aggregates use exactly the same candidate-facing gate as /api/jobs.
CREATE OR REPLACE FUNCTION public.job_geo_counts()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout TO '30s'
AS $$
  WITH open_jobs AS MATERIALIZED (
    SELECT city, province
    FROM public.job_opportunities
    WHERE status = 'open' AND verified = true AND is_foreign = false
  ),
  city_counts AS (
    SELECT city, mode() WITHIN GROUP (ORDER BY province) AS province, count(*)::int AS count
    FROM open_jobs WHERE city IS NOT NULL
    GROUP BY city ORDER BY count(*) DESC LIMIT 400
  ),
  prov_counts AS (
    SELECT province, count(*)::int AS count
    FROM open_jobs WHERE province IS NOT NULL
    GROUP BY province ORDER BY count(*) DESC
  )
  SELECT json_build_object(
    'cities',    (SELECT coalesce(json_agg(row_to_json(c)), '[]'::json) FROM city_counts c),
    'provinces', (SELECT coalesce(json_agg(row_to_json(p)), '[]'::json) FROM prov_counts p),
    'total',     (SELECT count(*)::int FROM open_jobs),
    'located',   (SELECT count(*)::int FROM open_jobs WHERE city IS NOT NULL)
  );
$$;

CREATE OR REPLACE FUNCTION public.job_stats()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout TO '30s'
AS $$
  WITH base AS MATERIALIZED (
    SELECT o.city, o.province, o.employment_type, o.experience_level,
           o.first_seen_at, o.closed_at, o.status, o.verified,
           o.salary_range, o.is_remote, o.is_foreign, c.source_type
    FROM public.job_opportunities o
    JOIN public.company_career_sites c ON c.id = o.company_career_site_id
    WHERE c.is_scrape_enabled = true
  ),
  ov AS (
    SELECT * FROM base
    WHERE status = 'open' AND verified = true AND is_foreign = false
  )
  SELECT json_build_object(
    'total_jobs',      (SELECT count(*)::int FROM ov),
    'total_companies', (SELECT count(DISTINCT c.id)::int
                        FROM public.company_career_sites c
                        JOIN public.job_opportunities o ON o.company_career_site_id = c.id
                        WHERE c.is_scrape_enabled = true AND o.status = 'open'
                          AND o.verified = true AND o.is_foreign = false),
    'new_7d',          (SELECT count(*)::int FROM ov WHERE first_seen_at >= now() - interval '7 days'),
    'new_30d',         (SELECT count(*)::int FROM ov WHERE first_seen_at >= now() - interval '30 days'),
    'closed_7d',       (SELECT count(*)::int FROM base WHERE status = 'closed' AND closed_at >= now() - interval '7 days'),
    'easy_apply',      (SELECT count(*)::int FROM ov WHERE source_type LIKE 'ats:%'),
    'with_salary',     (SELECT count(*)::int FROM ov WHERE salary_range IS NOT NULL),
    'remote',          (SELECT count(*)::int FROM ov WHERE is_remote),
    'by_province',     (SELECT coalesce(json_agg(row_to_json(p)), '[]'::json) FROM
                          (SELECT province, count(*)::int AS count FROM ov WHERE province IS NOT NULL
                           GROUP BY province ORDER BY count(*) DESC) p),
    'top_cities',      (SELECT coalesce(json_agg(row_to_json(ci)), '[]'::json) FROM
                          (SELECT city, count(*)::int AS count FROM ov WHERE city IS NOT NULL
                           GROUP BY city ORDER BY count(*) DESC LIMIT 15) ci),
    'by_type',         (SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM
                          (SELECT employment_type, count(*)::int AS count FROM ov WHERE employment_type IS NOT NULL
                           GROUP BY employment_type ORDER BY count(*) DESC LIMIT 12) t),
    'by_seniority',    (SELECT coalesce(json_agg(row_to_json(s)), '[]'::json) FROM
                          (SELECT experience_level, count(*)::int AS count FROM ov WHERE experience_level IS NOT NULL
                           GROUP BY experience_level ORDER BY count(*) DESC) s)
  );
$$;

CREATE INDEX IF NOT EXISTS idx_job_opps_public_feed
  ON public.job_opportunities (scraped_at DESC, id)
  WHERE status = 'open' AND verified = true AND is_foreign = false;

REVOKE ALL ON TABLE public.api_keys FROM anon;
REVOKE ALL ON TABLE public.company_career_sites FROM anon;
REVOKE ALL ON TABLE public.job_opportunities FROM anon;
REVOKE ALL ON TABLE public.job_synonyms FROM anon;
REVOKE ALL ON TABLE public.scraper_settings FROM anon;
REVOKE ALL ON TABLE public.scrape_history FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_saved_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_saved_searches TO authenticated;
GRANT EXECUTE ON FUNCTION public.job_geo_counts() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.job_stats() TO anon, authenticated, service_role;
