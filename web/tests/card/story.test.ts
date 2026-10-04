import { describe, expect, it } from "vitest";
import { storyLabels } from "@/lib/card/story";
import { makeFight } from "./helpers";

const career = (meetings: number, a: [number, boolean], b: [number, boolean]) => ({
  meetings,
  a: { streak: a[0], unbeaten: a[1] },
  b: { streak: b[0], unbeaten: b[1] },
});

describe("storyLabels", () => {
  it("has nothing to say without context or without a story", () => {
    expect(storyLabels(makeFight(1, 4))).toEqual([]);
    expect(storyLabels(makeFight(1, 4, { career: career(0, [0, false], [2, false]) }))).toEqual([]);
  });

  it("names a rematch, and later meetings by number", () => {
    expect(storyLabels(makeFight(1, 4, { career: career(1, [0, false], [0, false]) }))).toEqual(["Rematch"]);
    expect(storyLabels(makeFight(1, 4, { career: career(2, [0, false], [0, false]) }))).toEqual([
      "Meeting number 3",
    ]);
  });

  it("names a win streak of three or more, and an unbeaten fighter instead of a streak", () => {
    const fight = makeFight(1, 4, {
      fighterA: { id: "a", name: "Ann One" },
      fighterB: { id: "b", name: "Bea Two" },
      career: career(0, [4, false], [7, true]),
    });
    expect(storyLabels(fight)).toEqual(["Ann One has won 4 in a row", "Bea Two is unbeaten in the promotion"]);
  });

  it("keeps a fixed order: rematch, fighter A, fighter B", () => {
    const fight = makeFight(1, 4, { career: career(1, [3, false], [5, false]) });
    expect(storyLabels(fight)[0]).toBe("Rematch");
    expect(storyLabels(fight)).toHaveLength(3);
  });

  it("says nothing about a short streak", () => {
    expect(storyLabels(makeFight(1, 4, { career: career(0, [2, false], [1, false]) }))).toEqual([]);
  });
});
