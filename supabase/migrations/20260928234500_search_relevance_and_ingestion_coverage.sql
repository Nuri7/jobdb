-- FairJobs search relevance, normalized facets and ingestion coverage state.
-- Additive/idempotent because this Supabase project is shared with FairApply.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE public.job_opportunities
  ADD COLUMN IF NOT EXISTS search_vector tsvector,
  ADD COLUMN IF NOT EXISTS employment_type_normalized text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS experience_level_normalized text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS workplace_type text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS salary_min numeric,
  ADD COLUMN IF NOT EXISTS salary_max numeric,
  ADD COLUMN IF NOT EXISTS salary_currency text,
  ADD COLUMN IF NOT EXISTS salary_period text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_opps_employment_normalized_chk') THEN
    ALTER TABLE public.job_opportunities ADD CONSTRAINT job_opps_employment_normalized_chk
      CHECK (employment_type_normalized IN ('fulltime','parttime','contract','internship','other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_opps_experience_normalized_chk') THEN
    ALTER TABLE public.job_opportunities ADD CONSTRAINT job_opps_experience_normalized_chk
      CHECK (experience_level_normalized IN ('junior','medior','senior','unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_opps_workplace_type_chk') THEN
    ALTER TABLE public.job_opportunities ADD CONSTRAINT job_opps_workplace_type_chk
      CHECK (workplace_type IN ('remote','hybrid','onsite','unknown'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fairjobs_prepare_job_search()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  employment_haystack text := lower(coalesce(NEW.employment_type, '') || ' ' || coalesce(NEW.job_title, ''));
  experience_haystack text := lower(coalesce(NEW.experience_level, '') || ' ' || coalesce(NEW.job_title, ''));
  workplace_haystack text := lower(coalesce(NEW.job_title, '') || ' ' || left(coalesce(NEW.description, ''), 4000));
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.job_title, ''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.department, ''))), 'B') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.requirements, ''))), 'B') ||
    setweight(to_tsvector('simple', unaccent(left(coalesce(NEW.description, ''), 12000))), 'C') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.location, ''))), 'D');

  NEW.employment_type_normalized := CASE
    WHEN coalesce(NEW.is_internship, false) OR employment_haystack ~ '(internship|stagiair|stage|werkstudent|afstudeer)' THEN 'internship'
    WHEN employment_haystack ~ '(part[ -]?time|deeltijd|parttime)' THEN 'parttime'
    WHEN employment_haystack ~ '(contract|temporary|tijdelijk|fixed[ -]?term|interim|freelance|zzp)' THEN 'contract'
    WHEN employment_haystack ~ '(full[ -]?time|voltijd|fulltime)' THEN 'fulltime'
    ELSE 'other'
  END;

  NEW.experience_level_normalized := CASE
    WHEN experience_haystack ~ '(senior|lead|principal|staff|director|directeur|head of|manager|expert)' THEN 'senior'
    WHEN experience_haystack ~ '(junior|entry|instap|starter|graduate|trainee|student|stagiair)' THEN 'junior'
    WHEN experience_haystack ~ '(medior|mid[ -]?level|experienced|ervaren)' THEN 'medior'
    ELSE 'unknown'
  END;

  NEW.workplace_type := CASE
    WHEN workplace_haystack ~ '(hybrid|hybride)' THEN 'hybrid'
    WHEN coalesce(NEW.is_remote, false) OR workplace_haystack ~ '(fully remote|remote first|volledig thuis)' THEN 'remote'
    WHEN workplace_haystack ~ '(on[ -]?site|op locatie|op kantoor)' THEN 'onsite'
    ELSE 'unknown'
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fairjobs_prepare_job_search_trigger ON public.job_opportunities;
CREATE TRIGGER fairjobs_prepare_job_search_trigger
BEFORE INSERT OR UPDATE OF job_title, department, requirements, description, location,
  employment_type, experience_level, is_internship, is_remote
ON public.job_opportunities
FOR EACH ROW EXECUTE FUNCTION public.fairjobs_prepare_job_search();

CREATE INDEX IF NOT EXISTS idx_job_opps_public_facets
  ON public.job_opportunities
    (employment_type_normalized, experience_level_normalized, workplace_type, first_seen_at DESC)
  WHERE status = 'open' AND verified = true AND is_foreign = false;

