import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-internal',
  'Content-Type': 'application/json',
};

interface SynonymRow {
  terms: string[];
}

// Fetch synonym groups from database
// deno-lint-ignore no-explicit-any
async function fetchSynonymGroups(supabase: any): Promise<string[][]> {
  try {
    const { data, error } = await supabase
      .from('job_synonyms')
      .select('terms')
      .eq('is_active', true);
    
    if (error) {
      console.error('Error fetching synonyms:', error);
      return [];
    }
    
    return (data as SynonymRow[])?.map(row => row.terms) || [];
  } catch (error) {
    console.error('Synonym fetch error:', error);
    return [];
  }
}

// Get all related terms for a search query using database synonyms.
// Matches a group only when the WHOLE phrase equals one of its terms (normalized). Substring
// matching used to expand a multi-word title like "ai engineer" into the generic "engineer"
// group, flooding results with every developer/engineer role. The phrase is the unit; broader
// related titles come from AI expansion, not from word-level substring hits.
function getSynonymsFromGroups(searchTerm: string, synonymGroups: string[][]): string[] {
  const norm = (s: string) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
  const lowerSearch = norm(searchTerm);
  const synonyms: Set<string> = new Set([searchTerm]);

  for (const group of synonymGroups) {
    if (group.some(term => norm(term) === lowerSearch)) {
      group.forEach(term => synonyms.add(term));
    }
  }

  return Array.from(synonyms);
}

// AI-powered semantic expansion for terms not covered by synonyms
async function getAIExpandedTerms(searchTerm: string): Promise<string[]> {
  const apiKey = Deno.env.get('LLM_API_KEY');
  if (!apiKey) return []; // AI expansion is optional — skip cleanly when no key is configured
  const baseUrl = (Deno.env.get('LLM_BASE_URL') ?? 'https://api.anthropic.com/v1').replace(/\/$/, '');
  const model = Deno.env.get('LLM_MODEL') ?? 'claude-haiku-4-5-20251001';
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a job title synonym expert. Given a job title or search term, return 3-5 closely related alternative job titles that recruiters might use for similar roles. Return ONLY a JSON array of strings, nothing else. Be concise and practical.'
          },
          {
            role: 'user',
            content: `Related job titles for: "${searchTerm}"`
          }
        ],
        max_tokens: 100,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error('AI expansion failed:', response.status);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Parse JSON array from response
    const match = content.match(/\[.*\]/s);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        return parsed.filter(item => typeof item === 'string').slice(0, 5);
      }
    }
    return [];
  } catch (error) {
    console.error('AI expansion error:', error);
    return [];
  }
}

