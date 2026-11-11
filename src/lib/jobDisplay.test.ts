import { describe, expect, it } from "vitest";
import { displaySalary } from "./jobDisplay";

describe("displaySalary", () => {
  it("keeps complete salary ranges", () => {
    expect(displaySalary("EUR 2.762–4.729/month")).toBe("€ 2.762–4.729/maand");
  });

  it("labels a range with only an upper bound", () => {
    expect(displaySalary("EUR –2850/month")).toBe("Tot € 2.850/maand");
    expect(displaySalary("EUR 0–2850/month")).toBe("Tot € 2.850/maand");
  });

  it("hides empty and zero-only salaries", () => {
    expect(displaySalary("EUR 0/hour")).toBeNull();
    expect(displaySalary(null)).toBeNull();
  });
});

import { decodeText, discoveryDate, jobLocation } from './jobDisplay';
import type { PublicJob } from './api/publicJobs';
describe('honest vacancy display', () => {
  it('does not invent a country or publication date', () => {
    const job = { location: null, city: null, posted_date: null, first_seen_at: '2026-11-11T00:00:00Z' } as PublicJob;
    expect(jobLocation(job)).toBe('Locatie niet vermeld');
    expect(discoveryDate(job)).toContain('Gevonden');
  });
  it('decodes source titles and preserves decimal hourly caps', () => {
    expect(decodeText('Receptie &#8211; Nootdorp &amp; Delft')).toBe('Receptie – Nootdorp & Delft');
    expect(displaySalary('EUR 0–82.5/hour')).toBe('Tot € 82,5/uur');
  });
});
