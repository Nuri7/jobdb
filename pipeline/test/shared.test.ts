import { describe, expect, it } from 'vitest';
import { extractJobLinks, findNextPage, hasBlockedSegment, isCareerSectionUrl, jobFromDetailHtml } from '../src/sources/shared.js';
import { filterJobEntries } from '../src/sources/sitemap.js';

const listing = `<html><body><main>
<a href="/vacatures/senior-developer-utrecht">Senior Developer</a>
<a href="/vacatures/verpleegkundige-nachtdienst">Verpleegkundige nachtdienst</a>
<a href="/vacatures/">Alle vacatures</a>
<a href="/over-ons">Over ons</a>
<a href="/vacatures/jobalert">Job alert</a>
<a href="https://extern.nl/vacature/x">Externe</a>
<a href="/privacy">Privacy</a>
<a rel="next" href="/vacatures?page=2">»</a>
</main></body></html>`;

describe('extractJobLinks', () => {
  const links = extractJobLinks(listing, 'https://acme.nl/vacatures/');
  it('finds real job links and skips noise', () => {
    const urls = links.map((l) => l.url);
    expect(urls).toContain('https://acme.nl/vacatures/senior-developer-utrecht');
    expect(urls).toContain('https://acme.nl/vacatures/verpleegkundige-nachtdienst');
    expect(urls.join()).not.toContain('over-ons');
    expect(urls.join()).not.toContain('jobalert');
    expect(urls.join()).not.toContain('extern.nl');
    expect(urls.join()).not.toContain('privacy');
  });
  it('does not return the listing itself', () => {
    expect(links.map((l) => l.url)).not.toContain('https://acme.nl/vacatures/');
  });
});

describe('findNextPage', () => {
  it('follows rel=next', () => {
    expect(findNextPage(listing, 'https://acme.nl/vacatures/')).toBe('https://acme.nl/vacatures?page=2');
  });
  it('returns null without pagination', () => {
    expect(findNextPage('<a href="/x">x</a>', 'https://a.nl')).toBeNull();
  });
});

describe('isCareerSectionUrl — reject section landing pages', () => {
  it('flags bare career-section roots', () => {
    for (const u of [
      'https://www.aef.nl/werken-bij',
      'https://www.aef.nl/vacatures',
      'https://x.nl/careers/',
      'https://x.nl/werken-bij#vacancies',
      'https://x.nl/nl/jobs',
      'https://x.nl',
    ]) {
      expect(isCareerSectionUrl(u), u).toBe(true);
    }
  });
  it('keeps real job detail URLs with a slug after the section word', () => {
    for (const u of [
      'https://www.aef.nl/vacatures/senior-adviseur-utrecht',
      'https://x.nl/werken-bij/data-engineer',
      'https://x.recruitee.com/o/docent-mediamaken',
      'https://careers.bol.com/en/jobs/data-engineer/8341587002',
    ]) {
      expect(isCareerSectionUrl(u), u).toBe(false);
    }
  });
});

describe('AEF-style false positive is rejected', () => {
  it('does not turn a /werken-bij landing page into a job', () => {
    const html = `<html><head><meta property="og:site_name" content="AEF">
      <title>Werken bij AEF</title></head><body><main><h1>Werken bij AEF</h1>
      <p>Solliciteer op onze vacatures. Wat wij bieden: goede arbeidsvoorwaarden en salaris.
      ${'x'.repeat(300)}</p></main></body></html>`;
    // both by URL and by title
    expect(jobFromDetailHtml(html, 'https://www.aef.nl/werken-bij')).toBeNull();
    expect(jobFromDetailHtml(html, 'https://www.aef.nl/vacatures/echte-baan')).toBeNull(); // junk title
  });
  it('extractJobLinks skips the /werken-bij section link', () => {
    const listing = `<main>
      <a href="/werken-bij">Werken bij</a>
      <a href="/vacatures/senior-adviseur-utrecht">Senior Adviseur</a>
    </main>`;
    const urls = extractJobLinks(listing, 'https://www.aef.nl/vacatures').map((l) => l.url);
    expect(urls.some((u) => u.endsWith('/werken-bij'))).toBe(false);
    expect(urls).toContain('https://www.aef.nl/vacatures/senior-adviseur-utrecht');
  });
});

