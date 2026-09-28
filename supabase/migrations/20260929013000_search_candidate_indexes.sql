-- Full indexes let the candidate union stay index-backed even when an admin requests a wider
-- status/verification scope than the public partial indexes cover. NULL vectors are not stored,
-- so this remains compact after the public-only historical backfill.

CREATE INDEX IF NOT EXISTS idx_job_opps_search_vector_all
  ON public.job_opportunities USING gin (search_vector);

CREATE INDEX IF NOT EXISTS idx_company_career_sites_name_trgm
  ON public.company_career_sites USING gin (company_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_job_opps_coverage
  ON public.job_opportunities (status, verified, is_foreign, first_seen_at DESC);
