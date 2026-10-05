import { describe, expect, it } from "vitest";
import { eventStats, rankByCardRating, stripLabel, summariesByYear } from "@/lib/overview/summary";
import type { EventSummary } from "@/lib/overview/types";

const event = (patch: Partial<EventSummary> = {}): EventSummary => ({
  id: "e1",
  slug: "e1",
  name: "Event",
  eventDate: "2026-09-12",
  location: null,
  mainEvent: null,
  ratings: [
    { position: 1, stars: 4 },
    { position: 3, stars: 2.5 },
    { position: 6, stars: 4.5 },
  ],
  ...patch,
});

describe("eventStats", () => {
  it("counts rated fights, averages the ratings and finds the hidden gems (early card, 4+ stars)", () => {
    expect(eventStats(event())).toEqual({ ratedCount: 3, cardRating: 3.7, classics: 0, hiddenGems: 1 });
  });

  it("has no card rating and no gems when nothing is rated", () => {
    expect(eventStats(event({ ratings: [] }))).toEqual({ ratedCount: 0, cardRating: null, classics: 0, hiddenGems: 0 });
  });
});

describe("classics", () => {
  it("counts the five-star fights of an event", () => {
    const ratings = [{ position: 1, stars: 5 }, { position: 3, stars: 4.5 }, { position: 8, stars: 5 }];
    expect(eventStats(event({ ratings })).classics).toBe(2);
  });
});

describe("stripLabel", () => {
  it("says how many fights are rated and the card rating, nothing about results", () => {
    expect(stripLabel(event())).toBe("3 fights rated, card rating 3.7 out of 5");
    expect(stripLabel(event({ ratings: [{ position: 1, stars: 3 }] }))).toBe("1 fight rated, card rating 3.0 out of 5");
  });

  it("says ratings are on their way when there are none", () => {
    expect(stripLabel(event({ ratings: [] }))).toBe("Ratings are on their way");
  });
});

describe("summariesByYear", () => {
  it("groups newest-first events by year, keeping order", () => {
    const groups = summariesByYear([
      event({ id: "a", eventDate: "2026-09-12" }),
      event({ id: "b", eventDate: "2026-03-01" }),
      event({ id: "c", eventDate: "2025-12-31" }),
    ]);
    expect(groups.map((g) => [g.year, g.events.map((e) => e.id)])).toEqual([
      ["2026", ["a", "b"]],
      ["2025", ["c"]],
    ]);
  });
});

describe("rankByCardRating", () => {
  const rated = (id: string, eventDate: string, stars: number[]) =>
    event({ id, eventDate, ratings: stars.map((s, i) => ({ position: i + 1, stars: s })) });

  it("puts the best average first, then more rated fights, then the newer event", () => {
    const ids = rankByCardRating([
      rated("low", "2026-01-01", [2, 3]),
      rated("few", "2026-02-01", [4]),
      rated("many", "2025-01-01", [4, 4, 4]),
      rated("newer", "2026-03-01", [4, 4, 4]),
    ]).map((e) => e.id);
    expect(ids).toEqual(["newer", "many", "few", "low"]);
  });

  it("puts events without ratings last and does not change the input", () => {
    const input = [rated("none", "2026-05-01", []), rated("one", "2020-01-01", [1])];
    expect(rankByCardRating(input).map((e) => e.id)).toEqual(["one", "none"]);
    expect(input.map((e) => e.id)).toEqual(["none", "one"]);
  });
});
