-- Create scraper settings table
CREATE TABLE public.scraper_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scraper_settings ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Anyone can view scraper settings"
  ON public.scraper_settings
  FOR SELECT
  USING (true);

-- Allow public update access
CREATE POLICY "Anyone can update scraper settings"
  ON public.scraper_settings
  FOR UPDATE
  USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_scraper_settings_updated_at
  BEFORE UPDATE ON public.scraper_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings
INSERT INTO public.scraper_settings (setting_key, setting_value, description) VALUES
  ('max_pages', '20', 'Maximum number of listing pages to scrape per company'),
  ('max_jobs', '150', 'Maximum number of job detail pages to scrape per company'),
  ('wait_time', '3000', 'Time to wait for JavaScript rendering (milliseconds)'),
  ('job_url_patterns', '["job", "vacanc", "position", "opening", "vacature", "werk"]', 'Keywords to identify job URLs'),
  ('excluded_domains', '["linkedin.com", "facebook.com", "twitter.com", "instagram.com"]', 'Domains to exclude from scraping'),
  ('location_keywords', '["amsterdam", "rotterdam", "utrecht", "the hague", "eindhoven", "den haag", "leiden", "delft", "groningen", "maastricht"]', 'Keywords to detect job locations'),
  ('remote_keywords', '["remote", "thuiswerk", "hybrid", "work from home", "wfh"]', 'Keywords to detect remote work');