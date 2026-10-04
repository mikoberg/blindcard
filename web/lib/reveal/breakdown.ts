import { isValidStars } from "@/lib/card/stars";
import type { PerformanceAxis, RevealScore, ScoreAxis, ScoreFactor, ScoreRow } from "./types";

type NumberMap = Record<string, number>;

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

function axisOf(weights: NumberMap, raw: NumberMap, normalised: NumberMap): ScoreAxis | null {
  const factors: ScoreFactor[] = [];
  for (const [feature, weight] of Object.entries(weights)) {
    if (!(feature in raw) || !(feature in normalised)) return null;
    const contribution = weight * normalised[feature];
    if (contribution !== 0) factors.push({ feature, raw: raw[feature], contribution });
  }
  factors.sort(
    (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution) || a.feature.localeCompare(b.feature),
  );
  return { factors };
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

  const fight = axisOf(weights, raw, normalised);
  if (fight === null) return null;

  let performance: PerformanceAxis | null = null;
  const performanceWeights = numberMap(row.config.performance_weights);
  const stored = row.features.performance;
  if (performanceWeights !== null && isRecord(stored) && isValidStars(stored.stars)) {
    const axis = axisOf(performanceWeights, raw, normalised);
    if (axis !== null) performance = { ...axis, stars: stored.stars };
  }
  return { version: row.version, fight, performance };
}
