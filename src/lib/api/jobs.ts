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
  company_name?: string;
  company_career_url?: string | null;
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
}

export const jobsApi = {
  async getJobs(options?: {
    search?: string;
    location?: string;
    source?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, location, source, page = 1, limit = 12 } = options || {};
    const offset = (page - 1) * limit;

    let query = supabase
      .from('job_opportunities')
      .select(`
        *,
        company_career_sites (
          company_name,
          industry,
          career_url
        )
      `, { count: 'exact' })
      .order('scraped_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.ilike('job_title', `%${search}%`);
    }

    if (location && location !== 'all') {
      query = query.ilike('location', `%${location}%`);
    }

    if (source && source !== 'all') {
      query = query.eq('company_career_site_id', source);
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
      })) || [],
      totalCount: count || 0,
    };
  },

  async getCompanies() {
    const { data, error } = await supabase
      .from('company_career_sites')
      .select('*')
      .order('company_name');

    if (error) {
      console.error('Error fetching companies:', error);
      throw error;
    }

    return data || [];
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

    return { deletedCount: count || 0 };
  },
};
