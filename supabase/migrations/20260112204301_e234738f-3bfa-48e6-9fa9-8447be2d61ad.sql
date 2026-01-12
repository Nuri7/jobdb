-- Add columns for tracking scrape progress
ALTER TABLE public.company_career_sites
ADD COLUMN IF NOT EXISTS scrape_progress_phase TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS scrape_progress_pages_scraped INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS scrape_progress_jobs_found INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS scrape_progress_current_page TEXT DEFAULT NULL;

-- Enable realtime for company_career_sites table
ALTER PUBLICATION supabase_realtime ADD TABLE public.company_career_sites;