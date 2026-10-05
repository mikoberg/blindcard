import { describe, expect, it } from "vitest";
import {
  MIN_CARDS,
  compareRate,
  compareWidth,
  dotsFor,
  verdictFromZ,
  wilson,
} from "@/lib/judges/stats";
import type { BaselineRow, JudgeRow } from "@/lib/judges/types";

const baseline: BaselineRow = {
  cards: 10000,
  dissent: 700,
  abs_sum: 20600,
  abs_sumsq: 46000,
  judges_with_enough: 50,
};
const judge = (patch: Partial<JudgeRow> = {}): JudgeRow => ({
  slug: "ann-one",
  name: "Ann One",
  slugs: ["ann-one"],
  cards: 400,
  dissent: 28,
  lone_dissent: 12,
  abs_sum: 824,
  abs_sumsq: 1840,
  first_year: 2012,
  last_year: 2026,
  ...patch,
});

describe("verdictFromZ", () => {
  it("is typical inside two standard errors, a lean up to 2.5 and clear beyond", () => {
    expect(verdictFromZ(0)).toBe("typical");
    expect(verdictFromZ(1.99)).toBe("typical");
    expect(verdictFromZ(2.2)).toBe("lean-high");
    expect(verdictFromZ(-2.2)).toBe("lean-low");
    expect(verdictFromZ(2.5)).toBe("clear-high");
    expect(verdictFromZ(-3)).toBe("clear-low");
  });
});

describe("wilson", () => {
  it("brackets the observed rate and stays inside 0..1", () => {
    const [low, high] = wilson(28, 400);
    expect(low).toBeLessThan(0.07);
    expect(high).toBeGreaterThan(0.07);
    expect(wilson(0, 50)[0]).toBe(0);
    expect(wilson(50, 50)[1]).toBe(1);
  });
});

describe("compareRate", () => {
  it("calls a judge at the average typical", () => {
    const result = compareRate(judge(), baseline);
    expect(result.baseRate).toBeCloseTo(0.07);
    expect(result.rate).toBeCloseTo(0.07);
    expect(result.verdict).toBe("typical");
  });

  it("calls a clearly higher rate clear, and a slightly higher one only a lean", () => {
    expect(
      compareRate(judge({ cards: 120, dissent: 17 }), baseline).verdict,
    ).toBe("clear-high");
    expect(
      compareRate(judge({ cards: 400, dissent: 40 }), baseline).verdict,
    ).toBe("lean-high");
    expect(
      compareRate(judge({ cards: 146, dissent: 2 }), baseline).verdict,
    ).toBe("clear-low");
  });
});

describe("compareWidth", () => {
  it("compares the average points between the fighters with all judges", () => {
    const result = compareWidth(judge(), baseline);
    expect(result.baseMean).toBeCloseTo(2.06);
    expect(result.mean).toBeCloseTo(2.06);
    expect(result.verdict).toBe("typical");
    expect(
      compareWidth(judge({ abs_sum: 1000, abs_sumsq: 2800 }), baseline).verdict,
    ).toBe("clear-high");
  });
});

describe("dotsFor", () => {
  it("keeps judges with enough cards, ordered by rate", () => {
    const dots = dotsFor([
      judge({ slug: "a", name: "A", cards: MIN_CARDS, dissent: 6 }),
      judge({ slug: "b", name: "B", cards: MIN_CARDS - 1, dissent: 1 }),
      judge({ slug: "c", name: "C", cards: 100, dissent: 3 }),
    ]);
    expect(dots.map((d) => d.slug)).toEqual(["c", "a"]);
  });
});
