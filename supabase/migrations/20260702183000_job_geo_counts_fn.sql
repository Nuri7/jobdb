-- Aggregated job counts per city and per province (verified open jobs), for map views.
-- Scans the filtered set ONCE (MATERIALIZED CTE) instead of 4x, and raises the
-- per-call statement_timeout so it survives even while the table still holds the
-- large unverified/junk backlog. mode() picks the dominant province per city.
CREATE OR REPLACE FUNCTION public.job_geo_counts()
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER
SET statement_timeout TO '30s'
AS $$
  WITH open_jobs AS MATERIALIZED (
    SELECT city, province
    FROM public.job_opportunities
    WHERE status = 'open' AND verified = true
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
GRANT EXECUTE ON FUNCTION public.job_geo_counts() TO anon, authenticated, service_role;
