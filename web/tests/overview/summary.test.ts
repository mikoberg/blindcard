import { describe, expect, it } from "vitest";
import { eventStats, stripLabel, summariesByYear } from "@/lib/overview/summary";
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
    expect(eventStats(event())).toEqual({ ratedCount: 3, cardRating: 3.7, hiddenGems: 1 });
  });

  it("has no card rating and no gems when nothing is rated", () => {
    expect(eventStats(event({ ratings: [] }))).toEqual({ ratedCount: 0, cardRating: null, hiddenGems: 0 });
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
