import { useQuery } from '@tanstack/react-query';
import { jobsApi } from '@/lib/api/jobs';

export function useJobs(options?: {
  search?: string;
  location?: string;
  source?: string;
  page?: number;
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
