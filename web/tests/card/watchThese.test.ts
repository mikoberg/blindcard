import { describe, expect, it } from "vitest";
import { watchThese } from "@/lib/card/watchThese";
import { makeFight } from "./helpers";

describe("watchThese", () => {
  it("returns at most three fights with 4.0 stars or more, best first", () => {
    const card = [
      makeFight(1, 3.5),
      makeFight(2, 4),
      makeFight(3, 4.5),
      makeFight(4, 5),
      makeFight(5, 4),
      makeFight(6, 4.5),
      makeFight(7, null),
    ];
    expect(watchThese(card).map((f) => f.cardPosition)).toEqual([4, 3, 6]);
  });

  it("uses percentile, then card position, to break ties", () => {
    const card = [
      makeFight(2, 4.5, { percentile: 91 }),
      makeFight(5, 4.5, { percentile: 97 }),
      makeFight(3, 4.5, { percentile: 91 }),
    ];
    expect(watchThese(card).map((f) => f.cardPosition)).toEqual([5, 2, 3]);
  });

  it("returns an empty list when nothing reaches the threshold", () => {
    expect(watchThese([makeFight(1, 3.5), makeFight(2, null)])).toEqual([]);
    expect(watchThese([])).toEqual([]);
  });

  it("honours custom options", () => {
    const card = [makeFight(1, 3), makeFight(2, 3.5), makeFight(3, 2)];
    expect(watchThese(card, { minStars: 3, maxItems: 1 }).map((f) => f.cardPosition)).toEqual([2]);
  });

  it("does not mutate its input", () => {
    const card = [makeFight(2, 4), makeFight(1, 5)];
    watchThese(card);
    expect(card.map((f) => f.cardPosition)).toEqual([2, 1]);
  });
});
