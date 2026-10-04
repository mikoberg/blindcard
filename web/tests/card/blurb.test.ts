import { describe, expect, it } from "vitest";
import { fightBlurb } from "@/lib/card/blurb";

const base = { cardPosition: 5, isTitleFight: false, weightClass: "Lightweight", scheduledRounds: 3 };

describe("fightBlurb", () => {
  it("describes a main-event title fight", () => {
    expect(
      fightBlurb({ cardPosition: 1, isTitleFight: true, weightClass: "Lightweight", scheduledRounds: 5 }),
    ).toBe("Main event. Lightweight title fight, scheduled for five rounds.");
  });

  it("describes an ordinary bout without a role", () => {
    expect(fightBlurb({ ...base, cardPosition: 7, weightClass: "Women's Strawweight" })).toBe(
      "Women's Strawweight bout, scheduled for three rounds.",
    );
  });

  it("labels the co-main event", () => {
    expect(fightBlurb({ ...base, cardPosition: 2 })).toBe(
      "Co-main event. Lightweight bout, scheduled for three rounds.",
    );
  });

  it("copes with unknown weight class and unknown rounds", () => {
    expect(fightBlurb({ cardPosition: 2, isTitleFight: false, weightClass: null, scheduledRounds: null })).toBe(
      "Co-main event. Bout.",
    );
    expect(fightBlurb({ cardPosition: 3, isTitleFight: true, weightClass: null, scheduledRounds: 1 })).toBe(
      "Title fight, scheduled for one round.",
    );
  });

  it("treats a blank weight class as unknown and ignores impossible round counts", () => {
    expect(fightBlurb({ ...base, weightClass: "   ", scheduledRounds: 0 })).toBe("Bout.");
    expect(fightBlurb({ ...base, scheduledRounds: -2 })).toBe("Lightweight bout.");
    expect(fightBlurb({ ...base, scheduledRounds: 2.5 })).toBe("Lightweight bout.");
  });

  it("never uses a word that hints at an outcome", () => {
    const forbidden = ["finish", "knockout", "submission", "decision", "upset", "comeback", "dominant", "survived"];
    for (const cardPosition of [1, 2, 3, 6, 12]) {
      for (const isTitleFight of [true, false]) {
        for (const weightClass of [null, "Lightweight", "Women's Strawweight", "Catch Weight"]) {
          for (const scheduledRounds of [null, 1, 2, 3, 5]) {
            const text = fightBlurb({ cardPosition, isTitleFight, weightClass, scheduledRounds }).toLowerCase();
            for (const word of forbidden) expect(text).not.toContain(word);
          }
        }
      }
    }
  });
});
