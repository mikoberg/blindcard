import { describe, expect, it } from "vitest";
import { buildScoreBreakdown } from "@/lib/reveal/breakdown";
import type { ScoreRow } from "@/lib/reveal/types";

const row: ScoreRow = {
  fight_id: "f1",
  version: 2,
  composite: 1.2,
  config: {
    version: 2,
    weights: { pace: 1, control_share_nofinish: -0.5, swings: 0.4, knockdowns: 0.8 },
    performance_weights: { ko_finish: 1, time_fraction: -0.5 },
  },
  features: {
    raw: {
      pace: 9,
      control_share_nofinish: 0.6,
      swings: 0,
      knockdowns: 1,
      ko_finish: 1,
      time_fraction: 0.2,
    },
    normalised: {
      pace: 0.5,
      control_share_nofinish: 0.6,
      swings: 0,
      knockdowns: 0.5,
      ko_finish: 1,
      time_fraction: 0.2,
    },
    performance: { composite: 0.9, percentile: 92, stars: 4.5 },
  },
};

describe("buildScoreBreakdown", () => {
  it("turns weight times normalised value into signed factors, largest first", () => {
    const score = buildScoreBreakdown(row);
    expect(score?.version).toBe(2);
    expect(score?.fight.factors.map((f) => [f.feature, +f.contribution.toFixed(3)])).toEqual([
      ["pace", 0.5],
      ["knockdowns", 0.4],
      ["control_share_nofinish", -0.3],
    ]);
    expect(score?.fight.factors[0]).toMatchObject({ raw: 9 });
  });

  it("drops features that contributed nothing", () => {
    const features = buildScoreBreakdown(row)?.fight.factors.map((f) => f.feature);
    expect(features).not.toContain("swings");
  });

  it("adds the private performance axis with its stars", () => {
    const score = buildScoreBreakdown(row);
    expect(score?.performance?.stars).toBe(4.5);
    expect(score?.performance?.factors.map((f) => f.feature)).toEqual(["ko_finish", "time_fraction"]);
  });

  it("has no performance axis for a version without one", () => {
    const config = { version: 1, weights: (row.config as { weights: object }).weights };
    expect(buildScoreBreakdown({ ...row, config })?.performance).toBeNull();
  });

  it("ignores a performance block with invalid stars", () => {
    const features = { ...(row.features as object), performance: { stars: 4.3 } };
    expect(buildScoreBreakdown({ ...row, features })?.performance).toBeNull();
  });

  it.each([
    ["config is not an object", { config: "x" }],
    ["features are missing the raw values", { features: { normalised: {} } }],
    ["a weight is not a number", { config: { weights: { pace: "1" } } }],
    ["a weighted feature has no stored value", { config: { weights: { pace: 1, charisma: 1 } } }],
    ["a stored value is NaN-like", { features: { raw: { pace: null }, normalised: { pace: 1 } } }],
    ["version is not an integer", { version: 1.5 }],
  ])("returns null instead of failing when %s", (_label, patch) => {
    expect(buildScoreBreakdown({ ...row, ...patch } as ScoreRow)).toBeNull();
  });
});
