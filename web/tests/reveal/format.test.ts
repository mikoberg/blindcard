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
  score: null,
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
      score: null,
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

  it("turns the score into helped / held-back factors with readable values", () => {
    const score = {
      version: 2,
      fight: {
        factors: [
          { feature: "pace", raw: 9.04, contribution: 0.5 },
          { feature: "knockdowns", raw: 1, contribution: 0.4 },
          { feature: "control_share_nofinish", raw: 0.6, contribution: -0.3 },
        ],
      },
      performance: {
        stars: 4.5,
        factors: [{ feature: "ko_finish", raw: 1, contribution: 1 }],
      },
    };
    const view = formatReveal({ ...base, score }, a, b).score;
    expect(view?.fight.up).toEqual([
      { label: "Striking pace", value: "9.0 strikes per min", amount: "+0.50", share: 1 },
      { label: "Knockdowns", value: "1", amount: "+0.40", share: 0.8 },
    ]);
    expect(view?.fight.down).toEqual([
      { label: "Time under control without a finish", value: "60%", amount: "−0.30", share: 0.6 },
    ]);
    expect(view?.performance?.stars).toBe(4.5);
    expect(view?.performance?.up[0]).toMatchObject({ label: "Ended by KO/TKO", value: "yes" });
  });

  it("caps the lists and survives a feature it has no label for", () => {
    const factors = Array.from({ length: 9 }, (_, i) => ({
      feature: i === 0 ? "new_thing" : "pace",
      raw: 2,
      contribution: 1 - i * 0.1,
    }));
    const view = formatReveal({ ...base, score: { version: 3, fight: { factors }, performance: null } }, a, b);
    expect(view.score?.fight.up).toHaveLength(4);
    expect(view.score?.fight.up[0].label).toBe("new thing");
    expect(view.score?.performance).toBeNull();
  });

  it("refuses a winner who is not one of the two fighters", () => {
    expect(() => formatReveal({ ...base, winnerFighterId: "zzz" }, a, b)).toThrow(RevealFormatError);
  });

  it("passes awkward names through untouched (escaping is the renderer's job)", () => {
    const odd = { id: "b1", name: `<b>O'Malley</b> "Sean" Ünal` };
    expect(formatReveal(base, a, odd).headline).toBe(`<b>O'Malley</b> "Sean" Ünal wins`);
  });
});
