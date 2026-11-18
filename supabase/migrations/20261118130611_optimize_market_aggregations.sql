-- Serve map and statistics aggregations from small public-only index records.
-- Build these indexes concurrently in production before replacing the RPC bodies.
CREATE INDEX IF NOT EXISTS idx_job_opps_public_geo_cover
 ON public.job_opportunities(city,province)
 WHERE status='open' AND verified=true AND is_foreign=false;
CREATE INDEX IF NOT EXISTS idx_job_opps_public_market_cover
 ON public.job_opportunities(first_seen_at DESC,company_career_site_id)
 INCLUDE(city,province,employment_type,experience_level,salary_range,is_remote)
 WHERE status='open' AND verified=true AND is_foreign=false;
CREATE INDEX IF NOT EXISTS idx_job_opps_closed_time_company
 ON public.job_opportunities(closed_at DESC,company_career_site_id)
 WHERE status='closed' AND closed_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.job_geo_counts()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.job_stats()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
  WITH base AS MATERIALIZED (
    SELECT o.company_career_site_id, o.city, o.province, o.employment_type, o.experience_level,
           o.first_seen_at, o.closed_at, o.status, o.verified,
           o.salary_range, o.is_remote, o.is_foreign, c.source_type
    FROM public.job_opportunities o
    JOIN public.company_career_sites c ON c.id = o.company_career_site_id
    WHERE c.is_scrape_enabled = true
      AND o.status = 'open' AND o.verified = true AND o.is_foreign = false
  ),
  ov AS (
    SELECT * FROM base
    WHERE status = 'open' AND verified = true AND is_foreign = false
  )
  SELECT json_build_object(
    'total_jobs',      (SELECT count(*)::int FROM ov),
    'total_companies', (SELECT count(DISTINCT company_career_site_id)::int FROM ov),
    'new_7d',          (SELECT count(*)::int FROM ov WHERE first_seen_at >= now() - interval '7 days'),
    'new_30d',         (SELECT count(*)::int FROM ov WHERE first_seen_at >= now() - interval '30 days'),
    'closed_7d',       (SELECT count(*)::int FROM public.job_opportunities j JOIN public.company_career_sites c ON c.id=j.company_career_site_id WHERE j.status='closed' AND j.closed_at>=now()-interval '7 days' AND c.is_scrape_enabled=true),
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
$function$;
