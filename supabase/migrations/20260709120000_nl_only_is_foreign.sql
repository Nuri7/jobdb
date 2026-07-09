-- NL-only serve gate for /api/jobs (this is a Netherlands job board).
--
-- A job is "foreign" only when it has a city that is NOT a known NL city (absent from city_coords),
-- AND no Dutch province, AND is not remote, AND its location text doesn't say NL. Remote jobs and
-- location-unknown jobs are kept. /api/jobs filters `is_foreign = false` by default (?country=all
-- bypasses). A plain column keeps the filter reliably AND-combinable with the search .or() group.

-- Make province a complete NL flag: backfill it from city_coords for any NL-city job missing it
-- (Fryslân -> Friesland to match the existing convention).
update public.job_opportunities j
set province = case when cc.province = 'Fryslân' then 'Friesland' else cc.province end
from public.city_coords cc
where j.city = cc.city and j.province is null;

alter table public.job_opportunities add column if not exists is_foreign boolean not null default false;

create or replace function public.set_job_is_foreign() returns trigger as $$
begin
  new.is_foreign := (
    new.city is not null
    and coalesce(new.is_remote, false) = false
    and new.province is null
    and not exists (select 1 from public.city_coords cc where cc.city = new.city)
    and (new.location is null or new.location !~* '(nederland|netherlands|landelijk)')
  );
  return new;
end; $$ language plpgsql;

drop trigger if exists trg_set_job_is_foreign on public.job_opportunities;
create trigger trg_set_job_is_foreign before insert or update on public.job_opportunities
for each row execute function public.set_job_is_foreign();

-- One-time backfill for existing rows.
update public.job_opportunities j set is_foreign = (
  j.city is not null
  and coalesce(j.is_remote, false) = false
  and j.province is null
  and not exists (select 1 from public.city_coords cc where cc.city = j.city)
  and (j.location is null or j.location !~* '(nederland|netherlands|landelijk)')
);
