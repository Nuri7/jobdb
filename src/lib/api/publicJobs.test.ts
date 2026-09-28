import { describe, expect, it } from "vitest";
import { jobFiltersToParams } from "./publicJobs";

describe("jobFiltersToParams", () => {
  it("uses a real offset so pages do not repeat", () => {
    const params = jobFiltersToParams({ search: "software engineer", page: 3, limit: 24 });
    expect(params.get("search")).toBe("software engineer");
    expect(params.get("limit")).toBe("24");
    expect(params.get("offset")).toBe("48");
    expect(params.has("page")).toBe(false);
  });

  it("serializes candidate filters with API names", () => {
    const params = jobFiltersToParams({ remote: true, workplaceType: "hybrid", hasSalary: true, easyApply: true, postedWithin: 7 });
    expect(Object.fromEntries(params)).toMatchObject({
      remote: "true",
      workplace_type: "hybrid",
      has_salary: "true",
      easy_apply: "true",
      posted_within: "7",
    });
  });

  it("uses radius search when a distance is selected", () => {
    const params = jobFiltersToParams({ location: "Utrecht", radiusKm: 25, includeFacets: true });
    expect(params.get("near")).toBe("Utrecht");
    expect(params.get("radius_km")).toBe("25");
    expect(params.get("location")).toBeNull();
    expect(params.get("include_facets")).toBe("true");
  });
});
