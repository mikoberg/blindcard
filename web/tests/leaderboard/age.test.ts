import { describe, expect, it } from "vitest";
import { ageOn, toBirthDate } from "@/lib/leaderboard/rank";

describe("ageOn", () => {
  it("counts whole years, and a birthday that has not come yet this year does not count", () => {
    expect(ageOn("1995-08-06", "2026-10-06")).toBe(31);
    expect(ageOn("1995-08-06", "2026-08-06")).toBe(31); // on the birthday itself
    expect(ageOn("1995-08-06", "2026-08-05")).toBe(30);
    expect(ageOn("1995-12-31", "2026-01-01")).toBe(30);
  });

  it("gives nothing for a bad date or an impossible age", () => {
    expect(ageOn("soon", "2026-10-06")).toBeNull();
    expect(ageOn("1995-08-06", "later")).toBeNull();
    expect(ageOn("2030-01-01", "2026-10-06")).toBeNull();
    expect(ageOn("1900-01-01", "2026-10-06")).toBeNull();
  });
});

describe("toBirthDate", () => {
  it("accepts an ISO date in a plausible range and rejects the rest", () => {
    expect(toBirthDate("1995-08-06")).toBe("1995-08-06");
    for (const bad of [null, undefined, 1995, "1995", "1995-13-40", "1890-01-01", "2020-01-01"]) {
      expect(toBirthDate(bad)).toBeNull();
    }
  });
});
