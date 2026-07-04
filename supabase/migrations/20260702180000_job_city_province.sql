-- Normalized geography for maps/filtering: city + province derived from the messy
-- `location` string ("Utrecht, Utrecht", "Breda, Noord-Brabant", "Amsterdam, NL").
ALTER TABLE public.job_opportunities
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS province text;

CREATE INDEX IF NOT EXISTS idx_job_opps_city ON public.job_opportunities (city) WHERE status = 'open' AND verified = true;
CREATE INDEX IF NOT EXISTS idx_job_opps_province ON public.job_opportunities (province) WHERE status = 'open' AND verified = true;