// Hash function for API key validation
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Canonical filter value -> the messy real-world variants in the data (employment_type /
// experience_level are inconsistent: "full-time" vs "fulltime" vs "voltijds", "senior" vs
// "management" vs "principal", etc.). Each canonical choice OR-matches all its patterns.
const JOB_TYPE_PATTERNS: Record<string, string[]> = {
  fulltime: ['full-time', 'fulltime', 'voltijd'],
  parttime: ['part-time', 'parttime', 'deeltijd'],
  internship: ['internship', 'intern', 'stage', 'stagiair', 'werkstudent'],
  contract: ['contract', 'temporary', 'tijdelijk', 'fixed-term', 'interim'],
};
const EXPERIENCE_PATTERNS: Record<string, string[]> = {
  junior: ['junior', 'entry', 'instap', 'starter', 'graduate', 'student', 'stagiair'],
  medior: ['medior', 'experienced', 'medewerker', 'professional', 'ervaren'],
  senior: ['senior', 'lead', 'principal', 'staff', 'management', 'manager', 'director', 'directeur', 'expert'],
};
const sanitizeLike = (s: string) => s.replace(/[,.()"%_*\\]/g, ' ').replace(/\s+/g, ' ').trim();

// Real relevance score (0-100) for a job title vs the user's search phrases — replaces the old
// hardcoded 80 so ranking actually means something: exact > prefix > whole-phrase > substring >
// matched-only-via-synonym/expansion.
function relevanceScore(title: string, phrases: string[]): { score: number; reason: string } {
  if (!phrases.length) return { score: 70, reason: 'no query' };
  const t = (title || '').toLowerCase().replace(/\s+/g, ' ').trim();
  let best = 0;
  let reason = 'related';
  for (const raw of phrases) {
    const p = raw.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!p) continue;
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let s = 0;
    let r = 'related';
    if (t === p) { s = 100; r = 'exact title'; }
    else if (t.startsWith(`${p} `)) { s = 92; r = 'title starts with query'; }
    else if (new RegExp(`\\b${esc}\\b`).test(t)) { s = 84; r = 'query is a whole phrase in the title'; }
    else if (t.includes(p)) { s = 76; r = 'query appears in the title'; }
    if (s > best) { best = s; reason = r; }
  }
  if (best === 0) return { score: 62, reason: 'related role (synonym / AI-expanded match)' };
  return { score: best, reason };
}

// Reject non-public / internal hosts so an attacker-supplied career_url can't coerce the scraper
// into fetching internal services (SSRF). Blocks non-http(s), localhost, private/link-local/reserved
// IP ranges, cloud metadata, and our own Supabase host.
function isSafeCareerUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return false;
  if (host === 'metadata.google.internal' || host === '169.254.169.254') return false;
  if (host.includes('supabase.co') || host.includes('supabase.in')) return false;
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) return false;
  }
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return false;
  return true;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const url = new URL(req.url);
    
    // Check if this is an internal call from the frontend
    const isInternalCall = req.headers.get('x-internal') === 'true';
    
    // Parse path from URL - remove /api prefix and any function name prefix
    const fullPath = url.pathname;
    // Handle both /api/jobs and /functions/v1/api/jobs formats
    const path = fullPath.replace(/^\/functions\/v1\/api/, '').replace(/^\/api/, '') || '/';
    const params = url.searchParams;
    
    console.log('Request path:', path, 'Internal:', isInternalCall);

    // API documentation is public (no auth required)
    if (path === '' || path === '/') {
      return new Response(
        JSON.stringify({
          name: 'Jobs Directory API',
          version: '1.0.0',
          authentication: {
            header: 'X-API-Key',
            description: 'Include your API key in the X-API-Key header',
          },
          endpoints: {
            'GET /api/jobs': {
              description: 'List job opportunities',
              parameters: {
                limit: 'Number of results (max 100, default 50)',
                offset: 'Pagination offset (default 0)',
                search: 'Intelligent search in job titles (includes synonyms + AI expansion, e.g. "product owner" also finds "product manager")',
                location: 'Filter by location',
                company: 'Filter by company name',
                job_type: 'Filter by employment type (full-time, part-time, contract)',
                experience_level: 'Filter by experience level',
                remote: 'Filter remote jobs (true/false)',
                internship: 'Filter internships (true/false)',
              },
            },
            'GET /api/companies': {
              description: 'List companies',
              parameters: {
                limit: 'Number of results (max 100, default 50)',
                offset: 'Pagination offset (default 0)',
                search: 'Search in company names',
                industry: 'Filter by industry',
              },
            },
            'POST /api/companies': {
              description: 'Add a new company (auto-enabled for scraping, triggers immediate scrape)',
              body: {
                name: 'Company name (required)',
                career_url: 'Career page URL (required)',
                industry: 'Industry category (optional)',
              },
              response: {
                data: 'Created company object with id, name, career_url, company_logo, industry, is_scrape_enabled, scrape_triggered',
                message: 'Success message',
              },
            },
            'GET /api/stats': {
              description: 'Get aggregate statistics',
            },
            'GET /api/synonyms': {
              description: 'List and manage search synonym groups',
              note: 'Synonyms improve job search by matching related terms (e.g., "product owner" also finds "product manager")',
            },
          },
        }),
        { headers: corsHeaders }
      );
    }

    // Internal READ calls (from the frontend via supabase.functions.invoke) skip the API key. But
    // writes ALWAYS require a valid key — a client-supplied `x-internal: true` header must never be
    // enough to mutate data or trigger a scrape.
    const isWrite = req.method !== 'GET' && req.method !== 'OPTIONS' && req.method !== 'HEAD';
    if (!isInternalCall || isWrite) {
      // Validate API key for external API calls
      const apiKey = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
      
      if (!apiKey) {
        return new Response(
          JSON.stringify({ 
            error: 'Unauthorized', 
            message: 'Missing API key. Include your key in the X-API-Key header.',
            docs: 'GET /api for documentation'
          }),
          { status: 401, headers: corsHeaders }
        );
      }

      // Hash and validate the API key
      const keyHash = await hashApiKey(apiKey);
      const { data: keyData, error: keyError } = await supabase
        .from('api_keys')
        .select('id, is_active')
        .eq('key_hash', keyHash)
        .maybeSingle();

      if (keyError || !keyData) {
        console.log('API key validation failed:', keyError?.message || 'Key not found');
        return new Response(
          JSON.stringify({ error: 'Unauthorized', message: 'Invalid API key' }),
          { status: 401, headers: corsHeaders }
        );
      }

      if (!keyData.is_active) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized', message: 'API key is inactive' }),
          { status: 401, headers: corsHeaders }
        );
      }

      // Update last_used_at (fire and forget)
      supabase
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', keyData.id)
        .then(() => {});
    }


    // Route: GET /jobs
    if (path === '/jobs' || path === '/jobs/') {
      const limit = Math.min(parseInt(params.get('limit') || '50'), 100);
      // Cap offset so a caller can't force a multi-million-row scan
      const offset = Math.max(0, Math.min(parseInt(params.get('offset') || '0') || 0, 50_000));
      // Split the raw search on commas into distinct title phrases; EACH phrase is matched as a
      // whole ("ai engineer" stays one unit — commas are the only thing that splits a search into
      // separate titles). Per phrase we strip PostgREST metacharacters and LIKE wildcards so a term
      // can't break out of the .or() grammar and pivot onto other columns.
      const rawSearch = params.get('search');
      const phrases = rawSearch
        ? rawSearch.split(',')
            .map(p => p.replace(/[.()"*%_\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80))
            .filter(p => p.length > 0)
            .slice(0, 6) // cap: at most 6 distinct title phrases per request
        : [];
      const search = phrases.length > 0 ? phrases.join(', ') : null; // display/log value
      const location = params.get('location');
      const company = params.get('company');
      const jobType = params.get('job_type');
      const experienceLevel = params.get('experience_level');
      const remote = params.get('remote');
      const internship = params.get('internship');
      // Recency: only jobs first seen within the last N days (freshness — our honest edge)
      const postedWithin = parseInt(params.get('posted_within') || '', 10);
      // Radius search: jobs in cities within N km of `near` (resolved against city_coords below).
      const near = params.get('near');
      const radiusKm = Math.min(Math.max(parseFloat(params.get('radius_km') || '') || 0, 0), 300);
      const industry = params.get('industry');
      const hasSalary = (params.get('has_salary') || '').toLowerCase() === 'true';
      const easyApply = (params.get('easy_apply') || '').toLowerCase() === 'true';

      // Build search terms per phrase - combine synonyms + AI expansion, then OR everything.
      // The .or() becomes a set of leading-wildcard ILIKEs; too many (or ultra-short ones that
      // the trigram index can't serve, like "po"/"pm") make the query fall back to full scans and
      // time out on the growing table. So: keep the user's own phrases first (always), add only
      // synonyms/AI terms of length >= 3, and cap the total OR breadth.
      const normTerm = (s: string) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
      const MAX_SEARCH_TERMS = 8;
      let searchTerms: string[] = [];
      if (phrases.length > 0) {
        // Fetch synonym groups from database (once for all phrases)
        const synonymGroups = await fetchSynonymGroups(supabase);
        const primary: string[] = [];            // the user's own title phrases — always kept
        const secondary = new Set<string>();     // curated synonyms + AI-expanded related titles

        for (const phrase of phrases) {
          primary.push(phrase);
          // Broaden a long, niche title to its 2-word core role so specific titles still return
          // relevant roles instead of nothing: "ai solutions architect" (0 hits) → also match
          // "solutions architect" (many). We stop at a 2-word tail — never a single generic word
          // like "architect"/"engineer" — so this widens sensibly without flooding.
          const words = phrase.split(/\s+/).filter(Boolean);
          if (words.length >= 3) primary.push(words.slice(-2).join(' '));
          // Curated synonyms first (fast, predictable) — matched against the whole phrase
          const syn = getSynonymsFromGroups(phrase, synonymGroups);
          if (syn.length <= 1) {
            // No curated hit → semantic AI expansion of the whole phrase (related job titles)
            const aiTerms = await getAIExpandedTerms(phrase);
            aiTerms.forEach(t => secondary.add(t));
            console.log(`AI expanded "${phrase}" to:`, aiTerms);
          } else {
            syn.forEach(t => { if (normTerm(t) !== normTerm(phrase)) secondary.add(t); });
            console.log(`Synonym match for "${phrase}":`, syn);
          }
        }

        // Drop ultra-short synonym noise (e.g. "po", "pm"); the original phrases are exempt.
        const extras = [...secondary].filter(t => t.trim().length >= 3);
        searchTerms = [...new Set([...primary, ...extras])].slice(0, MAX_SEARCH_TERMS);
      }

      // Job lifecycle filter: default to open jobs; ?status=open|closed|all
      const statusParam = (params.get('status') || 'open').toLowerCase();
      const statusFilter = ['open', 'closed', 'all'].includes(statusParam) ? statusParam : 'open';

      let query = supabase
        .from('job_opportunities')
        .select(`
          id,
          job_title,
          job_url,
          location,
          city,
          province,
          employment_type,
          department,
          salary_range,
          description,
          is_remote,
          is_internship,
          experience_level,
          posted_date,
          closing_date,
          first_seen_at,
          status,
          scraped_at,
          company_career_sites!inner (
            id,
            company_name,
            industry,
            career_url,
            source_type,
            is_scrape_enabled
          )
        `,
        // 'estimated': an exact count over this filtered+joined set on a large,
        // growing table blew the statement_timeout. The planner estimate is
        // fast and close enough for a jobs listing's total/has_more.
        { count: 'estimated' })
        .eq('company_career_sites.is_scrape_enabled', true)
        .order('scraped_at', { ascending: false })
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      // Confidence gate: serve ONLY verified real vacancies (structured data / ATS / real
      // apply button). This is what keeps landing/category/blog/dead pages out of applyforme.
      // ?verified=all bypasses it for debugging only.
      if ((params.get('verified') || 'true').toLowerCase() !== 'all') {
        query = query.eq('verified', true);
      }

      // NL-only gate (default): this is a Netherlands job board. `is_foreign` (a trigger-maintained
      // column) is true only for jobs with a foreign city and no NL signal — i.e. a city not in
      // city_coords, no Dutch province, not remote, and no "Nederland/Netherlands/Landelijk" in the
      // location. Remote and location-unknown jobs are kept. A plain .eq() reliably AND-combines with
      // the search .or() (two separate .or() groups do NOT). ?country=all bypasses it.
      if ((params.get('country') || 'nl').toLowerCase() !== 'all') {
        query = query.eq('is_foreign', false);
      }

      // Apply intelligent search - OR across all related terms
      // Use word boundary matching for short terms (<=3 chars) to avoid false positives
      if (searchTerms.length > 0) {
        // Synonym-table and AI-expanded terms also flow into the .or() grammar — strip
        // PostgREST metacharacters and LIKE wildcards from every term, not just the seed.
        const safeTerms = searchTerms
          .map(t => String(t).replace(/[,.()"%_*\\]/g, ' ').replace(/\s+/g, ' ').trim())
          .filter(t => t.length > 0);
        const searchFilters = safeTerms.map(term => {
          if (term.length <= 3) {
            // For short terms, require word boundaries (start/end of string or surrounded by spaces)
            // This prevents "po" matching "Corporate" or "pm" matching "Development"
            return [
              `job_title.ilike.${term} %`,      // starts with term + space
              `job_title.ilike.% ${term}`,      // ends with space + term
              `job_title.ilike.% ${term} %`,    // surrounded by spaces
              `job_title.eq.${term}`            // exact match
            ].join(',');
          }
          return `job_title.ilike.%${term}%`;
        }).join(',');
        if (searchFilters) query = query.or(searchFilters);
      }
      // Location — a radius search (near + radius_km) resolves to the set of cities within range
      // via city_coords and takes precedence; otherwise fall back to a plain location substring.
      let radiusResolved = false;
      if (near && radiusKm > 0) {
        const nearNorm = near.toLowerCase().replace(/\s+/g, ' ').trim();
        const { data: center } = await supabase
          .from('city_coords').select('lat,lng').eq('city', nearNorm).maybeSingle();
        if (center) {
          const dLat = radiusKm / 111.0;
          const dLng = radiusKm / (111.0 * Math.max(Math.cos(center.lat * Math.PI / 180), 0.01));
          const { data: box } = await supabase
            .from('city_coords').select('city,lat,lng')
            .gte('lat', center.lat - dLat).lte('lat', center.lat + dLat)
            .gte('lng', center.lng - dLng).lte('lng', center.lng + dLng)
            .limit(5000);
          const hav = (la1: number, lo1: number, la2: number, lo2: number) => {
            const R = 6371, p = Math.PI / 180;
            const a = Math.sin((la2 - la1) * p / 2) ** 2 +
              Math.cos(la1 * p) * Math.cos(la2 * p) * Math.sin((lo2 - lo1) * p / 2) ** 2;
            return 2 * R * Math.asin(Math.sqrt(a));
          };
          // Nearest-first, capped so the .in() list stays a bounded URL.
          const inRange = (box || [])
            .map((c: { city: string; lat: number; lng: number }) =>
              ({ city: c.city, d: hav(center.lat, center.lng, c.lat, c.lng) }))
            .filter((c) => c.d <= radiusKm)
            .sort((a, b) => a.d - b.d)
            .slice(0, 600)
            .map((c) => c.city);
          // '__no_match__' guarantees an empty result if nothing is in range (never a real city).
          query = query.in('city', inRange.length > 0 ? inRange : ['__no_match__']);
          radiusResolved = true;
          console.log(`Radius: ${inRange.length} cities within ${radiusKm}km of "${nearNorm}"`);
        } else {
          console.log(`Radius: no coords for "${nearNorm}" — falling back to substring match`);
        }
      }
      if (!radiusResolved && (near || location)) {
        // No radius (or unknown center city) → plain substring match on the location text
        query = query.ilike('location', `%${near || location}%`);
      }
      if (company) {
        query = query.ilike('company_career_sites.company_name', `%${company}%`);
      }
      if (industry) {
        query = query.ilike('company_career_sites.industry', `%${industry}%`);
      }
      if (jobType) {
        const pats = JOB_TYPE_PATTERNS[jobType.toLowerCase()] || [sanitizeLike(jobType)];
        query = query.or(pats.filter(Boolean).map(p => `employment_type.ilike.%${p}%`).join(','));
      }
      if (experienceLevel) {
        const pats = EXPERIENCE_PATTERNS[experienceLevel.toLowerCase()] || [sanitizeLike(experienceLevel)];
        query = query.or(pats.filter(Boolean).map(p => `experience_level.ilike.%${p}%`).join(','));
      }
      if (remote === 'true') {
        query = query.eq('is_remote', true);
      }
      if (internship === 'true') {
        query = query.eq('is_internship', true);
      }
      if (easyApply) {
        // easy_apply in the response is derived from an ATS source_type (see mapping below)
        query = query.ilike('company_career_sites.source_type', 'ats:%');
      }
      if (hasSalary) {
        query = query.not('salary_range', 'is', null);
      }
      if (Number.isFinite(postedWithin) && postedWithin > 0) {
        const since = new Date(Date.now() - postedWithin * 86_400_000).toISOString();
        query = query.gte('first_seen_at', since);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('Jobs query error:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch jobs', details: error.message }),
          { status: 500, headers: corsHeaders }
        );
      }

      // Helper to get company logo URL from career URL (using Google Favicons - free and reliable)
      const getCompanyLogoUrl = (careerUrl: string | null | undefined): string | null => {
        if (!careerUrl) return null;
        try {
          const url = new URL(careerUrl);
          // Google Favicons service - free, no API key required
          return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=128`;
        } catch {
          return null;
        }
      };

      // Transform data for cleaner API response
      const jobs = data?.map(job => {
        const company = job.company_career_sites as unknown as {
          id: string;
          company_name: string;
          industry: string | null;
          career_url: string;
          source_type: string | null;
        };
        const sourceType = company?.source_type ?? null;
        const isAts = typeof sourceType === 'string' && sourceType.startsWith('ats:');
        const rel = relevanceScore(job.job_title, phrases);
        return {
          id: job.id,
          title: job.job_title,
          match_score: rel.score,
          match_reason: rel.reason,
          url: job.job_url,
          location: job.location,
          city: job.city,
          province: job.province,
          employment_type: job.employment_type,
          department: job.department,
          salary_range: job.salary_range,
          description: job.description,
          is_remote: job.is_remote,
          is_internship: job.is_internship,
          experience_level: job.experience_level,
          posted_date: job.posted_date,
          closing_date: job.closing_date,
          first_seen_at: job.first_seen_at,
          status: job.status,
          // Apply method: ATS-backed boards support structured/1-click apply (FairApply)
          easy_apply: isAts,
          ats: isAts ? sourceType!.slice(4) : null,
          scraped_at: job.scraped_at,
          company_logo: getCompanyLogoUrl(company?.career_url),
          company: {
            id: company?.id,
            name: company?.company_name,
            industry: company?.industry,
            career_url: company?.career_url,
          },
        };
      }) || [];

      // When there's a query, order the returned page by relevance (best matches first) instead of
      // pure scrape-recency. Ties keep DB order (scraped_at desc) since sort is stable.
      if (phrases.length > 0) {
        jobs.sort((a: { match_score: number }, b: { match_score: number }) => b.match_score - a.match_score);
      }

      return new Response(
        JSON.stringify({
          data: jobs,
          meta: {
            total: count,
            limit,
            offset,
            has_more: (offset + limit) < (count || 0),
            search_terms: searchTerms.length > 0 ? searchTerms : undefined,
          },
        }),
        { headers: corsHeaders }
      );
    }

    // Route: GET /companies
    if (path === '/companies' || path === '/companies/') {
      // Handle POST for creating companies
      if (req.method === 'POST') {
        try {
          const body = await req.json();
          const { name, career_url, industry } = body;

          // Validate required fields
          if (!name || typeof name !== 'string' || !name.trim()) {
            return new Response(
              JSON.stringify({ error: 'Bad Request', message: 'name is required' }),
              { status: 400, headers: corsHeaders }
            );
          }

          if (!career_url || typeof career_url !== 'string' || !career_url.trim()) {
            return new Response(
              JSON.stringify({ error: 'Bad Request', message: 'career_url is required' }),
              { status: 400, headers: corsHeaders }
            );
          }

          // Validate URL format
          let formattedUrl = career_url.trim();
          if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
            formattedUrl = `https://${formattedUrl}`;
          }

          if (!isSafeCareerUrl(formattedUrl)) {
            return new Response(
              JSON.stringify({ error: 'Bad Request', message: 'Invalid or disallowed career_url' }),
              { status: 400, headers: corsHeaders }
            );
          }

          // Check for duplicate career URL
          const { data: existing } = await supabase
            .from('company_career_sites')
            .select('id')
            .eq('career_url', formattedUrl)
            .maybeSingle();

          if (existing) {
            return new Response(
              JSON.stringify({ error: 'Conflict', message: 'A company with this career URL already exists' }),
              { status: 409, headers: corsHeaders }
            );
          }

          // Insert the company with scraping enabled
          const { data: newCompany, error: insertError } = await supabase
            .from('company_career_sites')
            .insert({
              company_name: name.trim(),
              career_url: formattedUrl,
              industry: industry?.trim() || null,
              is_scrape_enabled: true,
            })
            .select()
            .single();

          if (insertError) {
            console.error('Company insert error:', insertError);
            return new Response(
              JSON.stringify({ error: 'Failed to create company', details: insertError.message }),
              { status: 500, headers: corsHeaders }
            );
          }

          // Trigger scrape asynchronously (fire and forget)
          let scrapeTriggered = false;
          try {
            const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
            const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
            
            fetch(`${supabaseUrl}/functions/v1/scrape-jobs`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ companyId: newCompany.id, careerUrl: newCompany.career_url }),
            }).catch(err => console.error('Scrape trigger error:', err));
            
            scrapeTriggered = true;
          } catch (err) {
            console.error('Failed to trigger scrape:', err);
          }

          // Get logo URL
          const getLogoUrl = (careerUrl: string): string | null => {
            try {
              const url = new URL(careerUrl);
              return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=128`;
            } catch {
              return null;
            }
          };

          return new Response(
            JSON.stringify({
              data: {
                id: newCompany.id,
                name: newCompany.company_name,
                career_url: newCompany.career_url,
                company_logo: getLogoUrl(newCompany.career_url),
                industry: newCompany.industry,
                is_scrape_enabled: newCompany.is_scrape_enabled,
                scrape_triggered: scrapeTriggered,
              },
              message: 'Company created and scrape initiated',
            }),
            { status: 201, headers: corsHeaders }
          );
        } catch (err) {
          console.error('POST /companies error:', err);
          return new Response(
            JSON.stringify({ error: 'Bad Request', message: 'Invalid JSON body' }),
            { status: 400, headers: corsHeaders }
          );
        }
      }

      // GET request - list companies
      const limit = Math.min(parseInt(params.get('limit') || '50'), 100);
      const offset = parseInt(params.get('offset') || '0');
      const search = params.get('search');
      const industry = params.get('industry');

      let query = supabase
        .from('company_career_sites')
        .select('*', { count: 'exact' })
        .eq('is_scrape_enabled', true)
        .order('company_name')
        .range(offset, offset + limit - 1);

      if (search) {
        query = query.ilike('company_name', `%${search}%`);
      }
      if (industry) {
        query = query.ilike('industry', `%${industry}%`);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('Companies query error:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch companies', details: error.message }),
          { status: 500, headers: corsHeaders }
        );
      }

      // Helper to get company logo URL from career URL (using Google Favicons - free and reliable)
      const getLogoUrl = (careerUrl: string | null | undefined): string | null => {
        if (!careerUrl) return null;
        try {
          const url = new URL(careerUrl);
          // Google Favicons service - free, no API key required
          return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=128`;
        } catch {
          return null;
        }
      };

      const companies = data?.map(company => ({
        id: company.id,
        name: company.company_name,
        career_url: company.career_url,
        company_logo: getLogoUrl(company.career_url),
        industry: company.industry,
        company_size: company.company_size,
        headquarters_city: company.headquarters_city,
        jobs_count: company.jobs_found_count,
        last_scraped_at: company.last_crawled_at,
      })) || [];

      return new Response(
        JSON.stringify({
          data: companies,
          meta: {
            total: count,
            limit,
            offset,
            has_more: (offset + limit) < (count || 0),
          },
        }),
        { headers: corsHeaders }
      );
    }

    // Route: GET /stats — hiring pulse (totals + new/closed + province/city/type/seniority breakdowns)
    if (path === '/stats' || path === '/stats/') {
      const { data, error } = await supabase.rpc('job_stats');
      if (error) {
        console.error('Stats RPC error:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch stats', details: error.message }),
          { status: 500, headers: corsHeaders }
        );
      }
      return new Response(
        JSON.stringify({ data }),
        { headers: corsHeaders }
      );
    }

    // Route: GET /cities — verified open jobs grouped by city and province (for maps)
    if (path === '/cities' || path === '/cities/') {
      const { data, error } = await supabase.rpc('job_geo_counts');
      if (error) {
        console.error('cities rpc error:', error.message);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch city counts' }),
          { status: 500, headers: corsHeaders }
        );
      }
      // City/province counts change only when scrapes run (~2×/day) — let the browser/CDN cache them
      // so the map's first paint on a repeat visit is instant instead of a ~0.5s live aggregation.
      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=600, stale-while-revalidate=86400' },
      });
    }

    // Route: GET /synonyms
    if (path === '/synonyms' || path === '/synonyms/') {
      const { data, error } = await supabase
        .from('job_synonyms')
        .select('*')
        .order('group_name');

      if (error) {
        console.error('Synonyms query error:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch synonyms', details: error.message }),
          { status: 500, headers: corsHeaders }
        );
      }

      const synonyms = data?.map(syn => ({
        id: syn.id,
        group_name: syn.group_name,
        terms: syn.terms,
        is_active: syn.is_active,
        created_at: syn.created_at,
        updated_at: syn.updated_at,
      })) || [];

      return new Response(
        JSON.stringify({
          data: synonyms,
          meta: {
            total: synonyms.length,
            active: synonyms.filter(s => s.is_active).length,
          },
        }),
        { headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Not found', available_endpoints: ['/api', '/api/jobs', 'GET /api/companies', 'POST /api/companies', '/api/stats', '/api/synonyms'] }),
      { status: 404, headers: corsHeaders }
    );

  } catch (err) {
    console.error('API error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
