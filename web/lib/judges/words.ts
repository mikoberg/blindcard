import type { Verdict } from "./stats";

/** Plain sentences for the verdicts. They speak about all scorecards, never about one fight. */
export function rateSentence(verdict: Verdict): string {
  switch (verdict) {
    case "clear-high":
      return "Scores against the official result more often than other judges.";
    case "lean-high":
      return "Scores against the official result a little more often than other judges. This could be chance.";
    case "clear-low":
      return "Scores against the official result less often than other judges.";
    case "lean-low":
      return "Scores against the official result a little less often than other judges. This could be chance.";
    default:
      return "In line with the other judges.";
  }
}

export function widthSentence(verdict: Verdict): string {
  switch (verdict) {
    case "clear-high":
      return "Scores wider than other judges: bigger gaps between the fighters.";
    case "lean-high":
      return "Scores a little wider than other judges. This could be chance.";
    case "clear-low":
      return "Scores closer than other judges: smaller gaps between the fighters.";
    case "lean-low":
      return "Scores a little closer than other judges. This could be chance.";
    default:
      return "Scores about as wide as other judges.";
  }
}

export function isNotable(verdict: Verdict): boolean {
  return verdict === "clear-high" || verdict === "clear-low";
}
