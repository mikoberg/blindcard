import { describe, expect, it } from "vitest";
import { RevealFormatError } from "@/lib/reveal/errors";
import { formatClock, formatReveal } from "@/lib/reveal/format";
import type { RevealResponse } from "@/lib/reveal/types";

const a = { id: "a1", name: "Raoni Barcelos" };
const b = { id: "b1", name: "Raul Rosas Jr." };

const base: RevealResponse = {
  outcome: "win",
  winnerFighterId: "b1",
  method: "KO/TKO",
  methodDetail: "Punches",
  endRound: 5,
  endTimeSeconds: 98,
  scorecards: [],
  bonuses: [],
};

describe("formatClock", () => {
  it("formats m:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(98)).toBe("1:38");
    expect(formatClock(300)).toBe("5:00");
    expect(formatClock(605)).toBe("10:05");
  });
});

describe("formatReveal", () => {
  it("names the winner from the two fighters on the page", () => {
    expect(formatReveal(base, a, b)).toEqual({
      headline: "Raul Rosas Jr. wins",
      method: "KO/TKO · Punches",
      when: "Round 5, 1:38",
      scorecards: [],
    });
  });

  it("omits the detail when there is none and lists scorecards for decisions", () => {
    const view = formatReveal(
      { ...base, winnerFighterId: "a1", method: "Decision - Split", methodDetail: null, endRound: 3, endTimeSeconds: 300, scorecards: ["Mike Bell 28 - 29"] },
      a,
      b,
    );
    expect(view.headline).toBe("Raoni Barcelos wins");
    expect(view.method).toBe("Decision - Split");
    expect(view.scorecards).toEqual(["Mike Bell 28 - 29"]);
  });

  it("shows a draw and a no contest without naming anyone", () => {
    expect(formatReveal({ ...base, outcome: "draw", winnerFighterId: null }, a, b).headline).toBe("Draw");
    expect(formatReveal({ ...base, outcome: "no_contest", winnerFighterId: null }, a, b).headline).toBe("No contest");
  });

  it("refuses a winner who is not one of the two fighters", () => {
    expect(() => formatReveal({ ...base, winnerFighterId: "zzz" }, a, b)).toThrow(RevealFormatError);
  });

  it("passes awkward names through untouched (escaping is the renderer's job)", () => {
    const odd = { id: "b1", name: `<b>O'Malley</b> "Sean" Ünal` };
    expect(formatReveal(base, a, odd).headline).toBe(`<b>O'Malley</b> "Sean" Ünal wins`);
  });
});
