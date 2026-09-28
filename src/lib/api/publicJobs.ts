export type PublicJob = {
  id: string;
  title: string;
  url: string;
  location: string | null;
  city: string | null;
  province: string | null;
  employment_type: string | null;
  department: string | null;
  salary_range: string | null;
  description?: string | null;
  requirements?: string | null;
  is_remote: boolean | null;
  is_internship: boolean | null;
  experience_level: string | null;
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
  jobType?: string;
  experienceLevel?: string;
  remote?: boolean;
  internship?: boolean;
  hasSalary?: boolean;
  easyApply?: boolean;
  postedWithin?: number;
  companyId?: string;
  page?: number;
  limit?: number;
  includeDescription?: boolean;
};

type JobsResponse = {
  data: PublicJob[];
  meta: {
    total: number;
    total_is_lower_bound?: boolean;
    total_is_estimate?: boolean;
    limit: number;
    offset: number;
    has_more: boolean;
    search_terms?: string[];
  };
};

export function jobFiltersToParams(filters: JobFilters) {
  const params = new URLSearchParams();
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.location?.trim()) params.set("location", filters.location.trim());
  if (filters.jobType && filters.jobType !== "all") params.set("job_type", filters.jobType);
  if (filters.experienceLevel && filters.experienceLevel !== "all") params.set("experience_level", filters.experienceLevel);
  if (filters.remote) params.set("remote", "true");
  if (filters.internship) params.set("internship", "true");
  if (filters.hasSalary) params.set("has_salary", "true");
  if (filters.easyApply) params.set("easy_apply", "true");
  if (filters.postedWithin) params.set("posted_within", String(filters.postedWithin));
  if (filters.companyId) params.set("company_id", filters.companyId);
  if (filters.includeDescription) params.set("include_description", "true");
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

export async function fetchCities() {
  return apiFetch<{ data: { cities: { city: string; province: string | null; count: number }[]; total: number; located: number } }>("/cities");
}
