import { describe, expect, it } from "vitest";
import { jobIdFromSlug, jobPath, slugifyJobTitle } from "./jobSlug";

describe("vacancy slugs", () => {
  it("creates readable stable paths", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    expect(slugifyJobTitle("Senior Développeur / React")).toBe("senior-developpeur-react");
    expect(jobPath({ id, title: "Data Engineer" })).toBe(`/vacatures/data-engineer--${id}`);
    expect(jobIdFromSlug(`data-engineer--${id}`)).toBe(id);
  });

  it("rejects a route without a UUID suffix", () => {
    expect(jobIdFromSlug("data-engineer")).toBeNull();
  });
});
