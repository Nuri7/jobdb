import { describe, expect, it } from 'vitest';
import { extractJobLinks, findNextPage, hasBlockedSegment, isCareerSectionUrl, isSpecificJobDetailUrl, jobFromDetailHtml } from '../src/sources/shared.js';
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

describe('isSpecificJobDetailUrl — recovers JS-apply real jobs, excludes junk', () => {
  it('accepts specific vacancy detail URLs', () => {
    for (const u of [
      'https://www.leek.nl/werken/vacatures/scooterbezorger',
      'https://werkenbijwshd.nl/vacatures/inkoopadviseur',
      'https://jobs.mollie.com/vacancies/d056f390-1d70-408e',
      'https://werkenbij.previder.nl/vacatures/2592683/it-support-specialist-28',
      'https://werkenbijhezelburcht.com/o/consultant-innovatie-it-22',
    ]) {
      expect(isSpecificJobDetailUrl(u), u).toBe(true);
    }
  });
  it('rejects listings, sections, blogs, products, courses', () => {
    for (const u of [
      'https://www.aef.nl/vacatures',
      'https://www.aef.nl/werken-bij',
      'https://wts-global.com/hot-topics/vida-global',
      'https://tba.group/software/industrial-automation',
      'https://www.isbw.nl/opleiding/post-hbo-hrm',
      'https://www.marktplaats.nl/l/vacatures/toerisme',
    ]) {
      expect(isSpecificJobDetailUrl(u), u).toBe(false);
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
  it('extracts location from a "Locatie:" label and populates city/province', () => {
    const html = `<main><h1>Verpleegkundige</h1>
      <p>Locatie: Amersfoort. Wat ga je doen: zorgen. Wij bieden salaris, 32 uur per week, jouw profiel. ${'x'.repeat(200)}</p>
      <a href="/apply">Solliciteer direct</a></main>`;
    const job = jobFromDetailHtml(html, 'https://x.nl/vacatures/verpleegkundige');
    expect(job).not.toBeNull();
    expect(job!.location).toBe('Amersfoort');
    expect(job!.city).toBe('amersfoort');
    expect(job!.province).toBe('Utrecht');
  });
  it('recovers location from a known NL city in the job title', () => {
    const html = `<main><h1>GZ Psycholoog ziekenhuis Rotterdam</h1>
      <p>Wat ga je doen: behandelen. Wij bieden salaris, 36 uur per week, jouw profiel. ${'x'.repeat(200)}</p>
      <a href="/apply">Solliciteer</a></main>`;
    const job = jobFromDetailHtml(html, 'https://x.nl/vacatures/gz-psycholoog-rotterdam');
    expect(job!.city).toBe('rotterdam');
    expect(job!.province).toBe('Zuid-Holland');
  });
  it('recovers a prose-only job on a specific detail URL as verified=true (balanced rule)', () => {
    const html = `<main><h1>Chauffeur bezorger regio Utrecht</h1><p>Wat ga je doen: rijden. Wij bieden salaris,
      32 uur per week, jouw profiel. Solliciteer via de mail. ${'x'.repeat(200)}</p></main>`;
    const job = jobFromDetailHtml(html, 'https://x.nl/vacatures/chauffeur-bezorger-regio-utrecht');
    expect(job).not.toBeNull();
    expect(job!.verified).toBe(true); // specific detail URL -> real JS-apply job recovered
  });
  it('leaves a prose-only job on a NON-detail URL as verified=false', () => {
    const html = `<main><h1>Chauffeur</h1><p>Wat ga je doen: rijden. Wij bieden salaris, 32 uur per week,
      jouw profiel. Solliciteer via de mail. ${'x'.repeat(200)}</p></main>`;
    const job = jobFromDetailHtml(html, 'https://x.nl/over-werken/iets');
    // /over-werken/iets is not a job-path detail -> not confidently a vacancy
    if (job) expect(job.verified).toBe(false);
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
    // Cross-domain job detail pages are kept by design (a "werkenbij…" sitemap often points at
    // job pages on the main brand domain) — only aggregators/listings/info pages are dropped.
    expect(kept).toContain('https://andere-site.nl/vacatures/x');
    expect(kept).toHaveLength(3);
  });
  it('drops Radancy-style facet pages whose slug ends in -jobs, keeps real /job/ details', () => {
    const entries = [
      { loc: 'https://careers.ing.com/en/job/amsterdam/data-engineer/3121/41150025152' },
      { loc: 'https://careers.ing.com/en/location/netherlands-jobs/2618/2750405/2' },
      { loc: 'https://careers.ing.com/en/business/technology-jobs/2618/798544/2' },
      { loc: 'https://careers.ing.com/en/employment/full-time-jobs/2618/798549/2' },
      { loc: 'https://careers.ing.com/en/category/it-engineering-jobs/2618/32177152/1' },
    ];
    const kept = filterJobEntries(entries, 'https://careers.ing.com/').map((e) => e.loc);
    expect(kept).toEqual(['https://careers.ing.com/en/job/amsterdam/data-engineer/3121/41150025152']);
  });
  it('hasBlockedSegment matches exact segments only', () => {
    expect(hasBlockedSegment('/nl/werken-bij/esg')).toBe(true);
    expect(hasBlockedSegment('/vacatures/adviseur-diversiteit-en-inclusie-senior')).toBe(false);
  });
});
