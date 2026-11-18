# JobDB — Dutch job-market database

Career pages and live job postings for ~4,700 Dutch companies. A crawling
pipeline keeps a per-company view of open vacancies; a dashboard browses them;
a public API serves verified job postings to downstream apps (applyforme).

## Structure

| Path | What it is |
| --- | --- |
| `src/` | Dashboard SPA — Vite + React + TypeScript + shadcn/ui + Tailwind |
| `pipeline/` | Standalone Node 22 crawler (resolve career pages → ingest jobs → lifecycle). Run with `tsx`, scheduled by GitHub Actions |
| `supabase/functions/api/` | Public API edge function (`/jobs`, `/stats`, `/cities`) |
| `supabase/migrations/` | Postgres schema (companies, job_opportunities, geo function, indexes) |

Data lives in Supabase (Postgres + edge functions). The dashboard reads it via
the anon key; the pipeline writes via the service-role key.

## Develop

```sh
npm install
npm run dev        # dashboard on http://localhost:8080
```

Environment (`.env`, committed — it only holds the public anon key):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...   # anon key — safe for the browser
```

## Pipeline

```sh
cd pipeline
npm install
npx tsx src/cli.ts resolve --limit 50      # verify/fix career URLs
npx tsx src/cli.ts refresh --company bol    # ingest one company's jobs
npx tsx src/cli.ts stats                     # coverage summary
```

See `pipeline/.env.example` for the crawler's environment.

## Deploy

The dashboard is a static Vite build hosted on **Vercel** — every push to
`main` auto-deploys. `vercel.json` rewrites all routes to `index.html` for
client-side routing. The API and database are on Supabase (deploy functions
with explicitly named `supabase functions deploy` commands). Apply only reviewed, new
migrations and record their versions; this shared database must never be reset or pushed
wholesale from either application's migration directory.

## Freelance assignments

Striive, Flextender and Opdracht Overheid use dedicated `freelance:*` source adapters
in the fast refresh lane. The existing active `refresh-jobs` workflow runs twice daily;
these sources stay on an eight-hour due interval so each scheduled pass can refresh them.
The adapters use public search data, respect robots rules, and never call an LLM.
Freelance.nl is registered with crawling disabled pending an authorised feed.

`job_type=freelance` selects assignments explicitly eligible for ZZP work. Interim and
temporary employment remain `contract`; unknown eligibility is not promoted to freelance.
The jobs API includes nullable `freelance_eligible` and `freelance_details` (source, client,
reference, hours, start/end dates and deadline). Rates use the existing salary fields with
`salary_period=hour`. Source URLs deduplicate imports; an aggregator cannot take ownership
of an existing employer vacancy. Truncated or failed fetches never mass-close listings.
Flextender detail requests rotate if its roster exceeds the per-run cap.

For a targeted manual refresh, run from `pipeline/` with the existing private environment:
`LLM_API_KEY='' npx tsx src/cli.ts refresh --company Striive --force`.
Apply only this repository's new migration and explicitly named functions to the shared
Supabase project; do not reset the project or prune functions belonging to FairApply.


## Candidate discovery and alerts

Public discovery uses a covering index for its lightweight filter/count/ranking fields.
Location, recency and other selective filters are applied before full-text/company
candidates are materialized, so local searches do not load matches across the entire
country first. Exact totals, ranking, deadlines and existing access controls are preserved.
Create the covering index concurrently in production before applying the function changes
to keep crawler writes available.

The public search has employment and freelance modes. `mode`, `sort`, `pay_min`, `hours_min`, `hours_max`, `start_before`, and `closing_within` are validated by the Edge API and passed to the service-only `fairjobs_discover_jobs` RPC. Salary comparisons use the requested period (EUR/month for employment, EUR/hour for assignments). An upper budget is not presented as a guaranteed offer. Recency filters refer to discovery; cards distinguish source publication dates from first discovery.

Country evidence comes from structured source fields and known country-bearing employer URLs. Explicit foreign jobs are retained internally and excluded publicly. Missing locations stay unknown. `npx tsx src/cli.ts enrich --limit 1000 --budget-min 12` (from `pipeline/`) progressively repairs missing descriptions and locations from matching employer markup and public ATS detail APIs, without model calls; `detail_checked_at` rotates attempts. `--metadata` targets missing location/country facts; `--ats smartrecruiters` targets a specific adapter. The twice-daily fast refresh runs description and metadata repairs separately.

## Source resilience and employer onboarding

The scheduled pipeline explicitly has no LLM key. It extracts structured data, rendered
markup and captured public feeds. A page with job signals but no extractable jobs is a
failure needing an adapter, never evidence that all jobs have closed. Database writes use
small fixed patches and split timed-out transactions. Concurrent companies keep separate
live rosters; country-filtered Workday/SmartRecruiters rosters reconcile only that country's
previously identified jobs. Retry-After pauses are never shortened.

`recover --limit 150 --budget-min 15` retries due broken/unresolved sources twice daily.
Known adapters retain their configuration on transient failures; unresolved career pages
are re-fingerprinted. Failed/partial reconcile attempts are recorded in scrape history.
The weekly resolver can also explicitly recheck verified broken sources. Budgets apply to
network calls as well as dispatching companies. Historical scrape records are retained.

Common Crawl discovery caches public candidate rosters for a day and can fall back to a
snapshot at most 90 days old during an outage. Every candidate still undergoes current
Dutch-job validation. CI persists this cache. An independent employer hiring-feed input
uses ATS links from recent employer-authored Hacker News hiring threads via its public
API. `harvest --independent-only` runs without Common Crawl. Partial domain inputs can
succeed independently; an upstream failure is never logged as an empty successful crawl.

`/werkgever-toevoegen` lets signed-in users submit career pages and follow their status.
Submissions are owner-scoped and capped at five per day, including direct Data API inserts.
Admins review sources before the twice-daily `source-requests` worker validates/imports
them. Review does not promise that a source will yield jobs. The worker requires verified
Dutch vacancies, deduplicates board ownership and records import outcomes/errors. It
uses DNS-pinned HTTPS with public-address checks on every redirect; arbitrary submitted
pages cannot launch Chromium or call a model. Unsupported sources remain for review.

Map/statistics RPCs read `job_market_metrics`, a service-only snapshot atomically refreshed
every 15 minutes by the `fairjobs-market-metrics` database cron job. The payload preserves
its real `generated_at` timestamp, so stale snapshots are visible rather than relabelled
as live. Live recount functions and the refresh action are service-only. RLS with no client
policies on this aggregate cache is intentional; only the existing public aggregate RPCs
expose the public counts. No FairApply schedules or user data are changed.

Saved-search criteria and delivery share the search API, including radius, workplace and assignment filters. Email frequency is daily or weekly. `send-job-alerts` accepts the service-authenticated `{ "dry_run": true }` body to validate matching without sending or advancing watermarks. Sign-in preserves search, pending save and alert preferences.

`/admin/coverage` includes aggregate actions and separate prepared-document / receipt-backed submission counts. Browser events contain no identities, queries or CV data, use no tracking cookies, respect Do Not Track, and are stored in the service-only `job_product_events` table. Application outcomes cover matching FairJobs vacancy URLs in FairApply; they are not visitor attribution or a conversion rate. RLS without client policies on this event table is intentional.

Validation: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; in `pipeline/`, `npm run typecheck`, `npm test`, and `npx tsx scripts/verify-discovery.ts`. The latter uses public APIs by default. `--with-fixtures` additionally creates two disposable confirmed test accounts, checks owner isolation and persistence, runs alert delivery in dry-run mode, and removes only those accounts. It sends no emails or employer applications.
