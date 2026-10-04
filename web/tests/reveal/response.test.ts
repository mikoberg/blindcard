import { describe, expect, it } from "vitest";
import { RevealParseError } from "@/lib/reveal/errors";
import { parseRevealResponse, rowToResponse } from "@/lib/reveal/response";
import type { RevealRow } from "@/lib/reveal/types";

const row: RevealRow = {
  fight_id: "f1",
  outcome: "win",
  winner_fighter_id: "w1",
  method: "KO/TKO",
  method_detail: "Punches",
  end_round: 2,
  end_time_seconds: 123,
  scorecards: [],
  bonuses: [],
};

describe("rowToResponse", () => {
  it("maps snake_case to camelCase and keeps only strings in the arrays", () => {
    expect(rowToResponse({ ...row, scorecards: ["A 29 - 28", 7, null], bonuses: ["x"] })).toEqual({
      outcome: "win",
      winnerFighterId: "w1",
      method: "KO/TKO",
      methodDetail: "Punches",
      endRound: 2,
      endTimeSeconds: 123,
      scorecards: ["A 29 - 28"],
      bonuses: ["x"],
    });
  });

  it("treats non-array scorecards or bonuses as empty", () => {
    const mapped = rowToResponse({ ...row, scorecards: null, bonuses: "x" });
    expect(mapped.scorecards).toEqual([]);
    expect(mapped.bonuses).toEqual([]);
  });

  it("rejects an unknown outcome", () => {
    expect(() => rowToResponse({ ...row, outcome: "walkover" })).toThrow(RevealParseError);
  });
});

describe("parseRevealResponse", () => {
  const ok = rowToResponse(row);

  it("accepts a valid response", () => {
    expect(parseRevealResponse(JSON.parse(JSON.stringify(ok)))).toEqual(ok);
  });

  it.each([
    ["null", null],
    ["a string", "x"],
    ["an error body", { error: "unavailable" }],
    ["a bad outcome", { ...ok, outcome: "x" }],
    ["a win without winner", { ...ok, winnerFighterId: null }],
    ["a draw with a winner", { ...ok, outcome: "draw", winnerFighterId: "w1" }],
    ["an empty method", { ...ok, method: "" }],
    ["a fractional round", { ...ok, endRound: 1.5 }],
    ["a zero round", { ...ok, endRound: 0 }],
    ["a negative time", { ...ok, endTimeSeconds: -1 }],
    ["non-string scorecards", { ...ok, scorecards: [1] }],
    ["missing bonuses", { ...ok, bonuses: undefined }],
  ])("rejects %s", (_label, input) => {
    expect(() => parseRevealResponse(input)).toThrow(RevealParseError);
  });
});
