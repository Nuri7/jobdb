import { describe, expect, it } from 'vitest';
import { parseWorkdayBoardId, workdaySource } from '../src/sources/ats/workday.js';
import type { CompanyRow, Ctx, FetchTextOpts } from '../src/types.js';

const company: CompanyRow = {
  id: '00000000-0000-0000-0000-000000000001',
  company_name: 'Acme',
  career_url: 'https://acme.wd3.myworkdayjobs.com/en-US/Careers',
  website: 'https://acme.example',
  career_page_status: 'verified',
  source_type: 'ats:workday',
  source_config: {
    resolved_url: 'https://acme.wd3.myworkdayjobs.com/en-US/Careers',
    board_id: 'acme.wd3.myworkdayjobs.com|Careers',
  },
  is_scrape_enabled: true,
  is_active: true,
  consecutive_failures: 0,
  check_interval_hours: 24,
  next_check_at: new Date().toISOString(),
  last_success_at: null,
  jobs_found_count: 0,
};

describe('Workday adapter', () => {
  it('parses host, tenant and site from the stored board id', () => {
    expect(parseWorkdayBoardId('acme.wd3.myworkdayjobs.com|Careers')).toEqual({
      host: 'acme.wd3.myworkdayjobs.com', tenant: 'acme', site: 'Careers',
    });
    expect(parseWorkdayBoardId('not-a-board')).toBeNull();
  });

  it('pages the CXS API and produces verified canonical jobs plus a complete live set', async () => {
    const requests: Array<{ url: string; opts?: FetchTextOpts }> = [];
    const ctx: Ctx = {
      dryRun: true,
      log: () => {},
      llm: null,
      robotsAllowed: async () => true,
      fetchText: async (url, opts) => {
        requests.push({ url, opts });
        return {
          status: 200,
          finalUrl: url,
          contentType: 'application/json',
          text: JSON.stringify({
            total: 2,
            jobPostings: [
              { title: 'Data Engineer', externalPath: '/job/Amsterdam/Data-Engineer_R1', locationsText: 'Amsterdam', bulletFields: ['Full time'] },
              { title: 'Security Specialist', externalPath: '/job/Utrecht/Security_R2', locationsText: 'Utrecht', bulletFields: ['Part time'] },
            ],
          }),
        };
      },
    };

    const jobs = await workdaySource.fetchJobs(company, ctx);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://acme.wd3.myworkdayjobs.com/wday/cxs/acme/Careers/jobs');
    expect(requests[0]?.opts?.method).toBe('POST');
    expect(jobs.map((job) => job.job_title)).toEqual(['Data Engineer', 'Security Specialist']);
    expect(jobs.every((job) => job.verified)).toBe(true);
    expect(jobs[0]?.city).toBe('amsterdam');
    expect(ctx.liveUrlsComplete).toBe(true);
    expect(ctx.liveUrls?.size).toBe(2);
  });
});
