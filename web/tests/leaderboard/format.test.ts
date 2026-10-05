import { describe, expect, it } from "vitest";
import { formatRating, isHighRating, roundRating } from "@/lib/leaderboard/format";

describe("rating display", () => {
  it("colours exactly what it shows: an average that shows as 4.0 is highlighted", () => {
    expect(formatRating(3.96)).toBe("4.0");
    expect(isHighRating(3.96)).toBe(true);
    expect(formatRating(3.94)).toBe("3.9");
    expect(isHighRating(3.94)).toBe(false);
    expect(isHighRating(4)).toBe(true);
  });

  it("rounds to one decimal", () => {
    expect(roundRating(4.249)).toBe(4.2);
    expect(roundRating(4.25)).toBe(4.3);
  });
});
