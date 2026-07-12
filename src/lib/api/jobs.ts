import { supabase } from '@/integrations/supabase/client';

export interface Job {
  id: string;
  job_title: string;
  job_url: string;
  location: string | null;
  employment_type: string | null;
  department: string | null;
  salary_range: string | null;
  description: string | null;
  is_remote: boolean | null;
  is_internship: boolean | null;
  experience_level: string | null;
  scraped_at: string;
  first_seen_at?: string | null;
  closing_date?: string | null;
  easy_apply?: boolean;
  company_name?: string;
  company_career_url?: string | null;
  industry?: string | null;
}

export interface CompanyCareerSite {
  id: string;
  company_name: string;
  career_url: string;
  industry: string | null;
  company_size: string | null;
  headquarters_city: string | null;
  crawl_status: string | null;
  jobs_found_count: number | null;
  is_scrape_enabled: boolean | null;
}

export const jobsApi = {
  async getJobs(options?: {
    search?: string;
    location?: string;
    source?: string;
    jobType?: string;
    experienceLevel?: string;
    industry?: string;
    page?: number;
    limit?: number;
    enabledCompanyIds?: string[];
  }) {
    const { search, location, source, jobType, experienceLevel, industry, page = 1, limit = 12, enabledCompanyIds } = options || {};
    
    // If search is provided, use the API endpoint for intelligent search with synonyms
    if (search && search.trim()) {
      return this.getJobsWithIntelligentSearch(options);
    }
    
    // Otherwise, use direct Supabase query for better performance
    const offset = (page - 1) * limit;

    // If industry filter is applied, first get matching company IDs
    let industryCompanyIds: string[] | null = null;
    if (industry && industry !== 'all') {
      const { data: industryCompanies } = await supabase
        .from('company_career_sites')
        .select('id')
        .ilike('industry', `%${industry}%`);
      industryCompanyIds = industryCompanies?.map(c => c.id) || [];
    }

    // Cast to any avoids TS2589 (deep generic instantiation) from the long filter
    // chain below; PostgREST return shape is mapped explicitly anyway.
    let query: any = (supabase.from('job_opportunities') as any)
      .select(`
        *,
        company_career_sites (
          company_name,
          industry,
          career_url,
          source_type,
          is_scrape_enabled
        )
      `, { count: 'exact' })
      // Confidence gate: browse shows only verified real vacancies — the SAME rule as the
      // Map's job_geo_counts RPC (status='open' AND verified=true), so a city's bubble count
      // on the Map lines up exactly with its count here after you click through.
      //
      // Deliberately NOT re-filtering is_scrape_enabled via a `!inner` join: that join forces
      // an exact COUNT over the joined set, which statement-times-out on 90k+ rows (the bug
      // that made this page show "0 jobs" until a refresh warmed the cache). verified=true is
      // the real quality gate and is what the Map counts too, so a plain left-join embed
      // (just to read company_name) keeps the count fast + exact.
      .eq('verified', true)
      .eq('status', 'open')
      .order('scraped_at', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);

    if (location && location !== 'all') {
      // Match on the normalized, indexed `city` column (idx_job_opps_city) — NOT a
      // leading-wildcard ilike on the free-text `location` (unindexable → seq scan → the
      // same statement timeout). Both the Map and the location picker hand us a normalized
      // lowercase city, so an exact match is correct and hits the index.
      query = query.eq('city', location.toLowerCase());
    }

    if (source && source !== 'all') {
      query = query.eq('company_career_site_id', source);
    } else if (industryCompanyIds !== null && industryCompanyIds.length <= 200) {
      // Filter by industry companies (bounded — large sets would blow the URL)
      query = query.in('company_career_site_id', industryCompanyIds);
    } else if (industryCompanyIds !== null) {
      query = query.ilike('company_career_sites.industry', `%${industry}%`);
    }

    if (jobType && jobType !== 'all') {
      if (jobType === 'internship') {
        query = query.eq('is_internship', true);
      } else {
        query = query.ilike('employment_type', `%${jobType}%`);
      }
    }

    if (experienceLevel && experienceLevel !== 'all') {
      query = query.ilike('experience_level', `%${experienceLevel}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching jobs:', error);
      throw error;
    }

    return {
      jobs: data?.map(job => ({
        ...job,
        company_name: job.company_career_sites?.company_name || 'Unknown Company',
        company_career_url: job.company_career_sites?.career_url || null,
        industry: job.company_career_sites?.industry || null,
        easy_apply: (job.company_career_sites?.source_type || '').startsWith('ats:'),
      })) || [],
      totalCount: count || 0,
    };
  },

  async getJobsWithIntelligentSearch(options?: {
    search?: string;
    location?: string;
    source?: string;
    jobType?: string;
    experienceLevel?: string;
    industry?: string;
    page?: number;
    limit?: number;
    enabledCompanyIds?: string[];
  }) {
    const { search, location, source, jobType, experienceLevel, industry, page = 1, limit = 12 } = options || {};
    
    // Build query params
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (location && location !== 'all') params.set('location', location);
    if (source && source !== 'all') params.set('company', source);
    if (jobType && jobType !== 'all') params.set('job_type', jobType);
    if (experienceLevel && experienceLevel !== 'all') params.set('experience_level', experienceLevel);
    if (industry && industry !== 'all') params.set('industry', industry);
    params.set('page', page.toString());
    params.set('limit', limit.toString());

    try {
      // Use direct fetch for GET request with internal headers
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      const response = await fetch(`${baseUrl}/functions/v1/api/jobs?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
          'x-internal': 'true',
        },
      });

      if (!response.ok) {
        console.error('API error:', response.status, response.statusText);
        return this.getJobsSimpleSearch(options);
      }

      const result = await response.json();
      
      // Log search terms used for debugging
      if (result?.meta?.search_terms) {
        console.log('Intelligent search terms used:', result.meta.search_terms);
      }

      return {
        jobs: result.data?.map((job: any) => ({
          id: job.id,
          // API returns 'title' and 'url' instead of 'job_title' and 'job_url'
          job_title: job.title || job.job_title,
          job_url: job.url || job.job_url,
          location: job.location,
          employment_type: job.employment_type,
          department: job.department,
          salary_range: job.salary_range,
          description: job.description,
          is_remote: job.is_remote,
          is_internship: job.is_internship,
          experience_level: job.experience_level,
          scraped_at: job.scraped_at,
          first_seen_at: job.first_seen_at,
          closing_date: job.closing_date,
          easy_apply: job.easy_apply,
          // Map from API's nested company object
          company_name: job.company?.name || job.company_name || 'Unknown Company',
          company_career_url: job.company?.career_url || job.company_career_url || null,
        })) || [],
        totalCount: result.meta?.total || 0,
        searchTerms: result.meta?.search_terms || [],
      };
    } catch (error) {
      console.error('Failed to use intelligent search:', error);
      return this.getJobsSimpleSearch(options);
    }
  },

  async getJobsSimpleSearch(options?: {
    search?: string;
    location?: string;
    source?: string;
    jobType?: string;
    experienceLevel?: string;
    industry?: string;
    page?: number;
    limit?: number;
    enabledCompanyIds?: string[];
  }) {
    const { search, location, source, jobType, experienceLevel, industry, page = 1, limit = 12, enabledCompanyIds } = options || {};
    const offset = (page - 1) * limit;

    // If industry filter is applied, first get matching company IDs
    let industryCompanyIds: string[] | null = null;
    if (industry && industry !== 'all') {
      const { data: industryCompanies } = await supabase
        .from('company_career_sites')
        .select('id')
        .ilike('industry', `%${industry}%`);
      industryCompanyIds = industryCompanies?.map(c => c.id) || [];
    }

    // Cast to any avoids TS2589 (deep generic instantiation) from the long filter
    // chain below; PostgREST return shape is mapped explicitly anyway.
    let query: any = (supabase.from('job_opportunities') as any)
      .select(`
        *,
        company_career_sites!inner (
          company_name,
          industry,
          career_url,
          source_type,
          is_scrape_enabled
        )
      `, { count: 'exact' })
      // Filter enabled companies server-side via the join — passing thousands of
      // company IDs through .in() blows the request URL past its limit
      .eq('company_career_sites.is_scrape_enabled', true)
      .eq('status', 'open')
      .order('scraped_at', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.ilike('job_title', `%${search}%`);
    }

    if (location && location !== 'all') {
      query = query.ilike('location', `%${location}%`);
    }

    if (source && source !== 'all') {
      query = query.eq('company_career_site_id', source);
    } else if (industryCompanyIds !== null && industryCompanyIds.length <= 200) {
      query = query.in('company_career_site_id', industryCompanyIds);
    } else if (industryCompanyIds !== null) {
      query = query.ilike('company_career_sites.industry', `%${industry}%`);
    }

    if (jobType && jobType !== 'all') {
      if (jobType === 'internship') {
        query = query.eq('is_internship', true);
      } else {
        query = query.ilike('employment_type', `%${jobType}%`);
      }
    }

    if (experienceLevel && experienceLevel !== 'all') {
      query = query.ilike('experience_level', `%${experienceLevel}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching jobs:', error);
      throw error;
    }

    return {
      jobs: data?.map(job => ({
        ...job,
        company_name: job.company_career_sites?.company_name || 'Unknown Company',
        company_career_url: job.company_career_sites?.career_url || null,
        industry: job.company_career_sites?.industry || null,
        easy_apply: (job.company_career_sites?.source_type || '').startsWith('ats:'),
      })) || [],
      totalCount: count || 0,
    };
  },

  async getDistinctIndustries() {
    const { data, error } = await supabase
      .from('company_career_sites')
      .select('industry')
      .not('industry', 'is', null);

    if (error) {
      console.error('Error fetching industries:', error);
      throw error;
    }

    // Extract unique industries
    const industries = new Set<string>();
    data?.forEach(company => {
      if (company.industry) {
        industries.add(company.industry);
      }
    });

    return Array.from(industries).sort();
  },

  async getCompanies() {
    const allData: any[] = [];
    const batchSize = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('company_career_sites')
        .select('*')
        .order('company_name')
        .range(offset, offset + batchSize - 1);

      if (error) {
        console.error('Error fetching companies:', error);
        throw error;
      }

      if (data && data.length > 0) {
        allData.push(...data);
        offset += batchSize;
        hasMore = data.length === batchSize;
      } else {
        hasMore = false;
      }
    }

    return allData;
  },

  async scrapeCompany(companyId: string, careerUrl: string) {
    const { data, error } = await supabase.functions.invoke('scrape-jobs', {
      body: { companyId, careerUrl },
    });

    if (error) {
      console.error('Error scraping company:', error);
      throw error;
    }

    return data;
  },

  async updateCompanyCareerUrl(companyId: string, careerUrl: string) {
    const { data, error } = await supabase
      .from('company_career_sites')
      .update({ career_url: careerUrl })
      .eq('id', companyId)
      .select()
      .single();

    if (error) {
      console.error('Error updating company:', error);
      throw error;
    }

    return data;
  },

  async deleteJobs(companyId?: string) {
    let query = supabase
      .from('job_opportunities')
      .delete();

    if (companyId) {
      query = query.eq('company_career_site_id', companyId);
    } else {
      // Delete all jobs - need a condition, so use a truthy one
      query = query.gte('id', '00000000-0000-0000-0000-000000000000');
    }

    const { error, count } = await query.select('id');

    if (error) {
      console.error('Error deleting jobs:', error);
      throw error;
    }

    // Also reset the jobs_found_count in company_career_sites
    if (companyId) {
      await supabase
        .from('company_career_sites')
        .update({ jobs_found_count: 0 })
        .eq('id', companyId);
    } else {
      // Reset all companies' job counts
      await supabase
        .from('company_career_sites')
        .update({ jobs_found_count: 0 })
        .gte('id', '00000000-0000-0000-0000-000000000000');
    }

    return { deletedCount: count || 0 };
  },

  async getDistinctLocations() {
    const { data, error } = await supabase
      .from('job_opportunities')
      .select('location')
      .not('location', 'is', null);

    if (error) {
      console.error('Error fetching locations:', error);
      throw error;
    }

    // Extract unique locations and filter for valid city names
    const validCityPattern = /^[A-Za-z\s\-']+$/;
    const locationCounts = new Map<string, number>();
    
    data?.forEach(job => {
      if (job.location) {
        // Normalize: trim, capitalize first letter
        const normalized = job.location.trim();
        // Only include if it looks like a city name (letters, spaces, hyphens, max 30 chars)
        if (normalized.length <= 30 && normalized.length >= 2 && validCityPattern.test(normalized)) {
          const key = normalized.toLowerCase();
          locationCounts.set(key, (locationCounts.get(key) || 0) + 1);
        }
      }
    });

    // Sort by count (most common first) and return unique locations
    return Array.from(locationCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([location]) => location.charAt(0).toUpperCase() + location.slice(1));
  },

  // Clean, server-aggregated city list (normalized city + province + open-job count),
  // same source the Map uses. Cities are lowercase; the ?location= filter matches them.
  async getCities(): Promise<{ city: string; province: string | null; count: number }[]> {
    const { data, error } = await (supabase as any).rpc('job_geo_counts');
    if (error) {
      console.error('Error fetching cities:', error);
      throw error;
    }
    return (data?.cities ?? []) as { city: string; province: string | null; count: number }[];
  },
};
