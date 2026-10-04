import { describe, expect, it } from "vitest";
import { eventLabel, labelFontSize, matchupFontSize, posterNames, surname } from "@/lib/overview/matchup";

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


describe("posterNames", () => {
  it("uses the family names the event's own name prints, even for names written family name first", () => {
    expect(posterNames("UFC 332: Silva vs. Wang", "Natalia Silva", "Wang Cong")).toEqual(["Silva", "Wang"]);
    expect(posterNames("UFC Fight Night: Song vs. Yan", "Song Yadong", "Yan Xiaonan")).toEqual(["Song", "Yan"]);
  });

  it("strips suffixes and rematch numbers from the event name", () => {
    expect(posterNames("UFC Fight Night: Rosas Jr. vs. Barcelos", "Raoni Barcelos", "Raul Rosas Jr.")).toEqual([
      "Rosas",
      "Barcelos",
    ]);
    expect(posterNames("UFC 331: Van vs. Pantoja 2", "Alexandre Pantoja", "Joshua Van")).toEqual(["Van", "Pantoja"]);
  });

  it("ignores accents when matching", () => {
    expect(posterNames("UFC 300: Błachowicz vs. Rakić", "Jan Blachowicz", "Aleksandar Rakic")).toEqual([
      "Błachowicz",
      "Rakić",
    ]);
  });

  it("falls back to the fighters' names when the event name is about someone else", () => {
    expect(posterNames("UFC 300: Alpha vs. Beta", "Raoni Barcelos", "Raul Rosas Jr.")).toEqual(["Barcelos", "Rosas"]);
    expect(posterNames("UFC 300: Alpha vs. Barcelos", "Raoni Barcelos", "Raul Rosas Jr.")).toEqual(["Barcelos", "Rosas"]);
  });

  it("falls back when the event name has no matchup in it", () => {
    expect(posterNames("UFC 301", "Raoni Barcelos", "Raul Rosas Jr.")).toEqual(["Barcelos", "Rosas"]);
    expect(posterNames("The Ultimate Fighter Finale", "Ann One", "Bea Two")).toEqual(["One", "Two"]);
  });
});


describe("eventLabel", () => {
  it.each([
    ["UFC 332: Silva vs. Wang", "UFC 332"],
    ["UFC Fight Night: Rosas Jr. vs. Barcelos", "UFC Fight Night"],
    ["The Ultimate Fighter: A Champion Will Be Crowned Finale", "The Ultimate Fighter"],
    ["UFC 301", "UFC 301"],
    ["  UFC 5  : X vs. Y ", "UFC 5"],
  ])("%s -> %s", (name, label) => {
    expect(eventLabel(name)).toBe(label);
  });
});

describe("labelFontSize", () => {
  it("stays at the maximum for short labels and shrinks for long ones", () => {
    expect(labelFontSize("UFC 332", 6)).toBe(6);
    expect(labelFontSize("The Ultimate Fighter Latin America", 6)).toBeLessThan(6);
    expect(labelFontSize("", 6)).toBe(6);
  });
});
