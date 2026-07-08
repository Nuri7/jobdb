-- Weekly metrics log: a time series of company/job totals + trailing-7d churn.
-- Each `snapshot` run inserts one row; week-over-week deltas come from consecutive rows.
create table if not exists public.pipeline_snapshots (
  id uuid primary key default gen_random_uuid(),
  taken_at timestamptz not null default now(),
  companies_total integer not null,
  companies_active integer not null,      -- is_scrape_enabled = true
  companies_dead integer not null,        -- career_page_status = 'dead' (soft-removed)
  companies_added_7d integer not null,    -- created_at within trailing 7 days
  jobs_open integer not null,
  jobs_verified_open integer not null,
  jobs_closed_total integer not null,     -- status='closed' archive (never hard-deleted)
  jobs_added_7d integer not null,         -- first_seen_at within trailing 7 days
  jobs_closed_7d integer not null,        -- closed_at within trailing 7 days
  notes text
);

alter table public.pipeline_snapshots enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'pipeline_snapshots' and policyname = 'Anyone can view pipeline snapshots') then
    create policy "Anyone can view pipeline snapshots" on public.pipeline_snapshots for select using (true);
  end if;
end $$;

create index if not exists idx_pipeline_snapshots_taken on public.pipeline_snapshots (taken_at desc);
