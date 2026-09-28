-- Plain browsing does not need the text-search candidate union. Keep the same signature as the
-- ranked function so the Edge API can switch RPC names without maintaining two argument maps.

CREATE INDEX IF NOT EXISTS idx_job_opps_public_first_seen
  ON public.job_opportunities (first_seen_at DESC, scraped_at DESC, id)
  WHERE status = 'open' AND verified = true AND is_foreign = false;

CREATE OR REPLACE FUNCTION public.fairjobs_browse_jobs(
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
  WITH total AS (
    SELECT count(*)::bigint AS n
    FROM public.job_opportunities j
    WHERE j.status = 'open' AND j.verified = true AND j.is_foreign = false
      AND (p_posted_since IS NULL OR j.first_seen_at >= p_posted_since)
      AND (p_location IS NULL OR j.location ILIKE '%' || p_location || '%')
      AND (p_cities IS NULL OR cardinality(p_cities) = 0 OR j.city = ANY(p_cities))
      AND (p_company_ids IS NULL OR j.company_career_site_id = ANY(p_company_ids))
      AND (p_company_id IS NULL OR j.company_career_site_id = p_company_id)
      AND (p_employment_types IS NULL OR j.employment_type_normalized = ANY(p_employment_types))
      AND (p_experience_levels IS NULL OR j.experience_level_normalized = ANY(p_experience_levels))
      AND (p_workplace_types IS NULL OR j.workplace_type = ANY(p_workplace_types))
      AND (p_internship IS NULL OR j.is_internship = p_internship)
      AND (p_has_salary IS NULL OR NOT p_has_salary OR j.salary_min IS NOT NULL OR (j.salary_range IS NOT NULL AND j.salary_range !~* '^(EUR|€)?\s*0(?:\D|$)'))
      AND (p_ats_only IS NULL OR NOT p_ats_only OR EXISTS (
        SELECT 1 FROM public.company_career_sites c
        WHERE c.id = j.company_career_site_id AND c.source_type LIKE 'ats:%'
      ))
  ),
  page AS (
    SELECT j.id, j.first_seen_at, j.scraped_at
    FROM public.job_opportunities j
    WHERE j.status = 'open' AND j.verified = true AND j.is_foreign = false
      AND (p_posted_since IS NULL OR j.first_seen_at >= p_posted_since)
      AND (p_location IS NULL OR j.location ILIKE '%' || p_location || '%')
      AND (p_cities IS NULL OR cardinality(p_cities) = 0 OR j.city = ANY(p_cities))
      AND (p_company_ids IS NULL OR j.company_career_site_id = ANY(p_company_ids))
      AND (p_company_id IS NULL OR j.company_career_site_id = p_company_id)
      AND (p_employment_types IS NULL OR j.employment_type_normalized = ANY(p_employment_types))
      AND (p_experience_levels IS NULL OR j.experience_level_normalized = ANY(p_experience_levels))
      AND (p_workplace_types IS NULL OR j.workplace_type = ANY(p_workplace_types))
      AND (p_internship IS NULL OR j.is_internship = p_internship)
      AND (p_has_salary IS NULL OR NOT p_has_salary OR j.salary_min IS NOT NULL OR (j.salary_range IS NOT NULL AND j.salary_range !~* '^(EUR|€)?\s*0(?:\D|$)'))
      AND (p_ats_only IS NULL OR NOT p_ats_only OR EXISTS (
        SELECT 1 FROM public.company_career_sites c
        WHERE c.id = j.company_career_site_id AND c.source_type LIKE 'ats:%'
      ))
    ORDER BY j.first_seen_at DESC, j.scraped_at DESC, j.id
    LIMIT greatest(1, least(p_limit, 100))
    OFFSET greatest(0, p_offset)
  )
  SELECT page.id, 70::real, 'fresh vacancy'::text, total.n
  FROM page CROSS JOIN total
  ORDER BY page.first_seen_at DESC, page.scraped_at DESC, page.id;
$$;

REVOKE ALL ON FUNCTION public.fairjobs_browse_jobs(text[], integer, integer, timestamptz, text, text[], uuid[], uuid, text[], text[], text[], boolean, boolean, boolean, text, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fairjobs_browse_jobs(text[], integer, integer, timestamptz, text, text[], uuid[], uuid, text[], text[], text[], boolean, boolean, boolean, text, boolean, boolean) TO service_role;

-- Hot path for the landing page and static-page generator: no facet filters, just honest
-- first-seen recency. Keeping optional predicates out lets Postgres use the partial sort index.
CREATE OR REPLACE FUNCTION public.fairjobs_browse_latest(
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0,
  p_posted_since timestamptz DEFAULT NULL
)
RETURNS TABLE(id uuid, search_rank real, match_reason text, total_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH total AS (
    SELECT count(*)::bigint AS n
    FROM public.job_opportunities
    WHERE status = 'open' AND verified = true AND is_foreign = false
      AND first_seen_at >= coalesce(p_posted_since, '-infinity'::timestamptz)
  ),
  page AS (
    SELECT id, first_seen_at, scraped_at
    FROM public.job_opportunities
    WHERE status = 'open' AND verified = true AND is_foreign = false
      AND first_seen_at >= coalesce(p_posted_since, '-infinity'::timestamptz)
    ORDER BY first_seen_at DESC, scraped_at DESC, id
    LIMIT greatest(1, least(p_limit, 100))
    OFFSET greatest(0, p_offset)
  )
  SELECT page.id, 70::real, 'fresh vacancy'::text, total.n
  FROM page CROSS JOIN total
  ORDER BY page.first_seen_at DESC, page.scraped_at DESC, page.id;
$$;

REVOKE ALL ON FUNCTION public.fairjobs_browse_latest(integer, integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fairjobs_browse_latest(integer, integer, timestamptz) TO service_role;
