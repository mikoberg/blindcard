import { describe, expect, it } from "vitest";
import { toAwards } from "@/lib/leaderboard/rank";

describe("toAwards", () => {
  it("reads both totals", () => {
    expect(toAwards({ fotn: 10, potn: 5 })).toEqual({ fotn: 10, potn: 5 });
    expect(toAwards({ fotn: 0, potn: 0 })).toEqual({ fotn: 0, potn: 0 });
  });

  it("treats anything else as unknown, never a guess", () => {
    for (const bad of [null, undefined, "x", {}, { fotn: 1 }, { fotn: -1, potn: 0 }, { fotn: 1.5, potn: 0 }, { fotn: "2", potn: 1 }]) {
      expect(toAwards(bad)).toBeNull();
    }
  });
});
