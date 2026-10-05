import { describe, expect, it } from "vitest";
import { MIN_FIGHTS, rankFighters } from "@/lib/leaderboard/rank";
import type { FighterRatingRow } from "@/lib/leaderboard/types";

const row = (id: string, fights: number, avg: number | string, name = id): FighterRatingRow => ({
  id,
  name,
  country: null,
  rated_fights: fights,
  avg_stars: avg,
});

describe("rankFighters", () => {
  it("leaves out fighters with fewer than the minimum number of rated fights", () => {
    const ranked = rankFighters([row("one", 1, 5), row("few", MIN_FIGHTS - 1, 5), row("ok", MIN_FIGHTS, 3)]);
    expect(ranked.map((e) => e.id)).toEqual(["ok"]);
  });

  it("does not put a fighter with one great fight on top", () => {
    const ranked = rankFighters([row("lucky", 1, 5), row("steady", 20, 4.2), row("middling", 12, 3)]);
    expect(ranked.map((e) => e.id)).toEqual(["steady", "middling"]);
  });

  it("lets more fights win at the same average, and shows the plain average", () => {
    const ranked = rankFighters([row("a", 6, 4.5), row("b", 20, 4.5), row("c", 10, 3)]);
    expect(ranked.map((e) => e.id)).toEqual(["b", "a", "c"]);
    expect(ranked[0]).toMatchObject({ rank: 1, fights: 20, average: 4.5 });
  });

  it("sorts by the shown score, which never rises above the plain average of a fighter above the mean", () => {
    const ranked = rankFighters([row("a", 6, 4.8), row("b", 30, 4.3), row("c", 10, 3)]);
    const scores = ranked.map((e) => e.score);
    expect(scores).toEqual([...scores].sort((x, y) => y - x));
    expect(ranked[0]!.score).toBeLessThan(ranked[0]!.average);
  });

  it("reads the average when the database sends it as text", () => {
    expect(rankFighters([row("a", 8, "4.25")])[0]?.average).toBe(4.25);
  });

  it("breaks ties by fights, then name, and ignores unusable rows", () => {
    const ranked = rankFighters([
      row("b", 8, 3.5, "Bea"),
      row("a", 8, 3.5, "Ann"),
      row("bad", 8, "nope"),
      row("zero", 0, 3),
    ]);
    expect(ranked.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("returns nothing for no rows", () => {
    expect(rankFighters([])).toEqual([]);
  });
});
