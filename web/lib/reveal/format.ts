import type { CardFighter } from "@/lib/card/types";
import { RevealFormatError } from "./errors";
import { featureLabel } from "./featureLabels";
import type { RevealResponse, ScoreAxis, ScoreFactor } from "./types";

export interface FactorView {
  label: string;
  value: string;
  /** Signed contribution to the score, e.g. "+0.55". */
  amount: string;
  /** Bar length, 0..1, relative to the strongest factor of the same axis. */
  share: number;
}

export interface AxisView {
  up: FactorView[];
  down: FactorView[];
}

export interface ScoreView {
  fight: AxisView;
  performance: (AxisView & { stars: number }) | null;
}

export interface RevealView {
  headline: string;
  method: string;
  when: string;
  scorecards: string[];
  score: ScoreView | null;
}

const MAX_UP = 4;
const MAX_DOWN = 3;

function axisView(axis: ScoreAxis): AxisView {
  const strongest = Math.max(0, ...axis.factors.map((f) => Math.abs(f.contribution)));
  const view = (factor: ScoreFactor): FactorView => {
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
    up: axis.factors.filter((f) => f.contribution > 0).slice(0, MAX_UP).map(view),
    down: axis.factors.filter((f) => f.contribution < 0).slice(0, MAX_DOWN).map(view),
  };
}

export function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/** Turns a reveal response into display lines. Names are plain text; React escapes them. */
export function formatReveal(
  response: RevealResponse,
  fighterA: CardFighter,
  fighterB: CardFighter,
): RevealView {
  let headline: string;
  if (response.outcome === "win") {
    const winner =
      response.winnerFighterId === fighterA.id
        ? fighterA
        : response.winnerFighterId === fighterB.id
          ? fighterB
          : null;
    if (winner === null) throw new RevealFormatError("winner is not one of the two fighters");
    headline = `${winner.name} wins`;
  } else {
    headline = response.outcome === "draw" ? "Draw" : "No contest";
  }
  return {
    headline,
    method: response.methodDetail ? `${response.method} · ${response.methodDetail}` : response.method,
    when: `Round ${response.endRound}, ${formatClock(response.endTimeSeconds)}`,
    scorecards: response.scorecards,
    score: response.score
      ? {
          fight: axisView(response.score.fight),
          performance: response.score.performance
            ? { ...axisView(response.score.performance), stars: response.score.performance.stars }
            : null,
        }
      : null,
  };
}
