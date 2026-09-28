export type PublicJob = {
  id: string;
  title: string;
  url: string;
  location: string | null;
  city: string | null;
  province: string | null;
  employment_type: string | null;
  employment_type_normalized?: string | null;
  department: string | null;
  salary_range: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  salary_period?: string | null;
  description?: string | null;
  requirements?: string | null;
  is_remote: boolean | null;
  workplace_type?: string | null;
  is_internship: boolean | null;
  experience_level: string | null;
  experience_level_normalized?: string | null;
  posted_date: string | null;
  closing_date: string | null;
  first_seen_at: string | null;
  scraped_at: string;
  easy_apply: boolean;
  ats: string | null;
  company_logo?: string | null;
  company: {
    id: string;
    name: string;
    industry: string | null;
    career_url: string;
  };
};

export type JobFilters = {
  search?: string;
  location?: string;
  radiusKm?: number;
  jobType?: string;
  experienceLevel?: string;
  workplaceType?: string;
  remote?: boolean;
  internship?: boolean;
  hasSalary?: boolean;
  easyApply?: boolean;
  postedWithin?: number;
  companyId?: string;
  page?: number;
  limit?: number;
  includeDescription?: boolean;
  includeFacets?: boolean;
};

export type JobFacets = {
  employment_type?: Record<string, number>;
  experience_level?: Record<string, number>;
  workplace_type?: Record<string, number>;
  province?: Record<string, number>;
  salary?: { available?: number };
  internship?: { available?: number };
};

export type JobsResponse = {
  data: PublicJob[];
  meta: {
    total: number;
    total_is_lower_bound?: boolean;
    total_is_estimate?: boolean;
    limit: number;
    offset: number;
    has_more: boolean;
    search_terms?: string[];
    expanded_recency?: boolean;
    requested_posted_within?: number;
    effective_posted_within?: number | null;
    facets?: JobFacets;
  };
};

export function jobFiltersToParams(filters: JobFilters) {
  const params = new URLSearchParams();
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.location?.trim()) {
    if (filters.radiusKm) {
      params.set("near", filters.location.trim());
      params.set("radius_km", String(filters.radiusKm));
    } else {
      params.set("location", filters.location.trim());
    }
  }
  if (filters.jobType && filters.jobType !== "all") params.set("job_type", filters.jobType);
  if (filters.experienceLevel && filters.experienceLevel !== "all") params.set("experience_level", filters.experienceLevel);
  if (filters.workplaceType && filters.workplaceType !== "all") params.set("workplace_type", filters.workplaceType);
  if (filters.remote) params.set("remote", "true");
  if (filters.internship) params.set("internship", "true");
  if (filters.hasSalary) params.set("has_salary", "true");
  if (filters.easyApply) params.set("easy_apply", "true");
  if (filters.postedWithin) params.set("posted_within", String(filters.postedWithin));
  if (filters.companyId) params.set("company_id", filters.companyId);
  if (filters.includeDescription) params.set("include_description", "true");
  if (filters.includeFacets) params.set("include_facets", "true");
  const limit = filters.limit ?? 24;
  const page = Math.max(1, filters.page ?? 1);
  params.set("limit", String(limit));
  params.set("offset", String((page - 1) * limit));
  return params;
}

function apiBase() {
  if (import.meta.env.DEV) {
    return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api`;
  }
  return "/api";
}

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(response.status === 404 ? "Vacature niet gevonden" : "De vacatures konden niet worden geladen");
  return response.json() as Promise<T>;
}

export async function fetchJobs(filters: JobFilters = {}) {
  return apiFetch<JobsResponse>(`/jobs?${jobFiltersToParams(filters).toString()}`);
}

export async function fetchJob(id: string) {
  const response = await apiFetch<{ data: PublicJob }>(`/jobs/${encodeURIComponent(id)}`);
  return response.data;
}

export type JobSuggestions = { titles: string[]; companies: string[]; cities: string[] };

export async function fetchJobSuggestions(query: string) {
  const response = await apiFetch<{ data: JobSuggestions }>(`/jobs/suggestions?q=${encodeURIComponent(query)}`);
  return response.data;
}

export async function fetchCities() {
  return apiFetch<{ data: { cities: { city: string; province: string | null; count: number }[]; total: number; located: number } }>("/cities");
}
