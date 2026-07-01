import { describe, expect, it } from 'vitest';
import { hasJobPostingLd, jobPostingsFromHtml } from '../src/sources/jsonld.js';

const single = `<html><head><script type="application/ld+json">
{"@context":"https://schema.org","@type":"JobPosting","title":"Verpleegkundige Thuiszorg",
"description":"<p>Als verpleegkundige werk je in de wijk.</p>","datePosted":"2026-05-01",
"employmentType":"PART_TIME","url":"https://zorg.nl/vacature/verpleegkundige",
"jobLocation":{"@type":"Place","address":{"addressLocality":"Heerlen","addressCountry":"NL"}},
"baseSalary":{"@type":"MonetaryAmount","currency":"EUR","value":{"minValue":3000,"maxValue":4200,"unitText":"MONTH"}}}
</script></head><body></body></html>`;

const graph = `<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
 {"@type":"WebSite","name":"x"},
 {"@type":"JobPosting","title":"Data Engineer","url":"https://x.nl/jobs/data-engineer",
  "jobLocationType":"TELECOMMUTE","description":"Remote role"}]}
</script>`;

const itemList = `<script type="application/ld+json">
{"@type":"ItemList","itemListElement":[
 {"@type":"ListItem","item":{"@type":"JobPosting","title":"Chauffeur","url":"https://x.nl/v/chauffeur"}},
 {"@type":"ListItem","item":{"@type":"JobPosting","title":"Planner","url":"https://x.nl/v/planner"}}]}
</script>`;

describe('jobPostingsFromHtml', () => {
  it('parses a full single posting', () => {
    const jobs = jobPostingsFromHtml(single, 'https://zorg.nl/vacature/verpleegkundige');
    expect(jobs).toHaveLength(1);
    const job = jobs[0]!;
    expect(job.job_title).toBe('Verpleegkundige Thuiszorg');
    expect(job.location).toBe('Heerlen, NL');
    expect(job.employment_type).toBe('Part-time');
    expect(job.posted_date).toBe('2026-05-01');
    expect(job.salary_range).toContain('3000');
    expect(job.description).toContain('wijk');
    expect(job.description).not.toContain('<p>');
  });
  it('finds postings inside @graph and flags TELECOMMUTE remote', () => {
    const jobs = jobPostingsFromHtml(graph, 'https://x.nl/jobs');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.is_remote).toBe(true);
  });
  it('unpacks ItemList postings', () => {
    const jobs = jobPostingsFromHtml(itemList, 'https://x.nl/vacatures');
    expect(jobs.map((j) => j.job_title).sort()).toEqual(['Chauffeur', 'Planner']);
  });
  it('ignores documents without postings', () => {
    expect(jobPostingsFromHtml('<script type="application/ld+json">{"@type":"WebSite"}</script>', 'https://x.nl')).toHaveLength(0);
  });
});

describe('hasJobPostingLd', () => {
  it('detects and rejects cheaply', () => {
    expect(hasJobPostingLd(single)).toBe(true);
    expect(hasJobPostingLd('<html>no ld here</html>')).toBe(false);
  });
});
