import { describe, expect, it } from "vitest";
import { displaySalary } from "./jobDisplay";

describe("displaySalary", () => {
  it("keeps complete salary ranges", () => {
    expect(displaySalary("EUR 2.762–4.729/month")).toBe("EUR 2.762–4.729/month");
  });

  it("labels a range with only an upper bound", () => {
    expect(displaySalary("EUR –2850/month")).toBe("Tot EUR 2850/month");
    expect(displaySalary("EUR 0–2850/month")).toBe("Tot EUR 2850/month");
  });

  it("hides empty and zero-only salaries", () => {
    expect(displaySalary("EUR 0/hour")).toBeNull();
    expect(displaySalary(null)).toBeNull();
  });
});
