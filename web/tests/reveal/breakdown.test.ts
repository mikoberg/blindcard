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
  it("words the factors for display: signed amounts, readable values, largest first", () => {
    const score = buildScoreBreakdown(row);
    expect(score?.version).toBe(2);
    expect(score?.fight.up).toEqual([
      { label: "Striking pace", value: "9.0 strikes per min", amount: "+0.50", share: 1 },
      { label: "Knockdowns", value: "1", amount: "+0.40", share: 0.8 },
    ]);
    expect(score?.fight.down).toEqual([
      { label: "Time under control without a finish", value: "60%", amount: "−0.30", share: 0.6 },
    ]);
  });

  it("drops features that contributed nothing", () => {
    const labels = [...(buildScoreBreakdown(row)?.fight.up ?? []), ...(buildScoreBreakdown(row)?.fight.down ?? [])];
    expect(labels.map((f) => f.label)).not.toContain("Round-to-round lead changes");
  });

  it("adds the private performance axis with its stars", () => {
    const score = buildScoreBreakdown(row);
    expect(score?.performance?.stars).toBe(4.5);
    expect(score?.performance?.up[0]).toMatchObject({ label: "Ended by KO/TKO", value: "yes" });
    expect(score?.performance?.down[0]).toMatchObject({ label: "Share of the scheduled time used" });
  });

  it("caps the lists and survives a feature it has no label for", () => {
    const weights: Record<string, number> = { brand_new: 2 };
    const raw: Record<string, number> = { brand_new: 3 };
    const normalised: Record<string, number> = { brand_new: 1 };
    for (let i = 0; i < 8; i++) {
      weights[`knockdowns_${i}`] = 1;
    }
    const config = { weights: { pace: 1, knockdowns: 1, swings: 1, reversals: 1, sub_attempts: 1, ...weights } };
    for (const key of Object.keys(config.weights)) {
      raw[key] = raw[key] ?? 1;
      normalised[key] = normalised[key] ?? 0.5;
    }
    const score = buildScoreBreakdown({ ...row, config, features: { raw, normalised } });
    expect(score?.fight.up).toHaveLength(4);
    expect(score?.fight.up[0].label).toBe("brand new");
    expect(score?.performance).toBeNull();
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

describe("the breakdown of score v23", () => {
  it("labels the stalling feature in plain words and shows its share", () => {
    const v23: ScoreRow = {
      ...row,
      version: 23,
      config: { version: 23, weights: { pace: 1, control_stalling: -0.5 } },
      features: {
        raw: { pace: 9, control_stalling: 0.45 },
        normalised: { pace: 0.5, control_stalling: 0.45 },
      },
    };
    const down = buildScoreBreakdown(v23)?.fight.down ?? [];
    expect(down).toHaveLength(1);
    expect(down[0]?.label).toBe("Time under control without much action");
    expect(down[0]?.value).toBe("45%");
  });
});
