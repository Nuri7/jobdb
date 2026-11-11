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
with `supabase functions deploy`, apply schema with `supabase db push`).

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

The public search has employment and freelance modes. `mode`, `sort`, `pay_min`, `hours_min`, `hours_max`, `start_before`, and `closing_within` are validated by the Edge API and passed to the service-only `fairjobs_discover_jobs` RPC. Salary comparisons use the requested period (EUR/month for employment, EUR/hour for assignments). An upper budget is not presented as a guaranteed offer. Recency filters refer to discovery; cards distinguish source publication dates from first discovery.

Country evidence comes from structured source fields and known country-bearing employer URLs. Explicit foreign jobs are retained internally and excluded publicly. Missing locations stay unknown. `npx tsx src/cli.ts enrich --limit 30` (from `pipeline/`) progressively repairs missing descriptions from matching employer JSON-LD without model calls; `detail_checked_at` rotates attempts. The existing twice-daily fast refresh runs this repair.

Saved-search criteria and delivery share the search API, including radius, workplace and assignment filters. Email frequency is daily or weekly. `send-job-alerts` accepts the service-authenticated `{ "dry_run": true }` body to validate matching without sending or advancing watermarks. Sign-in preserves search, pending save and alert preferences.

`/admin/coverage` includes aggregate actions and separate prepared-document / receipt-backed submission counts. Browser events contain no identities, queries or CV data, use no tracking cookies, respect Do Not Track, and are stored in the service-only `job_product_events` table. Application outcomes cover matching FairJobs vacancy URLs in FairApply; they are not visitor attribution or a conversion rate. RLS without client policies on this event table is intentional.

Validation: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; in `pipeline/`, `npm run typecheck`, `npm test`, and `npx tsx scripts/verify-discovery.ts`. The latter uses public APIs by default. `--with-fixtures` additionally creates two disposable confirmed test accounts, checks owner isolation and persistence, runs alert delivery in dry-run mode, and removes only those accounts. It sends no emails or employer applications.
