import { describe, expect, it } from "vitest";
import { matchupFontSize, surname } from "@/lib/overview/matchup";

describe("surname", () => {
  it.each([
    ["Arman Tsarukyan", "Tsarukyan"],
    ["Raul Rosas Jr.", "Rosas"],
    ["Mike De La Torre", "De La Torre"],
    ["Tiago dos Santos e Silva", "Silva"],
    ["Charles do Bronx Oliveira", "Oliveira"],
    ["Rongzhu", "Rongzhu"],
    ["  Joel   Alvarez ", "Alvarez"],
    ["Chris Van Damme", "Van Damme"],
    ["Jr.", ""],
    ["", ""],
  ])("%s -> %s", (name, expected) => {
    expect(surname(name)).toBe(expected);
  });
});

describe("matchupFontSize", () => {
  it("is as large as allowed for short names and smaller for long ones", () => {
    expect(matchupFontSize(["Rosas", "Pena"], 14.5)).toBe(14.5);
    const long = matchupFontSize(["Nurmagomedov", "Tsarukyan"], 20);
    expect(long).toBeLessThan(20);
    expect(long).toBeGreaterThan(5);
    expect(matchupFontSize(["Rongzhu-Wangchuk Doyle"], 14.5)).toBeLessThan(14.5);
  });

  it("fits the longest of the names", () => {
    const size = matchupFontSize(["Rosas", "Nurmagomedov"], 40);
    expect(size * 0.47 * "Nurmagomedov".length).toBeLessThanOrEqual(84.1);
  });

  it("never returns nonsense for an empty list or empty names", () => {
    expect(matchupFontSize([], 10)).toBeGreaterThan(0);
    expect(matchupFontSize([""], 10)).toBe(10);
  });
});
