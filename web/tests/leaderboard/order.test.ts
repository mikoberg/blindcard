import { describe, expect, it } from "vitest";
import { BOARD_ORDERS, orderById, orderEntries } from "@/lib/leaderboard/order";
import type { LeaderboardEntry } from "@/lib/leaderboard/types";

const entry = (
  id: string,
  average: number,
  fights: number,
  awards: { fotn: number; potn: number } | null,
): LeaderboardEntry => ({
  rank: 0,
  id,
  slug: id,
  name: `Fighter ${id}`,
  country: null,
  fights,
  average,
  lastFight: "2026-01-01",
  awards,
});

// as the page hands them over: by average rating
const BOARD = [
  entry("a", 4.5, 10, { fotn: 2, potn: 1 }),
  entry("b", 4.2, 12, { fotn: 1, potn: 6 }),
  entry("c", 4.0, 9, null),
  entry("d", 3.8, 20, { fotn: 4, potn: 6 }),
];
const ids = (entries: readonly LeaderboardEntry[]) => entries.map((e) => e.id);

describe("orderEntries", () => {
  it("keeps the rating order and numbers it from 1", () => {
    const out = orderEntries(BOARD, "rating");
    expect(ids(out)).toEqual(["a", "b", "c", "d"]);
    expect(out.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
  });

  it("orders by Performance of the Night bonuses, ties to the better average, no award last", () => {
    expect(ids(orderEntries(BOARD, "potn"))).toEqual(["b", "d", "a", "c"]); // b and d tie on 6: b has the better average
    expect(orderEntries(BOARD, "potn").map((e) => e.rank)).toEqual([1, 2, 3, 4]);
  });

  it("orders by Fight of the Night, by all bonuses, and by rated fights", () => {
    expect(ids(orderEntries(BOARD, "fotn"))).toEqual(["d", "a", "b", "c"]);
    expect(ids(orderEntries(BOARD, "awards"))).toEqual(["d", "b", "a", "c"]); // 10, 7, 3, none
    expect(ids(orderEntries(BOARD, "fights"))).toEqual(["d", "b", "a", "c"]);
  });

  it("never changes its input", () => {
    const before = ids(BOARD);
    orderEntries(BOARD, "potn");
    expect(ids(BOARD)).toEqual(before);
  });

  it("knows its orders and falls back to the rating for an unknown one", () => {
    expect(BOARD_ORDERS.map((o) => o.id)).toEqual(["rating", "potn", "fotn", "awards", "fights"]);
    expect(orderById("nope").id).toBe("rating");
  });
});
