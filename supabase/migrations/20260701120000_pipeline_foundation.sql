-- Pipeline foundation: resolver/scheduler state, job lifecycle, provenance, indexes.
-- All statements additive and idempotent — safe on the live database.

-- ============ company_career_sites: resolver + scheduler state ============
ALTER TABLE public.company_career_sites
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS career_page_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_config jsonb,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_check_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS check_interval_hours integer NOT NULL DEFAULT 24;

COMMENT ON COLUMN public.company_career_sites.career_page_status IS
  'unverified | verified | dead | ambiguous — maintained by pipeline/ worker';
COMMENT ON COLUMN public.company_career_sites.source_config IS
  'Pipeline fingerprint: {resolved_url, board_id?, sitemap_url?, listing_urls?, etag?, listing_hash?, last_full_at?, duplicate_of?}';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ccs_career_page_status_chk') THEN
    ALTER TABLE public.company_career_sites
      ADD CONSTRAINT ccs_career_page_status_chk
      CHECK (career_page_status IN ('unverified','verified','dead','ambiguous'));
  END IF;
END $$;

-- Smear the initial resolve/refresh load across the first window
UPDATE public.company_career_sites
SET next_check_at = now() + (random() * interval '4 hours')
WHERE next_check_at <= now();

-- ============ job_opportunities: lifecycle ============
ALTER TABLE public.job_opportunities
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS miss_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS content_hash text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_opps_status_chk') THEN
    ALTER TABLE public.job_opportunities
      ADD CONSTRAINT job_opps_status_chk CHECK (status IN ('open','closed'));
  END IF;
END $$;

-- ============ scrape_history: provenance ============
ALTER TABLE public.scrape_history
  ADD COLUMN IF NOT EXISTS method text;  -- 'edge-firecrawl' | 'pipeline:ats:recruitee' | 'pipeline:sitemap' | ...

-- ============ Indexes ============
-- API hot path: open jobs ordered by recency (matches GET /api/jobs)
CREATE INDEX IF NOT EXISTS idx_job_opps_open_recency
  ON public.job_opportunities (scraped_at DESC, id) WHERE status = 'open';
-- Worker reconcile + per-company open counts
CREATE INDEX IF NOT EXISTS idx_job_opps_company_status
  ON public.job_opportunities (company_career_site_id, status);
-- Due-company picker
CREATE INDEX IF NOT EXISTS idx_ccs_due
  ON public.company_career_sites (next_check_at) WHERE is_scrape_enabled = true;
-- Dashboard history views + retention pruning
CREATE INDEX IF NOT EXISTS idx_scrape_history_started
  ON public.scrape_history (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_history_company_started
  ON public.scrape_history (company_career_site_id, started_at DESC);

-- Trigram index so the /api/jobs ilike/synonym search stays fast at 30k+ rows
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_job_opps_title_trgm
  ON public.job_opportunities USING gin (job_title gin_trgm_ops);

-- ============ Security fix ============
-- Worker uses the service role; nothing legitimate needs anon UPDATE on settings.
-- Known trade-off: the legacy dashboard Settings save (anon client) stops working.
DROP POLICY IF EXISTS "Anyone can update scraper settings" ON public.scraper_settings;

-- ============ FLAGGED, NOT APPLIED (decision item — breaks dashboard delete/import) ============
-- Public anon DELETE/UPDATE policies on job_opportunities / company_career_sites / scrape_history
-- allow anyone with the shipped anon key to wipe data. Requires dashboard auth first:
-- DROP POLICY IF EXISTS "Anyone can delete job opportunities"    ON public.job_opportunities;
-- DROP POLICY IF EXISTS "Anyone can delete company career sites" ON public.company_career_sites;
-- DROP POLICY IF EXISTS "Anyone can delete scrape history"       ON public.scrape_history;
-- DROP POLICY IF EXISTS "Anyone can update company career sites" ON public.company_career_sites;
