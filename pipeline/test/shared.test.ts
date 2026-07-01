import { describe, expect, it } from 'vitest';
import { extractJobLinks, findNextPage, hasBlockedSegment, jobFromDetailHtml } from '../src/sources/shared.js';
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
