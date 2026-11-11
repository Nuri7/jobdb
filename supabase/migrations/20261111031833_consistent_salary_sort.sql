CREATE OR REPLACE FUNCTION public.fairjobs_discover_jobs(p_terms text[] DEFAULT ARRAY[]::text[], p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_posted_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_location text DEFAULT NULL::text, p_cities text[] DEFAULT NULL::text[], p_company_ids uuid[] DEFAULT NULL::uuid[], p_company_id uuid DEFAULT NULL::uuid, p_employment_types text[] DEFAULT NULL::text[], p_experience_levels text[] DEFAULT NULL::text[], p_workplace_types text[] DEFAULT NULL::text[], p_internship boolean DEFAULT NULL::boolean, p_has_salary boolean DEFAULT NULL::boolean, p_ats_only boolean DEFAULT NULL::boolean, p_status text DEFAULT 'open'::text, p_verified_only boolean DEFAULT true, p_nl_only boolean DEFAULT true, p_discovery jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(id uuid, search_rank real, match_reason text, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET statement_timeout TO '8s'
AS $function$
BEGIN

  -- Empty searches use the selective public indexes directly. Materializing all candidate IDs
  -- before filtering would make a 121-assignment browse scan every vacancy in the database.
  IF cardinality(coalesce(p_terms, ARRAY[]::text[])) = 0 THEN
    RETURN QUERY
    WITH matched AS (
      SELECT j.id, j.first_seen_at, j.scraped_at, j.city, j.salary_min, j.salary_max, j.salary_currency, j.salary_period, j.closing_date,
        count(*) OVER () AS total
      FROM public.job_opportunities j
      JOIN public.company_career_sites c ON c.id = j.company_career_site_id
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
      AND (p_discovery->>'mode' IS DISTINCT FROM 'freelance' OR j.employment_type_normalized = 'freelance')
      AND (p_discovery->>'mode' IS DISTINCT FROM 'employment' OR j.employment_type_normalized IS DISTINCT FROM 'freelance')
      AND (j.closing_date IS NULL OR j.closing_date >= (now() AT TIME ZONE 'Europe/Amsterdam')::date)
      AND (j.freelance_details->>'closing_at' IS NULL OR (j.freelance_details->>'closing_at')::timestamptz > now())
      AND (p_discovery->>'new_since' IS NULL OR j.first_seen_at > (p_discovery->>'new_since')::timestamptz)
      AND (p_discovery->>'pay_min' IS NULL OR (
        j.salary_period = coalesce(p_discovery->>'pay_period', 'month')
        AND coalesce(j.salary_currency, 'EUR') = 'EUR'
        AND coalesce(j.salary_max, j.salary_min) >= (p_discovery->>'pay_min')::numeric))
      AND (p_discovery->>'hours_min' IS NULL OR (j.freelance_details->>'hours_max')::numeric >= (p_discovery->>'hours_min')::numeric)
      AND (p_discovery->>'hours_max' IS NULL OR (j.freelance_details->>'hours_min')::numeric <= (p_discovery->>'hours_max')::numeric)
      AND (p_discovery->>'start_before' IS NULL OR (j.freelance_details->>'start_date')::date <= (p_discovery->>'start_before')::date)
      AND (p_discovery->>'closing_within' IS NULL OR j.closing_date <= (now() AT TIME ZONE 'Europe/Amsterdam')::date + (p_discovery->>'closing_within')::integer)
    )
    SELECT matched.id, 70::real, 'fresh vacancy'::text, matched.total
    FROM matched
    ORDER BY
      CASE WHEN p_discovery->>'sort' = 'salary' AND matched.salary_period = coalesce(p_discovery->>'pay_period', 'month') AND coalesce(matched.salary_currency, 'EUR') = 'EUR' THEN coalesce(matched.salary_max, matched.salary_min) END DESC NULLS LAST,
      CASE WHEN p_discovery->>'sort' = 'deadline' THEN matched.closing_date END ASC NULLS LAST,
      CASE WHEN p_discovery->>'sort' = 'distance' THEN array_position(p_cities, matched.city) END ASC NULLS LAST,
      matched.first_seen_at DESC, matched.scraped_at DESC, matched.id
    LIMIT greatest(1, least(p_limit, 100)) OFFSET greatest(0, p_offset);
    RETURN;
  END IF;

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
      j.id, j.job_title, j.posted_date, j.first_seen_at, j.scraped_at, j.city, j.salary_min, j.salary_max, j.salary_currency, j.salary_period, j.closing_date,
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
      AND (p_discovery->>'mode' IS DISTINCT FROM 'freelance' OR j.employment_type_normalized = 'freelance')
      AND (p_discovery->>'mode' IS DISTINCT FROM 'employment' OR j.employment_type_normalized IS DISTINCT FROM 'freelance')
      AND (j.closing_date IS NULL OR j.closing_date >= (now() AT TIME ZONE 'Europe/Amsterdam')::date)
      AND (j.freelance_details->>'closing_at' IS NULL OR (j.freelance_details->>'closing_at')::timestamptz > now())
      AND (p_discovery->>'new_since' IS NULL OR j.first_seen_at > (p_discovery->>'new_since')::timestamptz)
      AND (p_discovery->>'pay_min' IS NULL OR (
        j.salary_period = coalesce(p_discovery->>'pay_period', 'month')
        AND coalesce(j.salary_currency, 'EUR') = 'EUR'
        AND coalesce(j.salary_max, j.salary_min) >= (p_discovery->>'pay_min')::numeric))
      AND (p_discovery->>'hours_min' IS NULL OR (j.freelance_details->>'hours_max')::numeric >= (p_discovery->>'hours_min')::numeric)
      AND (p_discovery->>'hours_max' IS NULL OR (j.freelance_details->>'hours_min')::numeric <= (p_discovery->>'hours_max')::numeric)
      AND (p_discovery->>'start_before' IS NULL OR (j.freelance_details->>'start_date')::date <= (p_discovery->>'start_before')::date)
      AND (p_discovery->>'closing_within' IS NULL OR j.closing_date <= (now() AT TIME ZONE 'Europe/Amsterdam')::date + (p_discovery->>'closing_within')::integer)

  ),
  scored AS (
    SELECT
      filtered.id,
      filtered.posted_date,
      filtered.first_seen_at,
      filtered.scraped_at, filtered.city, filtered.salary_min, filtered.salary_max, filtered.salary_currency, filtered.salary_period, filtered.closing_date,
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
  ORDER BY
    CASE WHEN p_discovery->>'sort' = 'salary' AND ranked.salary_period = coalesce(p_discovery->>'pay_period', 'month') AND coalesce(ranked.salary_currency, 'EUR') = 'EUR' THEN coalesce(ranked.salary_max, ranked.salary_min) END DESC NULLS LAST,
    CASE WHEN p_discovery->>'sort' = 'deadline' THEN ranked.closing_date END ASC NULLS LAST,
    CASE WHEN p_discovery->>'sort' = 'distance' THEN array_position(p_cities, ranked.city) END ASC NULLS LAST,
    CASE WHEN coalesce(p_discovery->>'sort', 'relevance') = 'relevance' THEN ranked.score END DESC,
    ranked.first_seen_at DESC,
    ranked.scraped_at DESC,
    ranked.id
  LIMIT greatest(1, least(p_limit, 100))
  OFFSET greatest(0, p_offset);
END;
$function$;
