import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
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
const canonicalList = (value: string | null, allowed: string[]): string[] | null => {
  if (!value) return null;
  const values = value.split(',').map((item) => item.trim().toLowerCase()).filter((item) => allowed.includes(item));
  return values.length > 0 ? [...new Set(values)] : null;
};

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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    
    // Parse path from URL - remove /api prefix and any function name prefix
    const fullPath = url.pathname;
    // Handle both /api/jobs and /functions/v1/api/jobs formats
    const path = fullPath.replace(/^\/functions\/v1\/api/, '').replace(/^\/api/, '') || '/';
    const params = url.searchParams;
    
    console.log('Request path:', path);

    // API documentation is public (no auth required)
    if (path === '' || path === '/') {
      return new Response(
        JSON.stringify({
          name: 'Jobs Directory API',
          version: '1.0.0',
          authentication: {
            header: 'X-API-Key',
            description: 'Public reads need no key. Mutations and higher limits require an API key or admin session.',
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
            'GET /api/coverage': {
              description: 'Admin-only ingestion coverage and pipeline health dashboard data',
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

    // Public reads deliberately need no credential. A supplied API key must still be valid, and
    // every mutation requires either a valid key or an authenticated JobDB admin. This replaces
    // the old client-spoofable `x-internal` header.
    const isWrite = req.method !== 'GET' && req.method !== 'OPTIONS' && req.method !== 'HEAD';
    const apiKey = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
    let hasApiKey = false;
    if (apiKey) {
      const keyHash = await hashApiKey(apiKey);
      const { data: keyData, error: keyError } = await supabase
        .from('api_keys')
        .select('id, is_active')
        .eq('key_hash', keyHash)
        .maybeSingle();

      if (keyError || !keyData || !keyData.is_active) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized', message: 'Invalid or inactive API key' }),
          { status: 401, headers: corsHeaders }
        );
      }
      hasApiKey = true;
      supabase
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', keyData.id)
        .then(() => {});
    }

    let isAdmin = false;
    const bearer = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (bearer && bearer !== anonKey && bearer !== serviceRoleKey) {
      const { data: userData } = await supabase.auth.getUser(bearer);
      if (userData.user) {
        const { data: adminRole } = await supabase.rpc('has_role', {
          _user_id: userData.user.id,
          _role: 'admin',
        });
        isAdmin = adminRole === true;
      }
    }

    if (isWrite && !hasApiKey && !isAdmin) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'This operation requires an API key or an authenticated admin session.',
        }),
        { status: 401, headers: corsHeaders }
      );
    }

    // Exact, internal pipeline metrics. This deliberately requires an admin session even though
    // public job reads do not: failure details and discovery state are operational information.
    if (req.method === 'GET' && (path === '/coverage' || path === '/coverage/')) {
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: 'Forbidden', message: 'Admin access required.' }), {
          status: 403,
          headers: corsHeaders,
        });
      }
      const { data, error } = await supabase.rpc('fairjobs_coverage_stats');
      if (error) {
        console.error('Coverage RPC error:', error);
        return new Response(JSON.stringify({ error: 'Failed to load coverage metrics' }), {
          status: 500,
          headers: corsHeaders,
        });
      }
      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Cache-Control': 'private, max-age=60' },
      });
    }

    // Lightweight typeahead backed by the same globally-ranked search used by the result list.
    if (req.method === 'GET' && (path === '/jobs/suggestions' || path === '/jobs/suggestions/')) {
      const q = (params.get('q') || '').replace(/[.()"*%_\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (q.length < 2) {
        return new Response(JSON.stringify({ data: { titles: [], companies: [], cities: [] } }), {
          headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=300' },
        });
      }

      const [rankedResult, companyResult, cityResult] = await Promise.all([
        supabase.rpc('fairjobs_search_jobs', { p_terms: [q], p_limit: 8, p_offset: 0 }),
        supabase.from('company_career_sites').select('company_name').ilike('company_name', `%${q}%`).limit(8),
        supabase.from('city_coords').select('display_name,city').or(`display_name.ilike.%${q}%,city.ilike.%${q}%`).limit(8),
      ]);
      const ids = (rankedResult.data || []).map((row: { id: string }) => row.id);
      const { data: titleRows } = ids.length > 0
        ? await supabase.from('job_opportunities').select('id,job_title').in('id', ids)
        : { data: [] };
      const titleById = new Map((titleRows || []).map((row: { id: string; job_title: string }) => [row.id, row.job_title]));
      const unique = (values: Array<string | null | undefined>) => [...new Set(values.filter((v): v is string => Boolean(v)))].slice(0, 8);

      return new Response(JSON.stringify({ data: {
        titles: unique(ids.map((id: string) => titleById.get(id))),
        companies: unique((companyResult.data || []).map((row: { company_name: string }) => row.company_name)),
        cities: unique((cityResult.data || []).map((row: { display_name: string | null; city: string }) => row.display_name || row.city)),
      } }), {
        headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=300, stale-while-revalidate=1800' },
      });
    }

    // Stable detail endpoint for crawlable vacancy pages and FairApply deep links.
    const jobDetailMatch = path.match(/^\/jobs\/([0-9a-f-]{36})\/?$/i);
    if (req.method === 'GET' && jobDetailMatch) {
      const { data: job, error } = await supabase
        .from('job_opportunities')
        .select(`
          id, job_title, job_url, location, city, province, employment_type, employment_type_normalized, department,
          salary_range, salary_min, salary_max, salary_currency, salary_period,
          description, requirements, is_remote, workplace_type, is_internship, experience_level, experience_level_normalized,
          posted_date, closing_date, first_seen_at, status, scraped_at,
          company_career_sites!inner(id, company_name, industry, career_url, source_type)
        `)
        .eq('id', jobDetailMatch[1])
        .eq('status', 'open')
        .eq('verified', true)
        .eq('is_foreign', false)
        .maybeSingle();

      if (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch job' }), { status: 500, headers: corsHeaders });
      }
      if (!job) {
        return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404, headers: corsHeaders });
      }
      const company = job.company_career_sites as unknown as {
        id: string;
        company_name: string;
        industry: string | null;
        career_url: string;
        source_type: string | null;
      };
      const isAts = company?.source_type?.startsWith('ats:') ?? false;
      return new Response(JSON.stringify({ data: {
        id: job.id,
        title: job.job_title,
        url: job.job_url,
        location: job.location,
        city: job.city,
        province: job.province,
        employment_type: job.employment_type,
        employment_type_normalized: job.employment_type_normalized,
        department: job.department,
        salary_range: job.salary_range,
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        salary_currency: job.salary_currency,
        salary_period: job.salary_period,
        description: job.description,
        requirements: job.requirements,
        is_remote: job.is_remote,
        workplace_type: job.workplace_type,
        is_internship: job.is_internship,
        experience_level: job.experience_level,
        experience_level_normalized: job.experience_level_normalized,
        posted_date: job.posted_date,
        closing_date: job.closing_date,
        first_seen_at: job.first_seen_at,
        scraped_at: job.scraped_at,
        easy_apply: isAts,
        ats: isAts ? company.source_type!.slice(4) : null,
        company: {
          id: company.id,
          name: company.company_name,
          industry: company.industry,
          career_url: company.career_url,
        },
      }}), {
        headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
      });
    }


    // Route: GET /jobs
    if (path === '/jobs' || path === '/jobs/') {
      const maxLimit = hasApiKey || isAdmin ? 100 : 50;
      const limit = Math.max(1, Math.min(parseInt(params.get('limit') || '24') || 24, maxLimit));
      // Cap offset so a caller can't force a multi-million-row scan
      const page = Math.max(1, parseInt(params.get('page') || '1') || 1);
      const offset = Math.max(0, Math.min(
        parseInt(params.get('offset') || '') || ((page - 1) * limit),
        50_000,
      ));
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
      const location = params.get('location');
      const company = params.get('company');
      const companyId = params.get('company_id');
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
      const includeDescription = (params.get('include_description') || '').toLowerCase() === 'true';

      // Build search terms per phrase: keep the user's own phrases first, then add a tightly
      // bounded set of curated synonyms / AI terms for the global ranking RPC.
      const normTerm = (s: string) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
      const MAX_SEARCH_TERMS = 6;
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
            const aiTerms = hasApiKey || isAdmin ? await getAIExpandedTerms(phrase) : [];
            aiTerms.forEach(t => secondary.add(t));
            console.log(`AI expanded "${phrase}" to:`, aiTerms);
          } else {
            syn.forEach(t => { if (normTerm(t) !== normTerm(phrase)) secondary.add(t); });
            console.log(`Synonym match for "${phrase}":`, syn);
          }
        }

        // Drop ultra-short synonym noise (e.g. "po", "pm"); the original phrases are exempt.
        // A multi-word search must not fan out into generic one-word roles. For example,
        // "software engineer" used to also search for engineer/developer/programmer/coder, which
        // both diluted relevance and forced a large OR scan. Closely related multi-word titles
        // such as "software developer" are still included.
        const requiresSpecificExtras = phrases.every(phrase => phrase.split(/\s+/).length > 1);
        const extras = [...secondary].filter(t => {
          const normalized = t.trim();
          return normalized.length >= 3 &&
            (!requiresSpecificExtras || normalized.split(/\s+/).length > 1);
        });
        searchTerms = [...new Set([...primary, ...extras])].slice(0, MAX_SEARCH_TERMS);
      }

      // Job lifecycle filter: default to open jobs; ?status=open|closed|all
      const statusParam = (params.get('status') || 'open').toLowerCase();
      const requestedStatus = ['open', 'closed', 'all'].includes(statusParam) ? statusParam : 'open';
      const statusFilter = hasApiKey || isAdmin ? requestedStatus : 'open';

      // Resolve company-side filters first so the large jobs query can use its indexed foreign key
      // rather than joining companies while it also evaluates title/location filters and sorting.
      let companySiteIds: string[] | null = null;
      if (company || industry) {
        let companyQuery = supabase.from('company_career_sites').select('id').limit(10_000);
        if (company) companyQuery = companyQuery.ilike('company_name', `%${company}%`);
        if (industry) companyQuery = companyQuery.ilike('industry', `%${industry}%`);

        const { data: companyRows, error: companyError } = await companyQuery;
        if (companyError) {
          console.error('Company filter query error:', companyError);
          return new Response(
            JSON.stringify({ error: 'Failed to fetch jobs', details: companyError.message }),
            { status: 500, headers: corsHeaders }
          );
        }
        companySiteIds = (companyRows || []).map((row: { id: string }) => row.id);
      }
      // Resolve radius search to normalized cities before invoking the ranked SQL function.
      let radiusCities: string[] | null = null;
      let resolvedLocation: string | null = location;
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
          radiusCities = inRange.length > 0 ? inRange : ['__no_match__'];
          resolvedLocation = null;
          console.log(`Radius: ${inRange.length} cities within ${radiusKm}km of "${nearNorm}"`);
        } else {
          console.log(`Radius: no coords for "${nearNorm}" — falling back to substring match`);
          resolvedLocation = near;
        }
      }
      if (!radiusCities && (near || location)) {
        const locationValue = (near || location || '').trim();
        const normalizedCity = locationValue.toLowerCase().replace(/\s+/g, ' ');
        const { data: knownCity } = await supabase
          .from('city_coords')
          .select('city')
          .eq('city', normalizedCity)
          .maybeSingle();
        if (knownCity) {
          radiusCities = [knownCity.city];
          resolvedLocation = null;
        } else {
          resolvedLocation = locationValue || null;
        }
      }

      const employmentTypes = canonicalList(jobType, ['fulltime', 'parttime', 'contract', 'internship', 'other']);
      const experienceLevels = canonicalList(experienceLevel, ['junior', 'medior', 'senior', 'unknown']);
      const workplace = canonicalList(params.get('workplace_type'), ['remote', 'hybrid', 'onsite', 'unknown'])
        ?? (remote === 'true' ? ['remote', 'hybrid'] : null);
      const validCompanyId = companyId && /^[0-9a-f-]{36}$/i.test(companyId) ? companyId : null;
      const verifiedOnly = !(hasApiKey || isAdmin) || (params.get('verified') || 'true').toLowerCase() !== 'all';
      const nlOnly = !(hasApiKey || isAdmin) || (params.get('country') || 'nl').toLowerCase() !== 'all';
      const requestedSince = Number.isFinite(postedWithin) && postedWithin > 0
        ? new Date(Date.now() - postedWithin * 86_400_000).toISOString()
        : null;
      const autoExpand = phrases.length > 0 && requestedSince !== null &&
        (params.get('auto_expand') || 'true').toLowerCase() !== 'false';

      const rpcArgs = (postedSince: string | null, rpcLimit: number, rpcOffset: number) => ({
        p_terms: searchTerms,
        p_limit: rpcLimit,
        p_offset: rpcOffset,
        p_posted_since: postedSince,
        p_location: resolvedLocation,
        p_cities: radiusCities,
        p_company_ids: companySiteIds === null
          ? null
          : (companySiteIds.length > 0 ? companySiteIds : ['00000000-0000-0000-0000-000000000000']),
        p_company_id: validCompanyId,
        p_employment_types: employmentTypes,
        p_experience_levels: experienceLevels,
        p_workplace_types: workplace,
        p_internship: internship === 'true' ? true : null,
        p_has_salary: hasSalary ? true : null,
        p_ats_only: easyApply ? true : null,
        p_status: statusFilter,
        p_verified_only: verifiedOnly,
        p_nl_only: nlOnly,
      });

      let effectiveSince = requestedSince;
      let expandedRecency = false;
      const isPublicBrowse = searchTerms.length === 0 && statusFilter === 'open' && verifiedOnly && nlOnly;
      const isUnfilteredBrowse = isPublicBrowse && !resolvedLocation && !radiusCities && !companySiteIds && !validCompanyId &&
        !employmentTypes && !experienceLevels && !workplace && internship !== 'true' && !hasSalary && !easyApply;
      const jobsRpc = isPublicBrowse ? 'fairjobs_browse_jobs' : 'fairjobs_search_jobs';
      const runJobsQuery = (since: string | null) => isUnfilteredBrowse
        ? supabase.rpc('fairjobs_browse_latest', { p_limit: limit, p_offset: offset, p_posted_since: since })
        : supabase.rpc(jobsRpc, rpcArgs(since, limit, offset));
      let { data: matches, error } = await runJobsQuery(effectiveSince);
      // The first ranked page is also the sparsity probe. Only execute a second query when the
      // requested recency window genuinely has too few matches; common searches stay one RPC.
      if (!error && autoExpand && Number(matches?.[0]?.total_count || 0) < 20) {
        effectiveSince = null;
        expandedRecency = true;
        const expanded = await runJobsQuery(null);
        matches = expanded.data;
        error = expanded.error;
      }
      if (error) {
        console.error('Ranked jobs query error:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch jobs', details: error.message }), {
          status: 500, headers: corsHeaders,
        });
      }

      const rankedMatches = (matches || []) as Array<{
        id: string; search_rank: number; match_reason: string; total_count: number;
      }>;
      const matchedIds = rankedMatches.map((row) => row.id);
      const rankById = new Map(rankedMatches.map((row) => [row.id, row]));
      const total = Number(rankedMatches[0]?.total_count || 0);
      // deno-lint-ignore no-explicit-any
      let data: any[] = [];

      if (matchedIds.length > 0) {
        const hydrationFields = `
          id,
          job_title,
          job_url,
          location,
          city,
          province,
          employment_type,
          employment_type_normalized,
          department,
          salary_range,
          salary_min,
          salary_max,
          salary_currency,
          salary_period,
          ${includeDescription ? 'description,' : ''}
          is_remote,
          workplace_type,
          is_internship,
          experience_level,
          experience_level_normalized,
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
        `;
        const { data: hydrated, error: hydrateError } = await (supabase
          .from('job_opportunities') as any)
          .select(hydrationFields)
          .in('id', matchedIds);

        if (hydrateError) {
          console.error('Jobs hydration error:', hydrateError);
          return new Response(
            JSON.stringify({ error: 'Failed to fetch jobs', details: hydrateError.message }),
            { status: 500, headers: corsHeaders }
          );
        }

        // PostgREST does not preserve an IN-list; restore the global SQL rank order.
        const rowsById = new Map(
          (hydrated || []).map((row: any) => [String(row.id), row])
        );
        data = matchedIds
          .map((id: string) => rowsById.get(String(id)))
          .filter(Boolean);
      }

      // Prefer the employer's own favicon; clients fall back to a local generic mark on failure.
      const getCompanyLogoUrl = (careerUrl: string | null | undefined): string | null => {
        if (!careerUrl) return null;
        try {
          const url = new URL(careerUrl);
          return `${url.protocol}//${url.hostname}/favicon.ico`;
        } catch {
          return null;
        }
      };

      // Transform data for cleaner API response
      const jobs = data.map(job => {
        const company = job.company_career_sites as unknown as {
          id: string;
          company_name: string;
          industry: string | null;
          career_url: string;
          source_type: string | null;
        };
        const sourceType = company?.source_type ?? null;
        const isAts = typeof sourceType === 'string' && sourceType.startsWith('ats:');
        const ranked = rankById.get(job.id);
        return {
          id: job.id,
          title: job.job_title,
          match_score: Math.round(Number(ranked?.search_rank || 70)),
          match_reason: ranked?.match_reason || 'fresh vacancy',
          url: job.job_url,
          location: job.location,
          city: job.city,
          province: job.province,
          employment_type: job.employment_type,
          employment_type_normalized: job.employment_type_normalized,
          department: job.department,
          salary_range: job.salary_range,
          salary_min: job.salary_min,
          salary_max: job.salary_max,
          salary_currency: job.salary_currency,
          salary_period: job.salary_period,
          ...(includeDescription ? { description: job.description } : {}),
          is_remote: job.is_remote,
          workplace_type: job.workplace_type,
          is_internship: job.is_internship,
          experience_level: job.experience_level,
          experience_level_normalized: job.experience_level_normalized,
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
      });

      let facets: Record<string, unknown> | undefined;
      if ((params.get('include_facets') || '').toLowerCase() === 'true' && offset === 0) {
        const { data: facetData, error: facetError } = await supabase.rpc('fairjobs_search_facets', {
          p_terms: searchTerms,
          p_posted_since: effectiveSince,
          p_location: resolvedLocation,
          p_cities: radiusCities,
          p_company_ids: companySiteIds,
          p_company_id: validCompanyId,
        });
        if (!facetError && facetData && typeof facetData === 'object') facets = facetData as Record<string, unknown>;
      }

      return new Response(
        JSON.stringify({
          data: jobs,
          meta: {
            total,
            total_is_lower_bound: false,
            total_is_estimate: false,
            limit,
            offset,
            has_more: (offset + limit) < total,
            search_terms: searchTerms.length > 0 ? searchTerms : undefined,
            expanded_recency: expandedRecency,
            requested_posted_within: Number.isFinite(postedWithin) && postedWithin > 0 ? postedWithin : undefined,
            effective_posted_within: expandedRecency ? null : (Number.isFinite(postedWithin) && postedWithin > 0 ? postedWithin : null),
            facets,
          },
        }),
        { headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } }
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
            const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
            
            fetch(`${supabaseUrl}/functions/v1/scrape-jobs`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ companyId: newCompany.id }),
            }).catch(err => console.error('Scrape trigger error:', err));
            
            scrapeTriggered = true;
          } catch (err) {
            console.error('Failed to trigger scrape:', err);
          }

          // Get logo URL
          const getLogoUrl = (careerUrl: string): string | null => {
            try {
              const url = new URL(careerUrl);
              return `${url.protocol}//${url.hostname}/favicon.ico`;
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

      // Prefer the employer's own favicon.
      const getLogoUrl = (careerUrl: string | null | undefined): string | null => {
        if (!careerUrl) return null;
        try {
          const url = new URL(careerUrl);
          return `${url.protocol}//${url.hostname}/favicon.ico`;
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
      JSON.stringify({ error: 'Not found', available_endpoints: ['/api', '/api/jobs', 'GET /api/companies', 'POST /api/companies', '/api/stats', '/api/coverage', '/api/synonyms'] }),
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
