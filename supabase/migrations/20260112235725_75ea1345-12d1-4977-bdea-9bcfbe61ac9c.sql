-- Add column to track skipped URLs during scraping
ALTER TABLE public.scrape_history 
ADD COLUMN skipped_urls jsonb DEFAULT '[]'::jsonb;