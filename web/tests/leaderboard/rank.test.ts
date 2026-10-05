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
