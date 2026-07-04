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
