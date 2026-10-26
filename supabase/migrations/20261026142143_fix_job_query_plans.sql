-- SQL-language functions were reusing generic plans for optional filters. On the
-- growing jobs table, browse/search/facet requests could exceed the API's 8s timeout.
-- PL/pgSQL with a per-call custom plan lets Postgres simplify inactive predicates
-- and use the existing partial indexes. Keep signatures and service-only grants.

BEGIN;

CREATE OR REPLACE FUNCTION public.fairjobs_browse_jobs(p_terms text[] DEFAULT ARRAY[]::text[], p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_posted_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_location text DEFAULT NULL::text, p_cities text[] DEFAULT NULL::text[], p_company_ids uuid[] DEFAULT NULL::uuid[], p_company_id uuid DEFAULT NULL::uuid, p_employment_types text[] DEFAULT NULL::text[], p_experience_levels text[] DEFAULT NULL::text[], p_workplace_types text[] DEFAULT NULL::text[], p_internship boolean DEFAULT NULL::boolean, p_has_salary boolean DEFAULT NULL::boolean, p_ats_only boolean DEFAULT NULL::boolean, p_status text DEFAULT 'open'::text, p_verified_only boolean DEFAULT true, p_nl_only boolean DEFAULT true)
 RETURNS TABLE(id uuid, search_rank real, match_reason text, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
BEGIN
  RETURN QUERY
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
END;
$function$;

CREATE OR REPLACE FUNCTION public.fairjobs_search_facets(p_terms text[] DEFAULT ARRAY[]::text[], p_posted_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_location text DEFAULT NULL::text, p_cities text[] DEFAULT NULL::text[], p_company_ids uuid[] DEFAULT NULL::uuid[], p_company_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
BEGIN
  IF cardinality(coalesce(p_terms, ARRAY[]::text[])) = 0 THEN
    RETURN (
  WITH matched AS MATERIALIZED (
    SELECT
      j.employment_type_normalized, j.experience_level_normalized, j.workplace_type,
      j.province, j.salary_min, j.salary_range, j.is_internship
    FROM public.job_opportunities j
    JOIN public.company_career_sites c ON c.id = j.company_career_site_id
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
  )
    );
  END IF;
  RETURN (
  WITH input AS NOT MATERIALIZED (
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
    WHERE j.status = 'open' AND j.verified = true AND j.is_foreign = false
      AND input.term_count > 0 AND j.search_vector @@ input.query
  ),
  company_ids AS MATERIALIZED (
    SELECT j.id
    FROM public.job_opportunities j
    JOIN public.company_career_sites c ON c.id = j.company_career_site_id
    CROSS JOIN input
    WHERE j.status = 'open' AND j.verified = true AND j.is_foreign = false
      AND input.term_count > 0 AND c.company_name ILIKE ANY(input.contains_patterns)
  ),
  fuzzy_ids AS MATERIALIZED (
    SELECT j.id
    FROM public.job_opportunities j CROSS JOIN input
    WHERE j.status = 'open' AND j.verified = true AND j.is_foreign = false
      AND input.term_count > 0
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
  )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fairjobs_search_jobs(p_terms text[] DEFAULT ARRAY[]::text[], p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_posted_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_location text DEFAULT NULL::text, p_cities text[] DEFAULT NULL::text[], p_company_ids uuid[] DEFAULT NULL::uuid[], p_company_id uuid DEFAULT NULL::uuid, p_employment_types text[] DEFAULT NULL::text[], p_experience_levels text[] DEFAULT NULL::text[], p_workplace_types text[] DEFAULT NULL::text[], p_internship boolean DEFAULT NULL::boolean, p_has_salary boolean DEFAULT NULL::boolean, p_ats_only boolean DEFAULT NULL::boolean, p_status text DEFAULT 'open'::text, p_verified_only boolean DEFAULT true, p_nl_only boolean DEFAULT true)
 RETURNS TABLE(id uuid, search_rank real, match_reason text, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
BEGIN
  RETURN QUERY
  WITH input AS NOT MATERIALIZED (
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
    WHERE (p_status = 'all' OR j.status = p_status)
      AND (NOT p_verified_only OR j.verified = true)
      AND (NOT p_nl_only OR j.is_foreign = false)
      AND input.term_count > 0 AND j.search_vector @@ input.query
  ),
  company_ids AS MATERIALIZED (
    SELECT j.id
    FROM public.job_opportunities j
    JOIN public.company_career_sites c ON c.id = j.company_career_site_id
    CROSS JOIN input
    WHERE (p_status = 'all' OR j.status = p_status)
      AND (NOT p_verified_only OR j.verified = true)
      AND (NOT p_nl_only OR j.is_foreign = false)
      AND input.term_count > 0 AND c.company_name ILIKE ANY(input.contains_patterns)
  ),
  fuzzy_ids AS MATERIALIZED (
    SELECT j.id
    FROM public.job_opportunities j CROSS JOIN input
    WHERE (p_status = 'all' OR j.status = p_status)
      AND (NOT p_verified_only OR j.verified = true)
      AND (NOT p_nl_only OR j.is_foreign = false)
      AND input.term_count > 0
      AND NOT EXISTS (SELECT 1 FROM fts_ids)
      AND NOT EXISTS (SELECT 1 FROM company_ids)
      AND j.job_title % input.primary_term
    ORDER BY similarity(j.job_title, input.primary_term) DESC
    LIMIT 2000
  ),
  candidate_ids AS MATERIALIZED (
    SELECT matches.id, max(matches.base_score)::real AS base_score
    FROM (
      SELECT fts_ids.id, 68::real AS base_score FROM fts_ids
      UNION ALL
      SELECT company_ids.id, 80::real AS base_score FROM company_ids
      UNION ALL
      SELECT fuzzy_ids.id, 58::real AS base_score FROM fuzzy_ids
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
END;
$function$;

-- Compile and execute both facet branches before committing the replacements.
DO $check$
BEGIN
  PERFORM * FROM public.fairjobs_browse_jobs(p_cities => ARRAY['amsterdam'], p_limit => 1);
  PERFORM * FROM public.fairjobs_search_jobs(p_terms => ARRAY['developer'], p_limit => 1);
  PERFORM public.fairjobs_search_facets(p_posted_since => now() - interval '30 days');
  PERFORM public.fairjobs_search_facets(p_terms => ARRAY['developer']);
END;
$check$;

COMMIT;

