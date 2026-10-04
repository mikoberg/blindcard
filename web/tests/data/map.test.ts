import { describe, expect, it, vi } from "vitest";
import { DataError } from "@/lib/data/ensure";
import { buildCard, mapEvent, mapOverview, type FightRow, type FighterRow, type ScoreRow } from "@/lib/data/map";

const fights: FightRow[] = [
  { id: "f2", event_id: "e1", card_position: 2, card_segment: "prelim", weight_class: "Welterweight", is_title_fight: false, scheduled_rounds: 3, fighter_a_id: "p3", fighter_b_id: "p4" },
  { id: "f1", event_id: "e1", card_position: 1, card_segment: "main", weight_class: "Lightweight", is_title_fight: true, scheduled_rounds: 5, fighter_a_id: "p1", fighter_b_id: "p2" },
];
const fighters: FighterRow[] = [
  { id: "p1", name: "One" },
  { id: "p2", name: "Two" },
  { id: "p3", name: "Three" },
  { id: "p4", name: "Four" },
];

describe("mapEvent", () => {
  it("maps columns to the view type", () => {
    expect(mapEvent({ id: "e1", name: "N", slug: "n", event_date: "2026-09-26", location: null })).toEqual({
      id: "e1", name: "N", slug: "n", eventDate: "2026-09-26", location: null,
    });
  });
});

describe("buildCard", () => {
  it("sorts by card position and attaches ratings by fight id", () => {
    const scores: ScoreRow[] = [{ fight_id: "f1", stars: 4.5, percentile: 93.25 }];
    const card = buildCard(fights, fighters, scores);
    expect(card.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(card[0]?.fighterA).toEqual({ id: "p1", name: "One" });
    expect(card[0]?.isTitleFight).toBe(true);
    expect(card[0]?.rating).toEqual({ stars: 4.5, percentile: 93.25 });
    expect(card[1]?.rating).toBeNull();
  });

  it("accepts numeric strings from the API", () => {
    const card = buildCard(fights, fighters, [{ fight_id: "f1", stars: "4.5", percentile: "93.25" }]);
    expect(card[0]?.rating).toEqual({ stars: 4.5, percentile: 93.25 });
  });

  it.each([
    ["off-vocabulary stars", { stars: 4.3, percentile: 80 }],
    ["text stars", { stars: "abc", percentile: 80 }],
    ["null stars", { stars: null, percentile: 80 }],
    ["stars below range", { stars: 0.5, percentile: 80 }],
    ["percentile above 100", { stars: 4, percentile: 120 }],
    ["negative percentile", { stars: 4, percentile: -1 }],
    ["non-numeric percentile", { stars: 4, percentile: "high" }],
    ["null percentile", { stars: 4, percentile: null }],
  ])("treats %s as not rated instead of guessing", (_label, score) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const card = buildCard(fights, fighters, [{ fight_id: "f1", ...score } as ScoreRow]);
    expect(card[0]?.rating).toBeNull();
    // Only the fight id is logged, never a score or any result.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("f1");
    warn.mockRestore();
  });

  it("uses the first score when a fight has several rows for the version", () => {
    const card = buildCard(fights, fighters, [
      { fight_id: "f1", stars: 3, percentile: 50 },
      { fight_id: "f1", stars: 5, percentile: 99 },
    ]);
    expect(card[0]?.rating).toEqual({ stars: 3, percentile: 50 });
  });

  it("returns an empty card for no fights", () => {
    expect(buildCard([], [], [])).toEqual([]);
  });

  it("throws when a fighter row is missing (data integrity)", () => {
    expect(() => buildCard(fights, fighters.slice(1), [])).toThrow(DataError);
  });
});

describe("card segments in buildCard", () => {
  it("carries the segment of each fight and treats an unknown value as no segment", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const card = buildCard(
      [...fights, { ...fights[0]!, id: "f3", card_position: 3, card_segment: "headliner" }],
      fighters,
      [],
    );
    expect(card.map((f) => [f.id, f.cardSegment])).toEqual([
      ["f1", "main"],
      ["f2", "prelim"],
      ["f3", null],
    ]);
  });
});

describe("mapOverview", () => {
  const row = {
    id: "e1",
    slug: "e1",
    name: "Event",
    event_date: "2026-09-12",
    location: "Las Vegas",
    ratings: [
      { p: 3, s: 2.5 },
      { p: 1, s: "4.0" },
    ],
  };

  it("maps the row and sorts the rated slots by card position", () => {
    expect(mapOverview(row)).toEqual({
      id: "e1",
      slug: "e1",
      name: "Event",
      eventDate: "2026-09-12",
      location: "Las Vegas",
      ratings: [
        { position: 1, stars: 4 },
        { position: 3, stars: 2.5 },
      ],
    });
  });

  it("drops malformed slots (never guesses a rating), logs once per event, and survives a non-array", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const bad = [{ p: 1, s: 4.3 }, { p: 0, s: 3 }, { p: 2 }, null, { p: 4, s: 3 }];
    expect(mapOverview({ ...row, ratings: bad })?.ratings).toEqual([{ position: 4, stars: 3 }]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("e1");
    expect(mapOverview({ ...row, ratings: "x" })?.ratings).toEqual([]);
    warn.mockRestore();
  });

  it("skips a row without a usable date or name instead of breaking the year grouping", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(mapOverview({ ...row, event_date: "2026-9-12" })).toBeNull();
    expect(mapOverview({ ...row, event_date: "" })).toBeNull();
    expect(mapOverview({ ...row, name: "" })).toBeNull();
    warn.mockRestore();
  });
});
