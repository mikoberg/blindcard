import type { BaselineRow, JudgeRow } from "./types";

/** Fewer scorecards than this and we say nothing about a judge. */
export const MIN_CARDS = 30;
/** |z| from here on, the difference is too big to be luck (with ~60 judges, one false alarm at most). */
export const CLEAR_Z = 2.5;
/** |z| from here on, we mention it but say it could be chance. */
export const LEAN_Z = 2.0;

export type Verdict =
  "typical" | "lean-high" | "lean-low" | "clear-high" | "clear-low";

export function verdictFromZ(z: number): Verdict {
  if (z >= CLEAR_Z) return "clear-high";
  if (z <= -CLEAR_Z) return "clear-low";
  if (z >= LEAN_Z) return "lean-high";
  if (z <= -LEAN_Z) return "lean-low";
  return "typical";
}

/** The Wilson 95% interval of k out of n. */
export function wilson(k: number, n: number): [number, number] {
  if (n <= 0) return [0, 1];
  const z = 1.96;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

export interface RateComparison {
  rate: number;
  low: number;
  high: number;
  baseRate: number;
  z: number;
  verdict: Verdict;
}

/** How often a judge scored against the result, against the rate of all judges. */
export function compareRate(
  judge: JudgeRow,
  base: BaselineRow,
): RateComparison {
  const baseRate = base.cards > 0 ? base.dissent / base.cards : 0;
  const n = judge.cards;
  const expected = n * baseRate;
  const sd = Math.sqrt(n * baseRate * (1 - baseRate));
  const z = sd > 0 ? (judge.dissent - expected) / sd : 0;
  const [low, high] = wilson(judge.dissent, n);
  return {
    rate: n > 0 ? judge.dissent / n : 0,
    low,
    high,
    baseRate,
    z,
    verdict: verdictFromZ(z),
  };
}

export interface WidthComparison {
  mean: number;
  baseMean: number;
  z: number;
  verdict: Verdict;
}

/** How wide a judge scores (average points between the fighters), against all judges. */
export function compareWidth(
  judge: JudgeRow,
  base: BaselineRow,
): WidthComparison {
  const baseMean = base.cards > 0 ? base.abs_sum / base.cards : 0;
  // abs_sumsq holds the sum of margin squared, which equals the sum of |margin| squared.
  const baseVar =
    base.cards > 0 ? base.abs_sumsq / base.cards - baseMean * baseMean : 0;
  const n = judge.cards;
  const mean = n > 0 ? judge.abs_sum / n : 0;
  const se = baseVar > 0 && n > 0 ? Math.sqrt(baseVar / n) : 0;
  const z = se > 0 ? (mean - baseMean) / se : 0;
  return { mean, baseMean, z, verdict: verdictFromZ(z) };
}

export interface Dot {
  slug: string;
  name: string;
  rate: number;
}

/** The dissent rate of every judge with enough cards, for the strip chart. */
export function dotsFor(judges: readonly JudgeRow[]): Dot[] {
  return judges
    .filter((j) => j.cards >= MIN_CARDS)
    .map((j) => ({ slug: j.slug, name: j.name, rate: j.dissent / j.cards }))
    .sort((a, b) => a.rate - b.rate);
}
