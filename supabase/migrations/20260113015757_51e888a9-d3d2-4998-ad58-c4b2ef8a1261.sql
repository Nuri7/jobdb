-- Set default value for is_scrape_enabled to false for new companies
ALTER TABLE public.company_career_sites 
ALTER COLUMN is_scrape_enabled SET DEFAULT false;