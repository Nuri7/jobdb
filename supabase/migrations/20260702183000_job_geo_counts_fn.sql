-- Aggregated job counts per city and per province (verified open jobs), for map views.
CREATE OR REPLACE FUNCTION public.job_geo_counts()
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object(
    'cities', (SELECT coalesce(json_agg(row_to_json(c)), '[]'::json) FROM (
        SELECT city, max(province) AS province, count(*)::int AS count
        FROM public.job_opportunities
        WHERE status = 'open' AND verified = true AND city IS NOT NULL
        GROUP BY city ORDER BY count(*) DESC LIMIT 400) c),
    'provinces', (SELECT coalesce(json_agg(row_to_json(p)), '[]'::json) FROM (
        SELECT province, count(*)::int AS count
        FROM public.job_opportunities
        WHERE status = 'open' AND verified = true AND province IS NOT NULL
        GROUP BY province ORDER BY count(*) DESC) p),
    'total', (SELECT count(*)::int FROM public.job_opportunities WHERE status = 'open' AND verified = true),
    'located', (SELECT count(*)::int FROM public.job_opportunities WHERE status = 'open' AND verified = true AND city IS NOT NULL)
  );
$$;
GRANT EXECUTE ON FUNCTION public.job_geo_counts() TO anon, authenticated, service_role;
