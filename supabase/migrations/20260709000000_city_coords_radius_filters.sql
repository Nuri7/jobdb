-- Radius search ("within N km of a city") + faster filter columns for /api/jobs.
--
-- city_coords maps a normalized city name (matching job_opportunities.city) to a lat/lng.
-- It is backfilled by geocoding the distinct job cities via the PDOK Locatieserver
-- (see scripts; foreign / "remote" strings resolve to nothing and are pruned).
create table if not exists public.city_coords (
  city         text primary key,
  lat          double precision not null,
  lng          double precision not null,
  display_name text,
  province     text,
  source       text default 'pdok',
  updated_at   timestamptz default now()
);

alter table public.city_coords enable row level security;
drop policy if exists city_coords_public_read on public.city_coords;
create policy city_coords_public_read on public.city_coords for select using (true);
grant select on public.city_coords to anon, authenticated;

-- Bounding-box prefilter for the radius query.
create index if not exists idx_city_coords_latlng on public.city_coords (lat, lng);

-- employment_type / experience_level are free-text and inconsistent ("full-time" vs "fulltime"
-- vs "voltijds"), so filters use ilike '%...%' over an OR of variants. Trigram GIN indexes keep
-- those substring filters from forcing full table scans (a broad one like fulltime timed out).
create extension if not exists pg_trgm;
create index if not exists idx_job_opps_emptype_trgm  on public.job_opportunities using gin (employment_type gin_trgm_ops);
create index if not exists idx_job_opps_explevel_trgm on public.job_opportunities using gin (experience_level gin_trgm_ops);
