-- Keep fuzzy/global ranking, but prefilter cheaply before scoring. The first implementation ran
-- similarity functions for every public row and was correct but too slow on the nano database.

BEGIN;

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
  WITH input AS (
    SELECT
      cardinality(coalesce(p_terms, ARRAY[]::text[])) AS term_count,
      ARRAY(SELECT lower(term) FROM unnest(coalesce(p_terms, ARRAY[]::text[])) AS term) AS terms,
      ARRAY(SELECT lower(term) || '%' FROM unnest(coalesce(p_terms, ARRAY[]::text[])) AS term) AS prefix_patterns,
      ARRAY(SELECT '%' || lower(term) || '%' FROM unnest(coalesce(p_terms, ARRAY[]::text[])) AS term) AS contains_patterns,
      lower(p_terms[1]) AS primary_term,
      CASE WHEN cardinality(coalesce(p_terms, ARRAY[]::text[])) > 0
        THEN websearch_to_tsquery('simple', unaccent(array_to_string(p_terms, ' OR ')))
        ELSE NULL::tsquery
      END AS query
  ),
  fts_ids AS MATERIALIZED (
    SELECT j.id
    FROM public.job_opportunities j CROSS JOIN input
    WHERE input.term_count > 0 AND j.search_vector @@ input.query
  ),
  company_ids AS MATERIALIZED (
    SELECT j.id
    FROM public.job_opportunities j
    JOIN public.company_career_sites c ON c.id = j.company_career_site_id
    CROSS JOIN input
    WHERE input.term_count > 0 AND c.company_name ILIKE ANY(input.contains_patterns)
  ),
  fuzzy_ids AS MATERIALIZED (
    SELECT j.id
    FROM public.job_opportunities j CROSS JOIN input
    WHERE input.term_count > 0
      AND NOT EXISTS (SELECT 1 FROM fts_ids)
      AND NOT EXISTS (SELECT 1 FROM company_ids)
      AND j.job_title % input.primary_term
    ORDER BY similarity(j.job_title, input.primary_term) DESC
    LIMIT 2000
  ),
  candidate_ids AS MATERIALIZED (
    SELECT matches.id, max(matches.base_score)::real AS base_score
    FROM (
      SELECT id, 68::real AS base_score FROM fts_ids
      UNION ALL
      SELECT id, 80::real AS base_score FROM company_ids
      UNION ALL
      SELECT id, 58::real AS base_score FROM fuzzy_ids
      UNION ALL
      SELECT j.id, 70::real AS base_score
      FROM public.job_opportunities j CROSS JOIN input
      WHERE input.term_count = 0
        AND (p_status = 'all' OR j.status = p_status)
        AND (NOT p_verified_only OR j.verified = true)
        AND (NOT p_nl_only OR j.is_foreign = false)
    ) matches
    GROUP BY matches.id
  ),
  filtered AS (
    SELECT
      j.id, j.job_title, j.posted_date, j.first_seen_at, j.scraped_at,
      c.company_name, input.term_count, input.terms, input.prefix_patterns,
      input.contains_patterns, input.primary_term, candidate.base_score
    FROM public.job_opportunities j
    JOIN candidate_ids candidate ON candidate.id = j.id
    JOIN public.company_career_sites c ON c.id = j.company_career_site_id
    CROSS JOIN input
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
      AND (p_has_salary IS NULL OR NOT p_has_salary OR j.salary_min IS NOT NULL OR (j.salary_range IS NOT NULL AND j.salary_range !~* '^(EUR|€)?\s*0(?:\D|$)'))
      AND (p_ats_only IS NULL OR NOT p_ats_only OR c.source_type LIKE 'ats:%')
  ),
  scored AS (
    SELECT
      filtered.id,
      filtered.posted_date,
      filtered.first_seen_at,
      filtered.scraped_at,
      CASE
        WHEN filtered.term_count = 0 THEN 70::real
        WHEN lower(filtered.job_title) = ANY(filtered.terms) THEN 100::real
        WHEN lower(filtered.job_title) LIKE ANY(filtered.prefix_patterns) THEN 95::real
        WHEN lower(filtered.job_title) LIKE ANY(filtered.contains_patterns) THEN 84::real
        WHEN lower(filtered.company_name) LIKE ANY(filtered.contains_patterns) THEN 80::real
        WHEN filtered.base_score >= 80 THEN 80::real
        WHEN filtered.base_score >= 68 THEN 68::real
        ELSE (58 + similarity(lower(filtered.job_title), filtered.primary_term) * 15)::real
      END AS score,
      CASE
        WHEN filtered.term_count = 0 THEN 'fresh vacancy'
        WHEN lower(filtered.job_title) = ANY(filtered.terms) THEN 'exact title'
        WHEN lower(filtered.job_title) LIKE ANY(filtered.prefix_patterns) THEN 'title starts with query'
        WHEN lower(filtered.job_title) LIKE ANY(filtered.contains_patterns) THEN 'title phrase match'
        WHEN lower(filtered.company_name) LIKE ANY(filtered.contains_patterns) THEN 'company match'
        WHEN filtered.base_score >= 80 THEN 'company match'
        WHEN filtered.base_score >= 68 THEN 'skills or description match'
        ELSE 'similar title'
      END AS reason
    FROM filtered
  ),
  ranked AS (
    SELECT scored.*, count(*) OVER () AS n
    FROM scored
  )
  SELECT ranked.id, ranked.score, ranked.reason, ranked.n
  FROM ranked
  ORDER BY ranked.score DESC,
    ranked.first_seen_at DESC,
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
  WITH input AS (
    SELECT
      cardinality(coalesce(p_terms, ARRAY[]::text[])) AS term_count,
      ARRAY(SELECT '%' || lower(term) || '%' FROM unnest(coalesce(p_terms, ARRAY[]::text[])) AS term) AS contains_patterns,
      lower(p_terms[1]) AS primary_term,
      CASE WHEN cardinality(coalesce(p_terms, ARRAY[]::text[])) > 0
        THEN websearch_to_tsquery('simple', unaccent(array_to_string(p_terms, ' OR ')))
        ELSE NULL::tsquery
      END AS query
  ),
  fts_ids AS MATERIALIZED (
    SELECT j.id
    FROM public.job_opportunities j CROSS JOIN input
    WHERE input.term_count > 0 AND j.search_vector @@ input.query
  ),
  company_ids AS MATERIALIZED (
    SELECT j.id
    FROM public.job_opportunities j
    JOIN public.company_career_sites c ON c.id = j.company_career_site_id
    CROSS JOIN input
    WHERE input.term_count > 0 AND c.company_name ILIKE ANY(input.contains_patterns)
  ),
  fuzzy_ids AS MATERIALIZED (
    SELECT j.id
    FROM public.job_opportunities j CROSS JOIN input
    WHERE input.term_count > 0
      AND NOT EXISTS (SELECT 1 FROM fts_ids)
      AND NOT EXISTS (SELECT 1 FROM company_ids)
      AND j.job_title % input.primary_term
    ORDER BY similarity(j.job_title, input.primary_term) DESC
    LIMIT 2000
  ),
  candidate_ids AS MATERIALIZED (
    SELECT id FROM fts_ids
    UNION
    SELECT id FROM company_ids
    UNION
    SELECT id FROM fuzzy_ids
    UNION
    SELECT j.id
    FROM public.job_opportunities j CROSS JOIN input
    WHERE input.term_count = 0 AND j.status = 'open' AND j.verified = true AND j.is_foreign = false
  ),
  matched AS MATERIALIZED (
    SELECT
      j.employment_type_normalized, j.experience_level_normalized, j.workplace_type,
      j.province, j.salary_min, j.salary_range, j.is_internship
    FROM public.job_opportunities j
    JOIN candidate_ids candidate ON candidate.id = j.id
    JOIN public.company_career_sites c ON c.id = j.company_career_site_id
    CROSS JOIN input
    WHERE j.status = 'open' AND j.verified = true AND j.is_foreign = false
      AND (p_posted_since IS NULL OR j.first_seen_at >= p_posted_since)
      AND (p_location IS NULL OR j.location ILIKE '%' || p_location || '%')
      AND (p_cities IS NULL OR cardinality(p_cities) = 0 OR j.city = ANY(p_cities))
      AND (p_company_ids IS NULL OR j.company_career_site_id = ANY(p_company_ids))
      AND (p_company_id IS NULL OR j.company_career_site_id = p_company_id)
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
    'salary', jsonb_build_object('available', (SELECT count(*) FROM matched WHERE salary_min IS NOT NULL OR salary_range IS NOT NULL)),
    'internship', jsonb_build_object('available', (SELECT count(*) FROM matched WHERE is_internship = true))
  );
$$;

REVOKE ALL ON FUNCTION public.fairjobs_search_jobs(text[], integer, integer, timestamptz, text, text[], uuid[], uuid, text[], text[], text[], boolean, boolean, boolean, text, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fairjobs_search_facets(text[], timestamptz, text, text[], uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fairjobs_search_jobs(text[], integer, integer, timestamptz, text, text[], uuid[], uuid, text[], text[], text[], boolean, boolean, boolean, text, boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fairjobs_search_facets(text[], timestamptz, text, text[], uuid[], uuid) TO service_role;

COMMIT;
