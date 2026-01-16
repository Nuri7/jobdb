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
  enabledCompanyIds?: string[];
}) {
  return useQuery({
    queryKey: ['jobs', options],
    queryFn: () => jobsApi.getJobs(options),
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

export function useIndustries() {
  return useQuery({
    queryKey: ['industries'],
    queryFn: () => jobsApi.getDistinctIndustries(),
  });
}
