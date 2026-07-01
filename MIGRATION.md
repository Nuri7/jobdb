# Migration: Lovable Cloud → own Supabase project

Why: Lovable Cloud never exposes the service role key, an access token, or dashboard
access — the scraping worker (and any real backend ownership) is impossible there.
The repo is self-sufficient: all migrations, edge-function code and exported data.

## State

- [x] Data exported from old project (`migration-data/` — 4,715 companies, 20 synonym
      groups, 18 settings; job_opportunities was empty). Public-readable via anon key.
- [ ] New project created in Nuri's own Supabase org
- [ ] `supabase link` + `supabase db push` (applies all 21 migrations incl. pipeline_foundation)
- [ ] `npx tsx pipeline/scripts/import-data.ts` (after pointing pipeline/.env at the new project)
- [ ] `supabase functions deploy api scrape-jobs find-career-page discover-companies scheduled-scrape`
- [ ] New API key generated for applyforme (insert hash into `api_keys`, plaintext shared once)
- [ ] jobdb `.env` (frontend) + `pipeline/.env` + GitHub secrets updated to new project
- [ ] applyforme repointed: `retrieve-jobs/index.ts` URL (hardcoded old ref at line ~140)
      + `EXTERNAL_JOBS_API_KEY` secret updated via Lovable UI (applyforme stays on Lovable Cloud)
- [ ] Old Lovable Cloud backend left as-is (read-only fallback; nothing writes to it anymore)

## Notes

- Function secrets in the new project: `FIRECRAWL_API_KEY` only needed for the legacy
  dashboard "Scrape Now" path (optional — the pipeline replaced it). The `/api` search's
  AI expansion called Lovable's gateway; without `LOVABLE_API_KEY` it degrades gracefully
  to synonym-table-only search. Swap to an OpenAI-compatible env pair later if wanted.
- Region: eu-central-1 (Frankfurt). DB password stored in `pipeline/.env`
  (`SUPABASE_DB_PASSWORD`, gitignored).
- The frontend dashboard keeps working wherever it's hosted once `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_PUBLISHABLE_KEY` point at the new project.
