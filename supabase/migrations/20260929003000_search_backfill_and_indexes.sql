-- Backfill search/facet derivations after the additive schema migration, then index the populated
-- values. This is separate so the live deployment can backfill in small, observable batches.

UPDATE public.job_opportunities
SET job_title = job_title
WHERE search_vector IS NULL
  AND status = 'open'
  AND verified = true
  AND is_foreign = false;

CREATE INDEX IF NOT EXISTS idx_job_opps_public_search_vector
  ON public.job_opportunities USING gin (search_vector)
  WHERE status = 'open' AND verified = true AND is_foreign = false;

CREATE INDEX IF NOT EXISTS idx_job_opps_public_title_trgm
  ON public.job_opportunities USING gin (lower(job_title) gin_trgm_ops)
  WHERE status = 'open' AND verified = true AND is_foreign = false;
