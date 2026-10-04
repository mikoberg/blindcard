import { describe, expect, it } from "vitest";
import { compareByRating, sortFights } from "@/lib/card/sort";
import { makeFight } from "./helpers";

describe("sortFights", () => {
  const fights = [makeFight(3, 4), makeFight(1, 3), makeFight(2, null), makeFight(4, 5)];

  it("sorts by card position by default", () => {
    expect(sortFights(fights, "card").map((f) => f.cardPosition)).toEqual([1, 2, 3, 4]);
  });

  it("sorts by stars descending with unrated fights last", () => {
    expect(sortFights(fights, "rating").map((f) => f.cardPosition)).toEqual([4, 3, 1, 2]);
  });

  it("breaks star ties by percentile, then by card position", () => {
    const tied = [
      makeFight(5, 4.5, { percentile: 90 }),
      makeFight(2, 4.5, { percentile: 95 }),
      makeFight(3, 4.5, { percentile: 90 }),
    ];
    expect(sortFights(tied, "rating").map((f) => f.cardPosition)).toEqual([2, 3, 5]);
  });

  it("does not mutate its input", () => {
    const input = [makeFight(2, 3), makeFight(1, 5)];
    const snapshot = input.map((f) => f.id);
    sortFights(input, "rating");
    sortFights(input, "card");
    expect(input.map((f) => f.id)).toEqual(snapshot);
  });

  it("orders unrated fights among themselves by card position", () => {
    const list = [makeFight(4, null), makeFight(2, null)];
    expect(sortFights(list, "rating").map((f) => f.cardPosition)).toEqual([2, 4]);
    expect(compareByRating(list[0]!, list[1]!)).toBeGreaterThan(0);
  });
});
