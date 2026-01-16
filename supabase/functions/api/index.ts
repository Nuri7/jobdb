import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Content-Type': 'application/json',
};

// Hash function for API key validation
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
    const path = url.pathname.replace('/api', '');
    const params = url.searchParams;

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
                search: 'Search in job titles',
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
            'GET /api/stats': {
              description: 'Get aggregate statistics',
            },
          },
        }),
        { headers: corsHeaders }
      );
    }

    // Validate API key for all other endpoints
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


    // Route: GET /jobs
    if (path === '/jobs' || path === '/jobs/') {
      const limit = Math.min(parseInt(params.get('limit') || '50'), 100);
      const offset = parseInt(params.get('offset') || '0');
      const search = params.get('search');
      const location = params.get('location');
      const company = params.get('company');
      const jobType = params.get('job_type');
      const experienceLevel = params.get('experience_level');
      const remote = params.get('remote');
      const internship = params.get('internship');

      let query = supabase
        .from('job_opportunities')
        .select(`
          id,
          job_title,
          job_url,
          location,
          employment_type,
          department,
          salary_range,
          description,
          is_remote,
          is_internship,
          experience_level,
          scraped_at,
          company_career_sites!inner (
            id,
            company_name,
            industry,
            career_url,
            is_scrape_enabled
          )
        `, { count: 'exact' })
        .eq('company_career_sites.is_scrape_enabled', true)
        .order('scraped_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (search) {
        query = query.ilike('job_title', `%${search}%`);
      }
      if (location) {
        query = query.ilike('location', `%${location}%`);
      }
      if (company) {
        query = query.ilike('company_career_sites.company_name', `%${company}%`);
      }
      if (jobType) {
        query = query.ilike('employment_type', `%${jobType}%`);
      }
      if (experienceLevel) {
        query = query.ilike('experience_level', `%${experienceLevel}%`);
      }
      if (remote === 'true') {
        query = query.eq('is_remote', true);
      }
      if (internship === 'true') {
        query = query.eq('is_internship', true);
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
        };
        return {
          id: job.id,
          title: job.job_title,
          url: job.job_url,
          location: job.location,
          employment_type: job.employment_type,
          department: job.department,
          salary_range: job.salary_range,
          description: job.description,
          is_remote: job.is_remote,
          is_internship: job.is_internship,
          experience_level: job.experience_level,
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

      return new Response(
        JSON.stringify({
          data: jobs,
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

    // Route: GET /companies
    if (path === '/companies' || path === '/companies/') {
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

    // Route: GET /stats
    if (path === '/stats' || path === '/stats/') {
      const [jobsResult, companiesResult] = await Promise.all([
        supabase
          .from('job_opportunities')
          .select('id', { count: 'exact', head: true }),
        supabase
          .from('company_career_sites')
          .select('id', { count: 'exact', head: true })
          .eq('is_scrape_enabled', true),
      ]);

      return new Response(
        JSON.stringify({
          data: {
            total_jobs: jobsResult.count || 0,
            total_companies: companiesResult.count || 0,
          },
        }),
        { headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Not found', available_endpoints: ['/api', '/api/jobs', '/api/companies', '/api/stats'] }),
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
