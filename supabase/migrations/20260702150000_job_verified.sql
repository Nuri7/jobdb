-- Per-job confidence gate: only jobs with strong evidence of being a genuine, applyable
-- vacancy (schema.org JobPosting JSON-LD, an ATS structured adapter, or a heuristic page
-- with a real apply element) are 'verified'. The public API serves ONLY verified jobs, so
-- applyforme never receives landing/category/blog/dead pages.
ALTER TABLE public.job_opportunities
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;

-- API hot path: open AND verified, ordered by recency.
CREATE INDEX IF NOT EXISTS idx_job_opps_verified_open_recency
  ON public.job_opportunities (scraped_at DESC, id)
  WHERE status = 'open' AND verified = true;
