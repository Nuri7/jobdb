-- Supports job_geo_counts(): an index-only scan over the open+verified set,
-- covering the two columns the map aggregation reads (province, city).
CREATE INDEX IF NOT EXISTS idx_job_open_verified_geo
  ON public.job_opportunities (province, city)
  WHERE status = 'open' AND verified = true;
