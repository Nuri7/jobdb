import { describe, expect, it } from 'vitest';
import { fingerprintAts, fingerprintHint } from '../src/resolver/fingerprint.js';

describe('fingerprintAts — URL matches (definitive)', () => {
  const cases: Array<[string, string, string]> = [
    ['https://acme.recruitee.com/', 'ats:recruitee'.slice(4), 'acme'],
    ['https://boards.greenhouse.io/coolblue', 'greenhouse', 'coolblue'],
    ['https://job-boards.greenhouse.io/adyen', 'greenhouse', 'adyen'],
    ['https://jobs.lever.co/backbase', 'lever', 'backbase'],
    ['https://jobs.eu.lever.co/mollie', 'lever', 'mollie'],
    ['https://jobs.ashbyhq.com/bunq', 'ashby', 'bunq'],
    ['https://apply.workable.com/framer/', 'workable', 'framer'],
    ['https://careers.smartrecruiters.com/Bol', 'smartrecruiters', 'Bol'],
    ['https://acme.jobs.personio.de/', 'personio', 'acme'],
    ['https://acme.jobs.personio.com/', 'personio', 'acme.jobs.personio.com'],
    ['https://acme.teamtailor.com/jobs', 'teamtailor', 'acme'],
    ['https://acme.homerun.co/', 'homerun', 'acme'],
    ['https://join.com/companies/acme-bv', 'join', 'acme-bv'],
  ];
  for (const [url, ats, board] of cases) {
    it(`${ats}: ${url}`, () => {
      const fp = fingerprintAts(url);
      expect(fp).not.toBeNull();
      expect(fp!.ats).toBe(ats);
      expect(fp!.boardId).toBe(board);
    });
  }
  it('detects lever EU region', () => {
    expect(fingerprintAts('https://jobs.eu.lever.co/mollie')!.region).toBe('eu');
  });
  it('rejects generic subdomains', () => {
    expect(fingerprintAts('https://www.recruitee.com/product')).toBeNull();
  });
});

describe('fingerprintAts — HTML corroboration', () => {
  const company = ['zorgwerk'];
  it('rejects a single stray client link', () => {
    const html = '<a href="https://someclient.recruitee.com/o/dev">client vacancy</a>';
    expect(fingerprintAts('https://agency.nl/vacatures', html, company)).toBeNull();
  });
  it('accepts repeated references', () => {
    const html =
      '<a href="https://acme.recruitee.com/o/a">a</a><script src="https://acme.recruitee.com/embed.js"></script>';
    expect(fingerprintAts('https://acme.nl/jobs', html, company)?.boardId).toBe('acme');
  });
  it('accepts a single reference when the board resembles the company', () => {
    const html = '<a href="https://zorgwerk.recruitee.com/o/x">vacatures</a>';
    expect(fingerprintAts('https://zorgwerk.nl', html, company)?.boardId).toBe('zorgwerk');
  });
});

describe('fingerprintHint', () => {
  it('labels NL platforms without adapters', () => {
    expect(fingerprintHint('https://x.nl', '<iframe src="https://x.carerix.com/vacancies">')).toBe('carerix');
    expect(fingerprintHint('https://x.myworkdayjobs.com/en-US/careers')).toBe('workday');
    expect(fingerprintHint('https://x.nl', '<p>gewone pagina</p>')).toBeNull();
  });
});
