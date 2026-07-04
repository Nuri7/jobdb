-- Supports the public /jobs query: WHERE status='open' AND verified=true
-- ORDER BY scraped_at DESC, id. Without this the ordered scan over the whole
-- (growing) table blew the anon statement_timeout.
CREATE INDEX IF NOT EXISTS idx_job_open_verified_recent
  ON public.job_opportunities (scraped_at DESC, id)
  WHERE status = 'open' AND verified = true;
