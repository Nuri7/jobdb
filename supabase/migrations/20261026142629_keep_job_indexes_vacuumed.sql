-- Harvesting refreshes many jobs each day. The default 20% vacuum threshold let
-- roughly 149k dead tuples accumulate, forcing exact counts to fetch heap pages
-- for almost every row and hit the API timeout. Clean this table at about 2%
-- churn so its existing count and browse indexes can stay index-only.
ALTER TABLE public.job_opportunities SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_analyze_threshold = 1000
);
