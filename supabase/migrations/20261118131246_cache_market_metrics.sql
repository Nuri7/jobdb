-- Recounts run in the background; public aggregate RPCs read one cached row.
CREATE TABLE public.job_market_metrics (
  metric text PRIMARY KEY CHECK(metric IN ('stats','geo')),
  payload jsonb NOT NULL,
  computed_at timestamptz NOT NULL
);
ALTER TABLE public.job_market_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_market_metrics FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.job_market_metrics TO service_role;

CREATE OR REPLACE FUNCTION public.job_geo_counts_live()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO ''
 SET statement_timeout TO '120s'
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

CREATE OR REPLACE FUNCTION public.job_stats_live()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO ''
 SET statement_timeout TO '120s'
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

REVOKE ALL ON FUNCTION public.job_stats_live(), public.job_geo_counts_live() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_stats_live(), public.job_geo_counts_live() TO service_role;

CREATE FUNCTION public.fairjobs_refresh_market_metrics() RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET statement_timeout='120s'
AS $function$
DECLARE snapshot_time timestamptz := statement_timestamp(); stats jsonb; geo jsonb;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('fairjobs-market-metrics')) THEN RETURN false; END IF;
  stats := public.job_stats_live()::jsonb;
  geo := public.job_geo_counts_live()::jsonb;
  INSERT INTO public.job_market_metrics(metric,payload,computed_at)
  VALUES ('stats',stats,snapshot_time),('geo',geo,snapshot_time)
  ON CONFLICT(metric) DO UPDATE SET payload=excluded.payload,computed_at=excluded.computed_at;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.fairjobs_refresh_market_metrics() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fairjobs_refresh_market_metrics() TO service_role;

-- Seed before switching readers; a failed recount rolls the entire migration back.
SELECT public.fairjobs_refresh_market_metrics();
CREATE OR REPLACE FUNCTION public.job_stats() RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
 SELECT (payload || jsonb_build_object('generated_at',computed_at))::json
 FROM public.job_market_metrics WHERE metric='stats';
$function$;
CREATE OR REPLACE FUNCTION public.job_geo_counts() RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
 SELECT (payload || jsonb_build_object('generated_at',computed_at))::json
 FROM public.job_market_metrics WHERE metric='geo';
$function$;
SELECT cron.schedule('fairjobs-market-metrics','*/15 * * * *','SELECT public.fairjobs_refresh_market_metrics()');
