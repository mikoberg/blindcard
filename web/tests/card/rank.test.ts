import { describe, expect, it } from "vitest";
import { rankSpoken, rankText, toRank, toRanks } from "@/lib/card/rank";

describe("toRank", () => {
  it("accepts the champion and places 1 to 15, also as a numeric string", () => {
    expect(toRank(0)).toBe(0);
    expect(toRank(15)).toBe(15);
    expect(toRank("7")).toBe(7);
  });

  it("treats anything else as unknown, never a guess", () => {
    for (const value of [null, undefined, -1, 16, 2.5, "x", {}, NaN]) expect(toRank(value)).toBeNull();
  });
});

describe("toRanks", () => {
  it("reads both sides and is null when neither is ranked or the shape is wrong", () => {
    expect(toRanks({ a: 1, b: 9 })).toEqual({ a: 1, b: 9 });
    expect(toRanks({ b: 4 })).toEqual({ a: null, b: 4 });
    expect(toRanks({})).toBeNull();
    expect(toRanks(null)).toBeNull();
    expect(toRanks("1")).toBeNull();
  });
});

describe("rank text", () => {
  it("shows C and #n, and says them in words", () => {
    expect(rankText(0)).toBe("C");
    expect(rankText(4)).toBe("#4");
    expect(rankSpoken(0, "now")).toBe("Champion");
    expect(rankSpoken(4, "now")).toBe("Ranked number 4 in the division");
  });
});
