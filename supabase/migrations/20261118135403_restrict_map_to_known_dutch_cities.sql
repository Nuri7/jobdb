-- Unknown or foreign remote cities remain searchable, but must not be plotted as Dutch places.
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
    FROM open_jobs WHERE city IS NOT NULL AND EXISTS (SELECT 1 FROM public.city_coords cc WHERE cc.city=open_jobs.city AND cc.source='pdok')
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
    'located',   (SELECT count(*)::int FROM open_jobs WHERE city IS NOT NULL AND EXISTS (SELECT 1 FROM public.city_coords cc WHERE cc.city=open_jobs.city AND cc.source='pdok'))
  );
$function$;


SELECT public.fairjobs_refresh_market_metrics();
