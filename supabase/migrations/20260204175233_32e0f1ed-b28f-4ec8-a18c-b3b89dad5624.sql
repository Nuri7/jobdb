-- Add scrape_config column to store per-company scraping configuration
ALTER TABLE company_career_sites 
ADD COLUMN scrape_config JSONB DEFAULT NULL;

-- Add a comment to document the expected schema
COMMENT ON COLUMN company_career_sites.scrape_config IS 'Per-company scraping configuration: {scrape_mode, extraction_prompt, click_selectors, wait_time, job_url_patterns, excluded_url_patterns, notes}';