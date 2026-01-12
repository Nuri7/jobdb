-- Add jobs_removed column to track stale job deletions
ALTER TABLE public.scrape_history 
ADD COLUMN jobs_removed integer DEFAULT 0;