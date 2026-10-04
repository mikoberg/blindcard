import { describe, expect, it } from "vitest";
import { formatStars, isValidStars, starFills, starsLabel } from "@/lib/card/stars";

describe("isValidStars", () => {
  it.each([1, 1.5, 2, 3.5, 4.5, 5])("accepts %s", (value) => {
    expect(isValidStars(value)).toBe(true);
  });
  it.each([0, 0.5, 4.3, 5.5, 6, -1, Number.NaN, Number.POSITIVE_INFINITY, "4.5", null, undefined])(
    "rejects %s",
    (value) => {
      expect(isValidStars(value)).toBe(false);
    },
  );
});

describe("starFills", () => {
  it("fills whole and half stars out of five", () => {
    expect(starFills(4.5)).toEqual(["full", "full", "full", "full", "half"]);
    expect(starFills(1)).toEqual(["full", "empty", "empty", "empty", "empty"]);
    expect(starFills(1.5)).toEqual(["full", "half", "empty", "empty", "empty"]);
    expect(starFills(3.5)).toEqual(["full", "full", "full", "half", "empty"]);
    expect(starFills(5)).toEqual(["full", "full", "full", "full", "full"]);
  });

  it("throws on a value that is not a half-star step in 1..5", () => {
    expect(() => starFills(4.3)).toThrow(RangeError);
    expect(() => starFills(Number.NaN)).toThrow(RangeError);
  });
});

describe("labels", () => {
  it("formats with one decimal", () => {
    expect(formatStars(4)).toBe("4.0");
    expect(formatStars(4.5)).toBe("4.5");
  });

  it("describes rated and unrated fights", () => {
    expect(starsLabel(4.5)).toBe("Rated 4.5 out of 5");
    expect(starsLabel(null)).toBe("Not rated yet");
  });
});
