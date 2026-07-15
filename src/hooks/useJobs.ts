import { useQuery } from '@tanstack/react-query';
import { jobsApi } from '@/lib/api/jobs';

export function useJobs(options?: {
  search?: string;
  location?: string;
  source?: string;
  jobType?: string;
  experienceLevel?: string;
  industry?: string;
  page?: number;
}) {
  return useQuery({
    queryKey: ['jobs', options],
    queryFn: () => jobsApi.getJobs(options),
    // Cache each distinct filter combo (every city, tab and page has its own key) for 5 min so
    // clicking between cities and back is instant instead of re-hitting the DB every time. The
    // board only changes when the scraper runs, so 5-min-stale results are fine.
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useCompanies() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: () => jobsApi.getCompanies(),
  });
}

export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    queryFn: () => jobsApi.getDistinctLocations(),
  });
}

export function useCities() {
  return useQuery({
    queryKey: ['cities'],
    queryFn: () => jobsApi.getCities(),
    staleTime: 10 * 60 * 1000,
  });
}

export function useIndustries() {
  return useQuery({
    queryKey: ['industries'],
    queryFn: () => jobsApi.getDistinctIndustries(),
  });
}
