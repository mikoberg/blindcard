// SERVER ONLY (imported by lib/reveal/service.ts and nothing the browser loads).
// It names result-like features ("Ended by KO/TKO", "How early the finish came"); that
// vocabulary must never ship in a client bundle, so the labels are turned into display
// strings here and the browser only ever receives the finished text after a reveal.
import { isValidStars } from "@/lib/card/stars";
import { featureLabel } from "./featureLabels";
import type { AxisView, FactorView, PerformanceView, RevealScore, ScoreRow } from "./types";

type NumberMap = Record<string, number>;

interface Factor {
  feature: string;
  raw: number;
  contribution: number;
}

const MAX_UP = 4;
const MAX_DOWN = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A plain object whose values are all finite numbers; anything else is not usable. */
function numberMap(value: unknown): NumberMap | null {
  if (!isRecord(value)) return null;
  const result: NumberMap = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "number" || !Number.isFinite(item)) return null;
    result[key] = item;
  }
  return result;
}

/** Non-zero contributions (weight times normalised value), largest magnitude first. */
function factorsOf(weights: NumberMap, raw: NumberMap, normalised: NumberMap): Factor[] | null {
  const factors: Factor[] = [];
  for (const [feature, weight] of Object.entries(weights)) {
    if (!(feature in raw) || !(feature in normalised)) return null;
    const contribution = weight * normalised[feature];
    if (contribution !== 0) factors.push({ feature, raw: raw[feature], contribution });
  }
  factors.sort(
    (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution) || a.feature.localeCompare(b.feature),
  );
  return factors;
}

function axisView(factors: Factor[]): AxisView {
  const strongest = Math.max(0, ...factors.map((f) => Math.abs(f.contribution)));
  const view = (factor: Factor): FactorView => {
    const { label, value } = featureLabel(factor.feature, factor.raw);
    const sign = factor.contribution > 0 ? "+" : "−";
    return {
      label,
      value,
      amount: `${sign}${Math.abs(factor.contribution).toFixed(2)}`,
      share: strongest === 0 ? 0 : Math.abs(factor.contribution) / strongest,
    };
  };
  return {
    up: factors.filter((f) => f.contribution > 0).slice(0, MAX_UP).map(view),
    down: factors.filter((f) => f.contribution < 0).slice(0, MAX_DOWN).map(view),
  };
}

/**
 * Builds "why this rating" from the stored features and the weights of the same score version.
 * Returns null for anything that does not have the expected shape: the breakdown is an extra,
 * never a reason to fail the reveal.
 */
export function buildScoreBreakdown(row: ScoreRow): RevealScore | null {
  if (!Number.isInteger(row.version) || !isRecord(row.config) || !isRecord(row.features)) return null;
  const weights = numberMap(row.config.weights);
  const raw = numberMap(row.features.raw);
  const normalised = numberMap(row.features.normalised);
  if (weights === null || raw === null || normalised === null) return null;

  const fight = factorsOf(weights, raw, normalised);
  if (fight === null) return null;

  let performance: PerformanceView | null = null;
  const performanceWeights = numberMap(row.config.performance_weights);
  const stored = row.features.performance;
  if (performanceWeights !== null && isRecord(stored) && isValidStars(stored.stars)) {
    const factors = factorsOf(performanceWeights, raw, normalised);
    if (factors !== null) performance = { ...axisView(factors), stars: stored.stars };
  }
  return { version: row.version, fight: axisView(fight), performance };
}
