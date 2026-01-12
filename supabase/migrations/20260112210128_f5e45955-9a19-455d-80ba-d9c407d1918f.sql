-- Enable required extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Add scheduling columns to company_career_sites
ALTER TABLE public.company_career_sites
ADD COLUMN IF NOT EXISTS scrape_schedule TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_scheduled_scrape_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_scrape_enabled BOOLEAN DEFAULT true;