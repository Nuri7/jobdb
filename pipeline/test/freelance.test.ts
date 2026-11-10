import { describe, expect, it } from 'vitest';
import { freelanceEligibility } from '../src/extract/freelance.js';
import { assignmentDate, parseFlextender, parseOverheid, parseStriive, striiveSource } from '../src/sources/freelance.js';
import type { CompanyRow, Ctx } from '../src/types.js';
import { contentHash } from '../src/extract/normalize.js';

describe('freelance eligibility', () => {
  it.each(['Geen ZZP', 'Niet geschikt voor zzp’ers', 'Enkel detachering!', 'uitsluitend via payroll', 'Freelancers zijn uitgesloten'])('exclusions override a board category: %s', value => {
    expect(freelanceEligibility(value, true)).toBe(false);
  });
  it('does not call every temporary or interim role freelance', () => {
    expect(freelanceEligibility('Interim Product Owner, 6 maanden')).toBeNull();
    expect(freelanceEligibility('ZZP mogelijk')).toBe(true);
    expect(freelanceEligibility('Een zelfstandig opdrachtnemer')).toBe(true);
  });
});

describe('assignment extraction', () => {
  it('keeps Dutch calendar dates and converts Striive UTC midnight to local dates', () => {
    expect(assignmentDate('4 januari 2027')).toBe('2027-01-04');
    expect(assignmentDate('2026-11-30T23:00:00', true)).toBe('2026-12-01');
    expect(assignmentDate('2026-11-30')).toBe('2026-11-30');
  });
  it('preserves a real client, hourly rate, hours and exact deadline without accepting zero rates', () => {
    const job = parseStriive({ id: 'job-1', title: 'Product Owner', content: '<p>ZZP mogelijk. Werk met een productteam.</p>', clientName: 'Example Client', hourlyRateMax: 110, hourlyRateMin: 0, hoursPerWeekMin: 32, hoursPerWeekMax: 40, closingDateInvoice: '2026-12-10T14:00:00', referenceCode: 'ABC-1' });
    expect(job).toMatchObject({ freelance_eligible: true, employment_type: 'Freelance / ZZP', salary_period: 'hour', salary_max: 110, salary_range: 'Tot € 110/uur', freelance_details: { client_name: 'Example Client', hours_min: 32, hours_max: 40, reference: 'ABC-1', closing_at: '2026-12-10T14:00:00.000Z' } });
    expect(job?.salary_min).toBeUndefined();
    expect(parseStriive({ id: 'x', title: 'PO', permanentJob: true })).toBeNull();
  });
  it('honours structured government contract restrictions and deduplicates original Flextender URLs', () => {
    const job = parseOverheid({ tender_name: 'QA Engineer', tender_status: 'open', tender_url: 'https://www.flextender.nl/opdracht/?aanvraagnr=123&resultatenlijst=tracking', contract_type: 'detachering', tender_description_html: '<p>Werk in een team met freelancers.</p>', tender_buying_organization: 'Gemeente Amsterdam', location: { city: 'Amsterdam' }, tender_maximum_tariff: 100 });
    expect(job).toMatchObject({ freelance_eligible: false, job_url: 'https://www.flextender.nl/opdracht?aanvraagnr=123', location: 'Amsterdam', salary_max: 100 });
    expect(parseOverheid({ tender_status: 'closed', tender_name: 'PO', tender_url: 'https://example.nl/job' })).toBeNull();
    expect(parseOverheid({ tender_name: 'Product Owner', tender_status: 'open', tender_url: 'https://example.nl/job', contract_type: 'temporary' })?.freelance_eligible).toBe(true);
    expect(freelanceEligibility('Temporary Product Owner contract')).toBeNull();
  });
  it('parses public Flextender detail fields without treating the site-wide page publication date as the job date', () => {
    const html = `<div class="css-jobtitle">Product Owner</div><div class="css-customer">Gemeente Amsterdam</div>
      <div class="css-summaryrow"><div class="css-caption">Start</div><div class="css-value">1 december 2026</div></div>
      <div class="css-summaryrow"><div class="css-caption">Uren per week</div><div class="css-value">32 - 36 uur</div></div>
      <div class="css-summaryrow"><div class="css-caption">Einde inschrijfdatum</div><div class="css-value">20 november 2026 <a>agenda</a></div></div>
      <div class="flx-job-mce-container">ZZP mogelijk. ${'Werk zelfstandig aan een productroadmap met stakeholders. '.repeat(8)} Maximaal uurtarief € 120.</div>`;
    expect(parseFlextender(html, 'https://www.flextender.nl/opdracht?aanvraagnr=123&resultatenlijst=session')).toMatchObject({ job_url: 'https://www.flextender.nl/opdracht?aanvraagnr=123', freelance_eligible: true, closing_date: '2026-11-20', salary_max: 120, freelance_details: { client_name: 'Gemeente Amsterdam', start_date: '2026-12-01', hours_min: 32, hours_max: 36 } });
    expect(parseFlextender(html, 'https://www.flextender.nl/opdracht?aanvraagnr=123')?.posted_date).toBeUndefined();
  });
  it('fails a repeated pagination page rather than closing unseen jobs or calling an LLM', async () => {
    const ctx = { robotsAllowed: async () => true, fetchText: async () => ({ status: 200, text: JSON.stringify({ total: 50, data: [{ id: 'x', title: 'Product Owner', content: 'ZZP mogelijk' }] }) }), log: () => {}, llm: { json: () => { throw new Error('LLM must not be called'); } } } as unknown as Ctx;
    await expect(striiveSource.fetchJobs({} as CompanyRow, ctx)).rejects.toThrow('pagination repeated');
    expect(ctx.liveUrlsComplete).not.toBe(true);
  });
  it('refreshes an assignment when only its published hourly rate changes', () => {
    const job = { job_title: 'Product Owner', freelance_details: { source_name: 'Striive' }, salary_max: 100 };
    expect(contentHash(job)).not.toBe(contentHash({ ...job, salary_max: 110 }));
  });
});
