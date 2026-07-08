-- Hiring-pulse aggregates for /api/stats + a public stats page. One MATERIALIZED pass over
-- the open+verified set (same gate as the public API), joined to companies for source_type.
CREATE OR REPLACE FUNCTION public.job_stats()
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER
SET statement_timeout TO '30s'
AS $$
  WITH base AS MATERIALIZED (
    SELECT o.city, o.province, o.employment_type, o.experience_level,
           o.first_seen_at, o.closed_at, o.status, o.verified,
           o.salary_range, o.is_remote, c.source_type
    FROM public.job_opportunities o
    JOIN public.company_career_sites c ON c.id = o.company_career_site_id
    WHERE c.is_scrape_enabled = true
  ),
  ov AS (SELECT * FROM base WHERE status = 'open' AND verified = true)
  SELECT json_build_object(
    'total_jobs',      (SELECT count(*)::int FROM ov),
    'total_companies', (SELECT count(*)::int FROM public.company_career_sites WHERE is_scrape_enabled = true),
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

GRANT EXECUTE ON FUNCTION public.job_stats() TO anon, authenticated, service_role;