-- Search is executed by the service-role API. It ranks the complete matching set before LIMIT/OFFSET.
CREATE OR REPLACE FUNCTION public.fairjobs_search_jobs(
  p_terms text[] DEFAULT ARRAY[]::text[],
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0,
  p_posted_since timestamptz DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_cities text[] DEFAULT NULL,
  p_company_ids uuid[] DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_employment_types text[] DEFAULT NULL,
  p_experience_levels text[] DEFAULT NULL,
  p_workplace_types text[] DEFAULT NULL,
  p_internship boolean DEFAULT NULL,
  p_has_salary boolean DEFAULT NULL,
  p_ats_only boolean DEFAULT NULL,
  p_status text DEFAULT 'open',
  p_verified_only boolean DEFAULT true,
  p_nl_only boolean DEFAULT true
)
RETURNS TABLE(id uuid, search_rank real, match_reason text, total_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH candidates AS (
    SELECT
      j.id,
      j.job_title,
      j.posted_date,
      j.first_seen_at,
      j.scraped_at,
      CASE
        WHEN cardinality(coalesce(p_terms, ARRAY[]::text[])) = 0 THEN 70::real
        ELSE coalesce(term_score.score, 0)::real
      END AS score,
      CASE
        WHEN cardinality(coalesce(p_terms, ARRAY[]::text[])) = 0 THEN 'fresh vacancy'
        WHEN term_score.score >= 100 THEN 'exact title'
        WHEN term_score.score >= 94 THEN 'title starts with query'
        WHEN term_score.score >= 88 THEN 'title phrase match'
        WHEN term_score.score >= 78 THEN 'title or company match'
        WHEN term_score.score >= 68 THEN 'skills or description match'
        ELSE 'similar title'
      END AS reason
    FROM public.job_opportunities j
    JOIN public.company_career_sites c ON c.id = j.company_career_site_id
    LEFT JOIN LATERAL (
      SELECT max(
        CASE
          WHEN lower(j.job_title) = lower(term) THEN 100
          WHEN lower(j.job_title) LIKE lower(term) || ' %' THEN 95
          WHEN lower(j.job_title) LIKE '% ' || lower(term) || ' %'
            OR lower(j.job_title) LIKE '% ' || lower(term) THEN 90
          WHEN lower(j.job_title) LIKE '%' || lower(term) || '%' THEN 84
          WHEN lower(c.company_name) LIKE '%' || lower(term) || '%' THEN 80
          WHEN to_tsvector('simple', unaccent(j.job_title)) @@ plainto_tsquery('simple', unaccent(term)) THEN
            78 + least(8, ts_rank_cd(to_tsvector('simple', unaccent(j.job_title)), plainto_tsquery('simple', unaccent(term))) * 20)
          WHEN j.search_vector @@ plainto_tsquery('simple', unaccent(term)) THEN
            68 + least(9, ts_rank_cd(j.search_vector, plainto_tsquery('simple', unaccent(term))) * 20)
          WHEN word_similarity(unaccent(lower(term)), unaccent(lower(j.job_title))) >= 0.42 THEN
            60 + word_similarity(unaccent(lower(term)), unaccent(lower(j.job_title))) * 15
          WHEN similarity(unaccent(lower(j.job_title)), unaccent(lower(term))) >= 0.28 THEN
            58 + similarity(unaccent(lower(j.job_title)), unaccent(lower(term))) * 15
          ELSE 0
        END
      )::real AS score
      FROM unnest(coalesce(p_terms, ARRAY[]::text[])) AS term
    ) term_score ON true
    WHERE (p_status = 'all' OR j.status = p_status)
      AND (NOT p_verified_only OR j.verified = true)
      AND (NOT p_nl_only OR j.is_foreign = false)
      AND (p_posted_since IS NULL OR j.first_seen_at >= p_posted_since)
      AND (p_location IS NULL OR j.location ILIKE '%' || p_location || '%')
      AND (p_cities IS NULL OR cardinality(p_cities) = 0 OR j.city = ANY(p_cities))
      AND (p_company_ids IS NULL OR j.company_career_site_id = ANY(p_company_ids))
      AND (p_company_id IS NULL OR j.company_career_site_id = p_company_id)
      AND (p_employment_types IS NULL OR j.employment_type_normalized = ANY(p_employment_types))
      AND (p_experience_levels IS NULL OR j.experience_level_normalized = ANY(p_experience_levels))
      AND (p_workplace_types IS NULL OR j.workplace_type = ANY(p_workplace_types))
      AND (p_internship IS NULL OR j.is_internship = p_internship)
      AND (p_has_salary IS NULL OR NOT p_has_salary OR (j.salary_range IS NOT NULL AND j.salary_range !~* '^(EUR|€)?\\s*0(?:\\D|$)'))
      AND (p_ats_only IS NULL OR NOT p_ats_only OR c.source_type LIKE 'ats:%')
      AND (cardinality(coalesce(p_terms, ARRAY[]::text[])) = 0 OR coalesce(term_score.score, 0) > 0)
  ), ranked AS (
    SELECT
      candidates.*,
      count(*) OVER () AS n
    FROM candidates
  )
  SELECT ranked.id, ranked.score, ranked.reason, ranked.n
  FROM ranked
  ORDER BY ranked.score DESC,
    coalesce(ranked.posted_date, ranked.first_seen_at::date) DESC,
    ranked.scraped_at DESC,
    ranked.id
  LIMIT greatest(1, least(p_limit, 100))
  OFFSET greatest(0, p_offset);
$$;

CREATE OR REPLACE FUNCTION public.fairjobs_search_facets(
  p_terms text[] DEFAULT ARRAY[]::text[],
  p_posted_since timestamptz DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_cities text[] DEFAULT NULL,
  p_company_ids uuid[] DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH matched AS (
    SELECT j.*
    FROM public.job_opportunities j
    JOIN public.company_career_sites c ON c.id = j.company_career_site_id
    LEFT JOIN LATERAL (
      SELECT bool_or(
        lower(j.job_title) LIKE '%' || lower(term) || '%'
        OR lower(c.company_name) LIKE '%' || lower(term) || '%'
        OR j.search_vector @@ plainto_tsquery('simple', unaccent(term))
        OR word_similarity(unaccent(lower(term)), unaccent(lower(j.job_title))) >= 0.42
        OR similarity(unaccent(lower(j.job_title)), unaccent(lower(term))) >= 0.28
      ) AS ok
      FROM unnest(coalesce(p_terms, ARRAY[]::text[])) AS term
    ) term_match ON true
    WHERE j.status = 'open' AND j.verified = true AND j.is_foreign = false
      AND (p_posted_since IS NULL OR j.first_seen_at >= p_posted_since)
      AND (p_location IS NULL OR j.location ILIKE '%' || p_location || '%')
      AND (p_cities IS NULL OR cardinality(p_cities) = 0 OR j.city = ANY(p_cities))
      AND (p_company_ids IS NULL OR j.company_career_site_id = ANY(p_company_ids))
      AND (p_company_id IS NULL OR j.company_career_site_id = p_company_id)
      AND (cardinality(coalesce(p_terms, ARRAY[]::text[])) = 0 OR coalesce(term_match.ok, false))
  )
  SELECT jsonb_build_object(
    'employment_type', coalesce((
      SELECT jsonb_object_agg(employment_type_normalized, n)
      FROM (SELECT employment_type_normalized, count(*) n FROM matched GROUP BY 1) x
    ), '{}'::jsonb),
    'experience_level', coalesce((
      SELECT jsonb_object_agg(experience_level_normalized, n)
      FROM (SELECT experience_level_normalized, count(*) n FROM matched GROUP BY 1) x
    ), '{}'::jsonb),
    'workplace_type', coalesce((
      SELECT jsonb_object_agg(workplace_type, n)
      FROM (SELECT workplace_type, count(*) n FROM matched GROUP BY 1) x
    ), '{}'::jsonb),
    'province', coalesce((
      SELECT jsonb_object_agg(province, n)
      FROM (SELECT province, count(*) n FROM matched WHERE province IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 15) x
    ), '{}'::jsonb),
    'salary', jsonb_build_object('available', (SELECT count(*) FROM matched WHERE salary_range IS NOT NULL)),
    'internship', jsonb_build_object('available', (SELECT count(*) FROM matched WHERE is_internship = true))
  );
$$;

REVOKE ALL ON FUNCTION public.fairjobs_search_jobs(text[], integer, integer, timestamptz, text, text[], uuid[], uuid, text[], text[], text[], boolean, boolean, boolean, text, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fairjobs_search_facets(text[], timestamptz, text, text[], uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fairjobs_search_jobs(text[], integer, integer, timestamptz, text, text[], uuid[], uuid, text[], text[], text[], boolean, boolean, boolean, text, boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fairjobs_search_facets(text[], timestamptz, text, text[], uuid[], uuid) TO service_role;

CREATE TABLE IF NOT EXISTS public.job_ingestion_candidates (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  source_kind text NOT NULL,
  candidate_key text NOT NULL,
  source_url text,
  state text NOT NULL DEFAULT 'new' CHECK (state IN ('new','accepted','rejected','retry','dead')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  retry_after timestamptz,
  check_count integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (source_kind, candidate_key)
);
ALTER TABLE public.job_ingestion_candidates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.job_ingestion_candidates FROM anon, authenticated;
GRANT ALL ON TABLE public.job_ingestion_candidates TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
CREATE INDEX IF NOT EXISTS idx_job_ingestion_candidates_retry
  ON public.job_ingestion_candidates (state, retry_after, last_checked_at);

-- One bounded query for the admin coverage dashboard and pipeline health summary. Keeping this
-- aggregation in Postgres avoids PostgREST's default 1,000-row window and makes every count exact.
CREATE OR REPLACE FUNCTION public.fairjobs_coverage_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH
  company_counts AS (
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE is_scrape_enabled)::int AS enabled,
      count(*) FILTER (WHERE career_page_status = 'verified')::int AS verified,
      count(*) FILTER (WHERE career_page_status = 'unverified')::int AS unverified,
      count(*) FILTER (WHERE career_page_status = 'ambiguous')::int AS ambiguous,
      count(*) FILTER (WHERE career_page_status = 'dead')::int AS dead,
      count(*) FILTER (WHERE is_scrape_enabled AND last_success_at >= now() - interval '48 hours')::int AS fresh_48h,
      count(*) FILTER (WHERE is_scrape_enabled AND last_success_at < now() - interval '7 days')::int AS stale_7d,
      count(*) FILTER (WHERE is_scrape_enabled AND last_success_at IS NULL)::int AS never_succeeded
    FROM public.company_career_sites
  ),
  public_jobs AS (
    SELECT j.*, c.source_type
    FROM public.job_opportunities j
    JOIN public.company_career_sites c ON c.id = j.company_career_site_id
    WHERE j.status = 'open' AND j.verified = true AND j.is_foreign = false
  ),
  job_counts AS (
    SELECT
      (SELECT count(*)::int FROM public.job_opportunities WHERE status = 'open') AS open_all,
      (SELECT count(*)::int FROM public.job_opportunities WHERE status = 'closed') AS closed,
      count(*)::int AS public_open,
      count(*) FILTER (WHERE first_seen_at >= now() - interval '7 days')::int AS fresh_7d,
      count(*) FILTER (WHERE first_seen_at >= now() - interval '30 days')::int AS fresh_30d,
      count(*) FILTER (WHERE salary_range IS NOT NULL AND salary_range <> '')::int AS with_salary,
      count(*) FILTER (WHERE city IS NOT NULL OR location IS NOT NULL)::int AS with_location,
      count(*) FILTER (WHERE source_type LIKE 'ats:%')::int AS from_ats
    FROM public_jobs
  ),
  run_counts AS (
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'success')::int AS success,
      count(*) FILTER (WHERE status = 'partial')::int AS partial,
      count(*) FILTER (WHERE status = 'failed')::int AS failed,
      count(*) FILTER (WHERE status = 'running')::int AS running
    FROM public.scrape_history
    WHERE started_at >= now() - interval '24 hours'
  ),
  company_sources AS (
    SELECT coalesce(source_type, 'unresolved') AS source, count(*)::int AS companies
    FROM public.company_career_sites
    GROUP BY 1
  ),
  job_sources AS (
    SELECT coalesce(source_type, 'unresolved') AS source, count(*)::int AS jobs
    FROM public_jobs
    GROUP BY 1
  ),
  source_rows AS (
    SELECT
      coalesce(c.source, j.source) AS source,
      coalesce(c.companies, 0) AS companies,
      coalesce(j.jobs, 0) AS public_open_jobs
    FROM company_sources c
    FULL JOIN job_sources j USING (source)
  ),
  candidate_counts AS (
    SELECT state, count(*)::int AS n
    FROM public.job_ingestion_candidates
    GROUP BY state
  ),
  error_counts AS (
    SELECT left(error_message, 140) AS message, count(*)::int AS n
    FROM public.scrape_history
    WHERE started_at >= now() - interval '24 hours' AND error_message IS NOT NULL
    GROUP BY 1
    ORDER BY n DESC, message
    LIMIT 8
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'companies', (SELECT to_jsonb(company_counts) FROM company_counts),
    'jobs', (SELECT to_jsonb(job_counts) FROM job_counts),
    'runs_24h', (SELECT to_jsonb(run_counts) FROM run_counts),
    'sources', coalesce((SELECT jsonb_agg(to_jsonb(source_rows) ORDER BY public_open_jobs DESC, source) FROM source_rows), '[]'::jsonb),
    'candidates', coalesce((SELECT jsonb_object_agg(state, n) FROM candidate_counts), '{}'::jsonb),
    'top_errors_24h', coalesce((SELECT jsonb_agg(to_jsonb(error_counts) ORDER BY n DESC) FROM error_counts), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.fairjobs_coverage_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fairjobs_coverage_stats() TO service_role;

COMMIT;