describe('jobFromDetailHtml — apply-affordance gate (AEF + Koskamp)', () => {
  const body = `<h1>{TITLE}</h1><p>Wat ga je doen: rijden. Wij bieden een goed salaris, 32 uur per week.
    Jouw profiel. ${'x'.repeat(200)}</p>`;
  it('rejects a page with NO apply button (landing/info page)', () => {
    const html = `<main>${body.replace('{TITLE}', 'Accountmanager')}</main>`;
    expect(jobFromDetailHtml(html, 'https://x.nl/vacatures/iets')).toBeNull();
  });
  it('rejects a category page with 3+ distinct apply targets (Koskamp /vacatures/sales)', () => {
    const cats = ['sales', 'logistiek', 'finance', 'ict']
      .map((c) => `<div><h3>Job ${c}</h3><a href="/vacatures/${c}/apply">Solliciteer</a></div>`)
      .join('');
    const html = `<main><h1>Accountmanager</h1>${cats}<p>Wij bieden salaris, 32 uur per week, jouw profiel ${'x'.repeat(200)}</p></main>`;
    expect(jobFromDetailHtml(html, 'https://werkenbijkoskamp.nl/vacatures/sales')).toBeNull();
  });
  it('accepts a real single job with one apply button (verified=true)', () => {
    const html = `<main>${body.replace('{TITLE}', 'Senior Accountmanager Utrecht')}
      <a href="/vacatures/senior-accountmanager/solliciteren">Solliciteer direct</a></main>`;
    const job = jobFromDetailHtml(html, 'https://x.nl/vacatures/senior-accountmanager-utrecht');
    expect(job).not.toBeNull();
    expect(job!.job_title).toBe('Senior Accountmanager Utrecht');
    expect(job!.verified).toBe(true); // has a real apply element
  });
  it('marks prose-only "solliciteer" (no apply element) as verified=false', () => {
    const html = `<main><h1>Chauffeur</h1><p>Wat ga je doen: rijden. Wij bieden salaris, 32 uur per week,
      jouw profiel. Solliciteer via de mail. ${'x'.repeat(200)}</p></main>`;
    const job = jobFromDetailHtml(html, 'https://x.nl/vacatures/chauffeur-b');
    expect(job).not.toBeNull(); // still created (prose apply)
    expect(job!.verified).toBe(false); // but not servable — no real apply element
  });
});

describe('jobFromDetailHtml — vacancy signal gate', () => {
  it('accepts a page with real vacancy signals', () => {
    const html = `<html><head><title>Chauffeur | Acme</title></head><body><main><h1>Chauffeur B</h1>
      <p>Wat ga je doen: rijden. Wij bieden een goed salaris en 32 uur per week.
      Solliciteer direct via de knop. ${'x'.repeat(120)}</p></main></body></html>`;
    const job = jobFromDetailHtml(html, 'https://acme.nl/vacatures/chauffeur-b');
    expect(job).not.toBeNull();
    expect(job!.job_title).toBe('Chauffeur B');
  });
  it('rejects marketing pages without signals', () => {
    const html = `<html><body><main><h1>Onze waarden</h1><p>Wij zijn een geweldig bedrijf met een mooie cultuur.
      ${'y'.repeat(200)}</p></main></body></html>`;
    expect(jobFromDetailHtml(html, 'https://acme.nl/werken-bij/onze-waarden')).toBeNull();
  });
  it('rejects site-slogan h1 pages', () => {
    const html = `<html><head><meta property="og:site_name" content="Wat je zoekt vind je bij bol"></head>
      <body><h1>Wat je zoekt vind je bij bol</h1><p>Solliciteer! Wij bieden alles. Apply now for everything. ${'z'.repeat(200)}</p></body></html>`;
    expect(jobFromDetailHtml(html, 'https://careers.bol.com/nl/jobalert')).toBeNull();
  });
});

describe('sitemap filterJobEntries + blocked segments', () => {
  it('keeps job details, drops listings and info pages', () => {
    const entries = [
      { loc: 'https://careers.bol.com/nl/vacatures/' },
      { loc: 'https://careers.bol.com/en/jobs/data-engineer/8341587002' },
      { loc: 'https://careers.bol.com/nl/werken-bij/esg' },
      { loc: 'https://careers.bol.com/nl/jobalert' },
      { loc: 'https://careers.bol.com/nl/werken-bij/de-sollicitatieprocedure' },
      { loc: 'https://careers.bol.com/nl/vacatures/lead-engineer-utrecht' },
      { loc: 'https://andere-site.nl/vacatures/x' },
    ];
    const kept = filterJobEntries(entries, 'https://careers.bol.com/nl/vacatures/').map((e) => e.loc);
    expect(kept).toContain('https://careers.bol.com/en/jobs/data-engineer/8341587002');
    expect(kept).toContain('https://careers.bol.com/nl/vacatures/lead-engineer-utrecht');
    expect(kept).toHaveLength(2);
  });
  it('hasBlockedSegment matches exact segments only', () => {
    expect(hasBlockedSegment('/nl/werken-bij/esg')).toBe(true);
    expect(hasBlockedSegment('/vacatures/adviseur-diversiteit-en-inclusie-senior')).toBe(false);
  });
});
