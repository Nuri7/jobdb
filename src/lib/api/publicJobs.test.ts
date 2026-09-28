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
    const params = jobFiltersToParams({ remote: true, hasSalary: true, easyApply: true, postedWithin: 7 });
    expect(Object.fromEntries(params)).toMatchObject({
      remote: "true",
      has_salary: "true",
      easy_apply: "true",
      posted_within: "7",
    });
  });
});
