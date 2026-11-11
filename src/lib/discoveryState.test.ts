import { describe, expect, it } from "vitest";
import {
  filtersFromParams,
  safeDestination,
  searchUrl,
} from "./discoveryState";
import { jobFiltersToParams } from "./api/publicJobs";
import {
  alertParams,
  discoveryOptions,
} from "../../supabase/functions/_shared/discovery";

describe("discovery and saved-search parity", () => {
  it("round-trips mode, zero radius and all freelance conditions", () => {
    const original = new URLSearchParams(
      "mode=freelance&q=data&location=Amsterdam&afstand=0&bedrag=82.5&uren_vanaf=24&uren_tot=36&start_voor=2027-01-01&sluit_binnen=7&werkplek=hybrid&dagen=0",
    );
    const filters = filtersFromParams(original);
    const roundTrip = filtersFromParams(
      new URLSearchParams(searchUrl(filters).split("?")[1]),
    );
    expect(roundTrip).toEqual(filters);
    const api = jobFiltersToParams(filters);
    expect(Object.fromEntries(api)).toMatchObject({
      location: "Amsterdam",
      mode: "freelance",
      pay_min: "82.5",
      hours_min: "24",
      hours_max: "36",
      workplace_type: "hybrid",
    });
    expect(api.has("posted_within")).toBe(false);
  });
  it("keeps alert matching identical to interactive filters", () => {
    const filters = filtersFromParams(
      new URLSearchParams(
        "mode=freelance&q=data&location=Amsterdam&afstand=50&bedrag=90&uren_vanaf=24&werkplek=hybrid&salaris=1&fairapply=1",
      ),
    );
    const alert = alertParams(
      filters as Record<string, unknown>,
      "2026-11-10T00:00:00Z",
    );
    const interactive = jobFiltersToParams(filters);
    for (const [key, value] of interactive)
      if (!["limit", "offset", "sort"].includes(key))
        expect(alert.get(key), key).toBe(value);
    expect(discoveryOptions(alert).new_since).toBe("2026-11-10T00:00:00.000Z");
    expect(alert.get("auto_expand")).toBe("false");
  });
  it("rejects invalid numeric and date inputs at the API boundary", () => {
    expect(
      discoveryOptions(
        new URLSearchParams(
          "pay_min=NaN&hours_min=-4&hours_max=200&sort=unsafe&start_before=bad",
        ),
      ),
    ).toEqual({ pay_period: "month" });
  });
  it("keeps legacy freelance links in freelance mode and rejects external redirects", () => {
    expect(filtersFromParams(new URLSearchParams("type=freelance")).mode).toBe(
      "freelance",
    );
    expect(safeDestination("//evil.example")).toBe("/bewaard");
    expect(safeDestination("/\\evil.example")).toBe("/bewaard");
    expect(safeDestination("/vacatures?q=data&afstand=25")).toBe(
      "/vacatures?q=data&afstand=25",
    );
  });
});
