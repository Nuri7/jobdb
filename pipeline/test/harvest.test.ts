import { describe, expect, it } from 'vitest';
import { tokensFromCcLines, tokensFromCcPaths } from '../src/harvest/commoncrawl.js';
import { cleanCompanyName, isNlLocation, titleize } from '../src/harvest/validators.js';
import { homerunJobsFromEntries, parseHomerunFeed } from '../src/sources/ats/homerun.js';

describe('tokensFromCcLines', () => {
  it('extracts single-label tenant tokens, drops infra/multi-label/dupes/foreign/garbage', () => {
    const lines = [
      '{"url":"https://acme.recruitee.com/"}',
      '{"url":"https://acme.recruitee.com/o/some-job-123"}', // same host → deduped
      '{"url":"https://bol-com.recruitee.com/"}',
      '{"url":"https://groundcontrol.s.recruitee.com/"}', // multi-label (platform shard) → dropped
      '{"url":"https://www.recruitee.com/"}', // infra
      '{"url":"https://docs.recruitee.com/"}', // infra
      '{"url":"https://other.example.com/"}', // wrong base domain
      'not-json', // truncated/garbage line → skipped
    ];
    expect(tokensFromCcLines(lines, 'recruitee.com').sort()).toEqual(['acme', 'bol-com']);
  });

  it('handles homerun.co base and empty input', () => {
    expect(tokensFromCcLines(['{"url":"https://startup.homerun.co/vacancies"}'], 'homerun.co')).toEqual(['startup']);
    expect(tokensFromCcLines([], 'recruitee.com')).toEqual([]);
  });
});

describe('tokensFromCcPaths (path-based ATS like Greenhouse)', () => {
  it('extracts the first path segment on the given hosts, dropping infra/embed/dupes', () => {
    const lines = [
      '{"url":"https://boards.greenhouse.io/adyen/jobs/123"}',
      '{"url":"https://boards.greenhouse.io/adyen"}', // same token → deduped
      '{"url":"https://job-boards.greenhouse.io/coolblue/jobs/9"}',
      '{"url":"https://boards.greenhouse.io/embed/job_app?token=1"}', // embed → dropped
      '{"url":"https://www.greenhouse.io/customers"}', // wrong host → dropped
    ];
    expect(tokensFromCcPaths(lines, ['boards.greenhouse.io', 'job-boards.greenhouse.io']).sort()).toEqual([
      'adyen',
      'coolblue',
    ]);
  });
});

describe('isNlLocation', () => {
  it('accepts known NL cities and provinces', () => {
    expect(isNlLocation('Amsterdam')).toBe(true);
    expect(isNlLocation('Rotterdam, Zuid-Holland')).toBe(true);
    expect(isNlLocation('Utrecht, Netherlands')).toBe(true);
    expect(isNlLocation('Maastricht')).toBe(true);
  });

  it('accepts explicit country hints/markers', () => {
    expect(isNlLocation(undefined, 'NL')).toBe(true);
    expect(isNlLocation('Anytown', 'Netherlands')).toBe(true);
    expect(isNlLocation('Nederland')).toBe(true);
  });

  it('rejects foreign and empty locations', () => {
    expect(isNlLocation('Berlin')).toBe(false);
    expect(isNlLocation('London, UK')).toBe(false);
    expect(isNlLocation(undefined)).toBe(false);
    expect(isNlLocation('Remote')).toBe(false); // no country signal → cannot confirm NL
  });
});

describe('titleize', () => {
  it('humanizes board tokens', () => {
    expect(titleize('acme-bv')).toBe('Acme Bv');
    expect(titleize('cool_blue_group')).toBe('Cool Blue Group');
  });
});

describe('cleanCompanyName', () => {
  it('strips careers boilerplate, including stacked prefixes', () => {
    expect(cleanCompanyName('Vacatures - Werken bij Douglas NL')).toBe('Douglas NL');
    expect(cleanCompanyName('Werken bij Bitonic')).toBe('Bitonic');
    expect(cleanCompanyName('Careers at Anna + Nina')).toBe('Anna + Nina');
    expect(cleanCompanyName('Jobs | Aroma Club')).toBe('Aroma Club');
    expect(cleanCompanyName('Acme BV - Vacatures')).toBe('Acme BV');
  });

  it('leaves clean names untouched and never returns empty', () => {
    expect(cleanCompanyName('A DAM Six Senses')).toBe('A DAM Six Senses');
    expect(cleanCompanyName('EIGHT ADVISORY SAS')).toBe('EIGHT ADVISORY SAS');
    expect(cleanCompanyName('Vacatures')).toBe('Vacatures'); // nothing left to strip → keep raw
  });
});

const HOMERUN_FEED = `<?xml version="1.0" encoding="UTF-8" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="text">Acme BV</title>
  <subtitle type="html"><![CDATA[We build things.]]></subtitle>
  <entry>
    <title type="text">Senior Marketeer</title>
    <link rel="alternate" type="text/html" href="https://acme.homerun.co/senior-marketeer"></link>
    <id>job_ABC</id>
    <summary type="html"><![CDATA[Join us]]></summary>
    <department><name>Marketing</name></department>
    <location><name>Amersfoort</name></location>
    <type><name>Full-time</name></type>
    <updated>2026-06-24 09:48:03</updated>
  </entry>
  <entry>
    <title type="text">Backend Engineer</title>
    <link rel="alternate" type="text/html" href="https://acme.homerun.co/backend-engineer"></link>
    <location><name>Amsterdam</name></location>
    <type><name>Full-time</name></type>
  </entry>
</feed>`;

describe('parseHomerunFeed', () => {
  it('extracts title, detail url, location, department, type from Atom entries', () => {
    const entries = parseHomerunFeed(HOMERUN_FEED);
    expect(entries.length).toBe(2);
    expect(entries[0]).toMatchObject({
      title: 'Senior Marketeer',
      url: 'https://acme.homerun.co/senior-marketeer',
      location: 'Amersfoort',
      department: 'Marketing',
      type: 'Full-time',
    });
    expect(entries[1]?.url).toBe('https://acme.homerun.co/backend-engineer');
  });

  it('handles empty/garbage feeds without throwing', () => {
    expect(parseHomerunFeed('')).toEqual([]);
    expect(parseHomerunFeed('<feed></feed>')).toEqual([]);
  });

  it('builds canonical NL jobs (verified) from feed entries', () => {
    const jobs = homerunJobsFromEntries(parseHomerunFeed(HOMERUN_FEED));
    expect(jobs.length).toBe(2);
    expect(jobs.every((j) => j.verified)).toBe(true);
    const marketeer = jobs.find((j) => j.job_title === 'Senior Marketeer');
    expect(marketeer?.city).toBe('amersfoort');
    expect(marketeer?.province).toBe('Utrecht');
  });
});
