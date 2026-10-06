import { describe, expect, it } from "vitest";
import { MIN_FIGHTS, buildProfile, rankFighters } from "@/lib/leaderboard/rank";
import type { FighterFightRow, FighterRatingRow } from "@/lib/leaderboard/types";

const row = (id: string, fights: number, avg: number | string, name = id): FighterRatingRow => ({
  id,
  name,
  country: null,
  rated_fights: fights,
  avg_stars: avg,
  slug: id,
});

describe("rankFighters", () => {
  it("leaves out fighters with fewer than the minimum number of rated fights", () => {
    const ranked = rankFighters([row("one", 1, 5), row("few", MIN_FIGHTS - 1, 5), row("ok", MIN_FIGHTS, 3)]);
    expect(ranked.map((e) => e.id)).toEqual(["ok"]);
  });

  it("ranks by the plain average, best first, and shows exactly that average", () => {
    const ranked = rankFighters([row("a", 10, 3.2), row("b", 30, 4.4), row("c", 12, 4.1)]);
    expect(ranked.map((e) => [e.rank, e.id, e.average])).toEqual([
      [1, "b", 4.4],
      [2, "c", 4.1],
      [3, "a", 3.2],
    ]);
  });

  it("gives ties to the fighter with more fights, then by name", () => {
    const ranked = rankFighters([
      row("a", MIN_FIGHTS, 4, "Ann"),
      row("b", MIN_FIGHTS + 5, 4, "Bea"),
      row("c", MIN_FIGHTS, 4, "Cid"),
    ]);
    expect(ranked.map((e) => e.id)).toEqual(["b", "a", "c"]);
  });

  it("reads the average when the database sends it as text, and ignores unusable rows", () => {
    const ranked = rankFighters([row("a", MIN_FIGHTS, "4.25"), row("bad", MIN_FIGHTS, "nope")]);
    expect(ranked.map((e) => [e.id, e.average])).toEqual([["a", 4.25]]);
  });

  it("returns nothing for no rows", () => {
    expect(rankFighters([])).toEqual([]);
  });
});

describe("buildProfile", () => {
  const fighter = { name: "Ann One", country: "nl", slug: "ann-one" };
  const fight = (event: string, date: string, stars: number | string, opponent = "Bea"): FighterFightRow => ({
    event_slug: event,
    event_name: `Event ${event}`,
    event_date: date,
    opponent_name: opponent,
    stars,
  });

  it("lists the rated fights newest first and averages exactly those", () => {
    const profile = buildProfile(fighter, [
      fight("a", "2024-01-01", 4),
      fight("c", "2026-03-01", "3.5"),
      fight("b", "2025-02-01", 5),
    ]);
    expect(profile?.fights.map((f) => f.eventSlug)).toEqual(["c", "b", "a"]);
    expect(profile?.average).toBe(4.17);
    expect(profile!.fights.reduce((sum, f) => sum + f.stars, 0) / 3).toBeCloseTo(profile!.average, 2);
  });

  it("leaves out unusable ratings and returns null when nothing is left", () => {
    expect(buildProfile(fighter, [fight("a", "2024-01-01", "nope"), fight("b", "2024-02-01", 7)])).toBeNull();
    expect(buildProfile(fighter, [])).toBeNull();
  });

  it("carries only what the page shows", () => {
    const profile = buildProfile(fighter, [fight("a", "2024-01-01", 4)])!;
    expect(Object.keys(profile).sort()).toEqual([
      "average",
      "awards",
      "country",
      "elo",
      "fights",
      "name",
      "record",
      "slug",
      "stats",
      "styles",
    ]);
    expect(Object.keys(profile.fights[0]!).sort()).toEqual([
      "eventDate",
      "eventName",
      "eventSlug",
      "fightId",
      "isTitleFight",
      "opponent",
      "opponentSlug",
      "stars",
      "weightClass",
    ]);
  });

  it("adds the standing as of today when it is reliable, and nothing otherwise", () => {
    const withNow = buildProfile(fighter, [fight("a", "2024-01-01", 4)], {
      style: ["Judo"],
      record: { w: 10, l: 2, d: 0, nc: 0 },
      elo: { r: 1650.5, n: 9 },
    })!;
    expect(withNow.styles).toEqual(["Judo"]);
    expect(withNow.record).toEqual({ w: 10, l: 2, d: 0, nc: 0 });
    expect(withNow.elo).toEqual({ rating: 1650.5, fights: 9 });
    const without = buildProfile(fighter, [fight("a", "2024-01-01", 4)], { record: { w: "x" }, elo: { r: 5 } })!;
    expect(without.record).toBeNull();
    expect(without.elo).toBeNull();
  });
});
