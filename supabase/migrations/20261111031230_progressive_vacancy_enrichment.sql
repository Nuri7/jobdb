ALTER TABLE public.job_opportunities ADD COLUMN IF NOT EXISTS detail_checked_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_job_missing_description ON public.job_opportunities (detail_checked_at ASC NULLS FIRST, first_seen_at DESC)
WHERE status = 'open' AND verified = true AND is_foreign = false AND description IS NULL;
