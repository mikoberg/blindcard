import { describe, expect, it } from "vitest";
import { isHiddenGem } from "@/lib/card/hiddenGem";
import { makeFight } from "./helpers";

describe("isHiddenGem", () => {
  it("needs both a high rating and an early-card position (6 or later)", () => {
    expect(isHiddenGem(makeFight(6, 4))).toBe(true);
    expect(isHiddenGem(makeFight(11, 5))).toBe(true);
    expect(isHiddenGem(makeFight(5, 5))).toBe(false);
    expect(isHiddenGem(makeFight(6, 3.5))).toBe(false);
  });

  it("is never true for an unrated fight", () => {
    expect(isHiddenGem(makeFight(9, null))).toBe(false);
  });

  it("honours custom options", () => {
    expect(isHiddenGem(makeFight(3, 3), { minStars: 3, minCardPosition: 3 })).toBe(true);
  });
});
