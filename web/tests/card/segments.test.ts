import { describe, expect, it } from "vitest";
import { SEGMENT_LABELS, groupBySegment } from "@/lib/card/segments";
import { makeFight } from "./helpers";

describe("groupBySegment", () => {
  it("splits the card into main card, prelims and early prelims, each in card order", () => {
    const groups = groupBySegment([
      makeFight(5, 3, { cardSegment: "early_prelim" }),
      makeFight(2, 3, { cardSegment: "main" }),
      makeFight(1, 3, { cardSegment: "main" }),
      makeFight(4, 3, { cardSegment: "prelim" }),
      makeFight(3, 3, { cardSegment: "prelim" }),
    ]);
    expect(groups?.map((g) => [g.segment, g.fights.map((f) => f.cardPosition)])).toEqual([
      ["main", [1, 2]],
      ["prelim", [3, 4]],
      ["early_prelim", [5]],
    ]);
  });

  it("leaves out parts the card does not have (no early prelims)", () => {
    const groups = groupBySegment([
      makeFight(1, 3, { cardSegment: "main" }),
      makeFight(2, 3, { cardSegment: "prelim" }),
    ]);
    expect(groups?.map((g) => g.segment)).toEqual(["main", "prelim"]);
  });

  it("is all or nothing: one fight without a segment means a flat card", () => {
    expect(
      groupBySegment([makeFight(1, 3, { cardSegment: "main" }), makeFight(2, 3, { cardSegment: null })]),
    ).toBeNull();
    expect(groupBySegment([makeFight(1, 3), makeFight(2, 3)])).toBeNull();
    expect(groupBySegment([])).toBeNull();
  });

  it("names the parts the way fans do", () => {
    expect(SEGMENT_LABELS).toEqual({
      main: "Main card",
      prelim: "Prelims",
      early_prelim: "Early prelims",
    });
  });
});
