import { describe, expect, it } from "vitest";
import { isClassic } from "@/lib/card/classic";

describe("isClassic", () => {
  it("is for five stars only", () => {
    expect(isClassic(5)).toBe(true);
    expect(isClassic(4.5)).toBe(false);
    expect(isClassic(null)).toBe(false);
    expect(isClassic(undefined)).toBe(false);
  });
});
