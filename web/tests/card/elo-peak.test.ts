import { describe, expect, it } from "vitest";
import { toFighterElo } from "@/lib/card/elo";

describe("toFighterElo with a peak (a fighter's own page only)", () => {
  it("reads the highest rating and its date", () => {
    expect(toFighterElo({ r: 1647.5, n: 38, pk: 1691, pd: "2020-08-29" })).toEqual({
      rating: 1647.5,
      fights: 38,
      peak: { rating: 1691, date: "2020-08-29" },
    });
  });

  it("leaves the peak out when it is missing, below the rating, or without a date", () => {
    const plain = { rating: 1700, fights: 12 };
    expect(toFighterElo({ r: 1700, n: 12 })).toEqual(plain);
    expect(toFighterElo({ r: 1700, n: 12, pk: 1650, pd: "2020-01-01" })).toEqual(plain);
    expect(toFighterElo({ r: 1700, n: 12, pk: 1750 })).toEqual(plain);
    expect(toFighterElo({ r: 1700, n: 12, pk: 1750, pd: "soon" })).toEqual(plain);
  });

  it("never shows a peak on the cards: their ratings carry none", () => {
    expect(toFighterElo({ r: 1650, n: 15 })?.peak).toBeUndefined();
  });
});
