-- Build concurrently in production before recording this migration.
CREATE INDEX IF NOT EXISTS idx_job_opps_enrichment_queue
 ON public.job_opportunities(detail_checked_at ASC NULLS FIRST,first_seen_at DESC)
 WHERE status='open' AND verified=true AND is_foreign=false
 AND (description IS NULL OR location IS NULL OR country_code IS NULL);
