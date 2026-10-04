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
      score: null,
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

describe("the score breakdown in a reveal response", () => {
  const line = { label: "Striking pace", value: "9.0 strikes per min", amount: "+0.50", share: 1 };
  const score = {
    version: 2,
    fight: { up: [line], down: [] },
    performance: { stars: 4.5, up: [line], down: [] },
  };

  it("is carried through the database mapping and the browser parse", () => {
    const response = rowToResponse(row, score);
    expect(response.score).toEqual(score);
    expect(parseRevealResponse(JSON.parse(JSON.stringify(response))).score).toEqual(score);
  });

  it("is optional: no score, or a response from before it existed, parses to null", () => {
    expect(parseRevealResponse({ ...rowToResponse(row), score: undefined }).score).toBeNull();
    expect(parseRevealResponse(rowToResponse(row)).score).toBeNull();
  });

  it.each([
    ["a non-object score", "x"],
    ["a fractional version", { ...score, version: 1.5 }],
    ["a missing axis", { ...score, fight: {} }],
    ["a factor without a label", { ...score, fight: { up: [{ ...line, label: undefined }], down: [] } }],
    ["a bar share above 1", { ...score, fight: { up: [{ ...line, share: 2 }], down: [] } }],
    ["a numeric amount", { ...score, fight: { up: [{ ...line, amount: 0.5 }], down: [] } }],
    ["invalid performance stars", { ...score, performance: { ...score.performance, stars: 4.3 } }],
  ])("rejects %s", (_label, bad) => {
    expect(() => parseRevealResponse({ ...rowToResponse(row), score: bad })).toThrow(RevealParseError);
  });
});
