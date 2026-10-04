import type { CardFighter } from "@/lib/card/types";
import { RevealFormatError } from "./errors";
import type { RevealResponse, RevealScore } from "./types";

export type { AxisView, FactorView } from "./types";
/** What the panel shows of the score: the server's wording, without the version number. */
export type ScoreView = Omit<RevealScore, "version">;

export interface RevealView {
  headline: string;
  method: string;
  when: string;
  scorecards: string[];
  score: ScoreView | null;
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
    score: response.score ? { fight: response.score.fight, performance: response.score.performance } : null,
  };
}
