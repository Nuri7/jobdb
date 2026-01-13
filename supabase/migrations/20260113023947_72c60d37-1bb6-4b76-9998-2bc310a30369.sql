-- Insert company discovery search queries setting
INSERT INTO public.scraper_settings (setting_key, setting_value, description)
VALUES (
  'discovery_search_queries',
  '["top Dutch companies careers page", "Netherlands tech startups hiring jobs", "Amsterdam companies career opportunities", "Dutch unicorn startups jobs page", "Rotterdam companies vacancies", "Netherlands fintech companies careers", "Dutch software companies job openings", "Netherlands e-commerce companies hiring", "Dutch healthcare companies careers", "Amsterdam startups career page"]'::jsonb,
  'Search queries used by Firecrawl to discover new companies with career pages'
)
ON CONFLICT (setting_key) DO NOTHING;