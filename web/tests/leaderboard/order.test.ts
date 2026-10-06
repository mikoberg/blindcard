import { describe, expect, it } from "vitest";
import { BOARD_GROUPS, BOARD_ORDERS, MIN_WINS_FOR_RATE, orderById, orderEntries } from "@/lib/leaderboard/order";
import { toTally } from "@/lib/leaderboard/rank";
import type { LeaderboardEntry } from "@/lib/leaderboard/types";

const entry = (
  id: string,
  average: number,
  fights: number,
  awards: { fotn: number; potn: number } | null,
  tally: LeaderboardEntry["tally"] = null,
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
  tally,
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
    expect(BOARD_ORDERS.map((o) => o.id)).toHaveLength(17);
    expect(new Set(BOARD_ORDERS.map((o) => o.id)).size).toBe(BOARD_ORDERS.length);
    expect(orderById("nope").id).toBe("rating");
  });
});

const tally = (patch: Partial<NonNullable<LeaderboardEntry["tally"]>>) => ({
  fights: 10,
  victories: 8,
  ko: 3,
  sub: 2,
  dec: 3,
  r1: 1,
  title: 0,
  kd: 4,
  sig: 500,
  td: 6,
  sa: 3,
  ...patch,
});

describe("orders from the tally", () => {
  const TALLIED = [
    entry("a", 4.5, 10, null, tally({ ko: 7, sub: 0, victories: 10, r1: 2 })),
    entry("b", 4.2, 12, null, tally({ ko: 1, sub: 8, victories: 9, r1: 5 })),
    entry("c", 4.0, 9, null, tally({ ko: 3, sub: 3, victories: 4 })), // too few wins for a rate
    entry("d", 3.8, 20, null),
  ];

  it("orders by knockouts, submissions and first-round finishes; no tally goes last", () => {
    expect(ids(orderEntries(TALLIED, "ko"))).toEqual(["a", "c", "b", "d"]);
    expect(ids(orderEntries(TALLIED, "sub"))).toEqual(["b", "c", "a", "d"]);
    expect(ids(orderEntries(TALLIED, "r1"))).toEqual(["b", "a", "c", "d"]);
  });

  it("adds knockouts and submissions for the finishes", () => {
    expect(ids(orderEntries(TALLIED, "finishes"))).toEqual(["b", "a", "c", "d"]); // 9, 7, 6, none
  });

  it("gives a finish rate only from enough victories, as a percentage", () => {
    const rate = orderById("finishRate");
    expect(rate.value(TALLIED[0]!)).toBe(70); // 7 of 10
    expect(rate.value(TALLIED[1]!)).toBeCloseTo((9 / 9) * 100);
    expect(rate.value(TALLIED[2]!)).toBeNull(); // 4 victories < MIN_WINS_FOR_RATE
    expect(MIN_WINS_FOR_RATE).toBe(5);
    expect(rate.format(66.7)).toBe("67%");
    expect(ids(orderEntries(TALLIED, "finishRate"))).toEqual(["b", "a", "c", "d"]);
  });

  it("puts every order in a known group", () => {
    for (const o of BOARD_ORDERS) expect(BOARD_GROUPS).toContain(o.group);
  });
});

describe("toTally", () => {
  it("reads a full tally and rejects anything else", () => {
    const good = { fights: 5, wins: 4, ko: 1, sub: 1, dec: 2, r1: 1, title: 0, kd: 2, sig: 100, td: 3, sa: 1 };
    // the stored key is `wins`; in the page data it is `victories`
    expect(toTally(good)).toEqual({ fights: 5, victories: 4, ko: 1, sub: 1, dec: 2, r1: 1, title: 0, kd: 2, sig: 100, td: 3, sa: 1 });
    for (const bad of [null, "x", {}, { ...good, ko: -1 }, { ...good, sig: "9" }, { ...good, td: 1.5 }]) {
      expect(toTally(bad)).toBeNull();
    }
  });
});
