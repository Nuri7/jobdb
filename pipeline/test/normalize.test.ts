import { describe, expect, it } from 'vitest';
import { canonicalizeUrl, contentHash, dedupeJobs, finalizeJob, isCategoryTitle, isJunkTitle, isJunkUrl } from '../src/extract/normalize.js';

describe('isCategoryTitle — plural category listings vs real singular jobs', () => {
  it('flags category/overview titles', () => {
    for (const t of ['Vacatures Engineering', 'Vacatures Verpleegkundige', 'Management Assistant vacatures in Arnhem', 'Vacatures | Toerisme', 'Openstaande vacatures']) {
      expect(isCategoryTitle(t), t).toBe(true);
    }
  });
  it('keeps real singular "Vacature <role>" and plain role titles', () => {
    for (const t of ['Vacature junior chemisch analist', 'Scooterbezorger', 'Inkoopadviseur', 'Logistiek Medewerker', 'Docent wiskunde']) {
      expect(isCategoryTitle(t), t).toBe(false);
    }
  });
});

describe('isJunkTitle — landing pages vs real "Vacature <role>" titles', () => {
  it('flags bare section/landing titles', () => {
    for (const t of ['Vacatures', 'Vacature', 'Home', 'Careers', 'Werken bij AEF', 'Onze vacatures', 'Onze arbeidsvoorwaarden', 'Werken voor Oosterhout']) {
      expect(isJunkTitle(t), t).toBe(true);
    }
  });
  it('flags info/story pages that slip through as jobs', () => {
    for (const t of ['Waarom werken bij Loetje?', 'Envida als werkgever', 'Het verhaal van Marcel Bisselink', 'Stap voor stap naar je nieuwe baan', 'Werken in Nederland']) {
      expect(isJunkTitle(t), t).toBe(true);
    }
  });
  it('flags test/placeholder/template titles', () => {
    for (const t of ['Testvacature', 'Test vacature', 'Dit is een testvacature', 'TEST Vacature', 'unavailable', 'Title of the hero block goes here.', 'Lorem ipsum dolor', 'Your title here']) {
      expect(isJunkTitle(t), t).toBe(true);
    }
  });
  it('keeps real Dutch "Vacature <role>" and real roles containing "test"', () => {
    for (const t of ['Vacature junior chemisch analist', 'Vacature Consultant Bouw', 'Vacatures Zorg team West', 'Senior Adviseur', 'Verpleegkundige thuiszorg', 'Tester', 'Test Engineer', 'Software Tester', 'QA Test Automation Engineer']) {
      expect(isJunkTitle(t), t).toBe(false);
    }
  });
});

describe('isJunkUrl — blog/news/press/video pages vs vacancy detail URLs', () => {
  it('flags blog/news/press/video URLs', () => {
    for (const u of [
      'https://highberg.com/insights/new-job-framework-for-topgeschenken',
      'https://aob.nl/actueel/artikelen/aantal-vacatures-primair-onderwijs',
      'https://vandoorne.com/artikelen/wetsvoorstellen-szw',
      'https://nieuweinstituut.nl/articles/open-call-design-fair-2026',
      'https://werkenbijvanmeijel.nl/artikelen/senior-pagina',
      'https://vimeo.com/1077928111?from=outro-embed',
      'https://example.com/blog/some-post',
      'https://example.com/nieuws/persbericht',
    ]) {
      expect(isJunkUrl(u), u).toBe(true);
    }
  });
  it('keeps real vacancy URLs, incl. jobs nested under /vacature/artikelen/', () => {
    for (const u of [
      'https://kerstentechniek.nl/vacature/artikelen/servicemonteur-e-beheer',
      'https://www.werkenbijvangelder.com/vacatures/boormedewerker-340601',
      'https://boards.greenhouse.io/acme/jobs/12345',
      'https://example.com/careers/senior-developer',
    ]) {
      expect(isJunkUrl(u), u).toBe(false);
    }
  });
});

describe('canonicalizeUrl', () => {
  it('strips tracking params, fragments and trailing slashes', () => {
    expect(canonicalizeUrl('https://Example.com/jobs/dev/?utm_source=x&gh_src=abc#apply')).toBe(
      'https://example.com/jobs/dev',
    );
  });
  it('keeps gh_jid (identifies embedded Greenhouse jobs)', () => {
    expect(canonicalizeUrl('https://acme.com/careers?gh_jid=123&utm_medium=y')).toBe(
      'https://acme.com/careers?gh_jid=123',
    );
  });
  it('upgrades http and sorts query params', () => {
    expect(canonicalizeUrl('http://a.nl/v?b=2&a=1')).toBe('https://a.nl/v?a=1&b=2');
  });
  it('resolves relative URLs against a base', () => {
    expect(canonicalizeUrl('/vacature/dev', 'https://x.nl/jobs')).toBe('https://x.nl/vacature/dev');
  });
  it('rejects junk', () => {
    expect(canonicalizeUrl('mailto:a@b.c')).toBeNull();
    expect(canonicalizeUrl('not a url')).toBeNull();
  });
});

describe('finalizeJob', () => {
  it('derives internship/remote/experience from title and text', () => {
    const job = finalizeJob({
      job_url: 'https://x.nl/vacature/stage-marketing',
      job_title: 'Stage Marketing (thuiswerk mogelijk)',
    });
    expect(job).not.toBeNull();
    expect(job!.is_internship).toBe(true);
    expect(job!.is_remote).toBe(true);
    expect(job!.experience_level).toBe('Internship');
  });
  it('detects seniority', () => {
    const job = finalizeJob({ job_url: 'https://x.nl/j/1', job_title: 'Senior Backend Developer' });
    expect(job!.experience_level).toBe('Senior');
  });
  it('rejects unusable jobs', () => {
    expect(finalizeJob({ job_url: 'nope', job_title: 'Dev' })).toBeNull();
    expect(finalizeJob({ job_url: 'https://x.nl/j', job_title: ' ' })).toBeNull();
  });
  it('produces a stable content hash', () => {
    const a = finalizeJob({ job_url: 'https://x.nl/j/1', job_title: 'Dev', location: 'Utrecht' })!;
    const b = finalizeJob({ job_url: 'https://x.nl/j/1', job_title: 'Dev', location: 'Utrecht' })!;
    const c = finalizeJob({ job_url: 'https://x.nl/j/1', job_title: 'Dev', location: 'Zwolle' })!;
    expect(a.content_hash).toBe(b.content_hash);
    expect(a.content_hash).not.toBe(c.content_hash);
  });
});

describe('dedupeJobs', () => {
  it('keeps the richer duplicate', () => {
    const short = finalizeJob({ job_url: 'https://x.nl/j/1', job_title: 'Dev', description: 'a' })!;
    const long = finalizeJob({ job_url: 'https://x.nl/j/1', job_title: 'Dev', description: 'much longer description' })!;
    expect(dedupeJobs([short, long])).toHaveLength(1);
    expect(dedupeJobs([short, long])[0]!.description).toContain('longer');
  });
});

describe('contentHash', () => {
  it('ignores volatile fields', () => {
    const base = { job_url: 'https://x.nl/1', job_title: 'Dev', description: 'd' };
    expect(contentHash({ ...base, posted_date: '2026-01-01' })).toBe(contentHash({ ...base, posted_date: '2026-06-01' }));
  });
});
