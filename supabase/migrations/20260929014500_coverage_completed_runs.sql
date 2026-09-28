-- scrape_history uses `completed` for successful pipeline runs. Count that status (and legacy
-- `success`) correctly in the coverage dashboard.

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
  public_jobs AS MATERIALIZED (
    SELECT j.first_seen_at, j.salary_range, j.salary_min, j.city, j.location, c.source_type
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
      count(*) FILTER (WHERE salary_min IS NOT NULL OR (salary_range IS NOT NULL AND salary_range <> ''))::int AS with_salary,
      count(*) FILTER (WHERE city IS NOT NULL OR location IS NOT NULL)::int AS with_location,
      count(*) FILTER (WHERE source_type LIKE 'ats:%')::int AS from_ats
    FROM public_jobs
  ),
  run_counts AS (
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status IN ('completed', 'success'))::int AS success,
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
    SELECT coalesce(c.source, j.source) AS source,
      coalesce(c.companies, 0) AS companies,
      coalesce(j.jobs, 0) AS public_open_jobs
    FROM company_sources c FULL JOIN job_sources j USING (source)
  ),
  candidate_counts AS (
    SELECT state, count(*)::int AS n FROM public.job_ingestion_candidates GROUP BY state
  ),
  error_counts AS (
    SELECT left(error_message, 140) AS message, count(*)::int AS n
    FROM public.scrape_history
    WHERE started_at >= now() - interval '24 hours' AND error_message IS NOT NULL
    GROUP BY 1 ORDER BY n DESC, message LIMIT 8
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
