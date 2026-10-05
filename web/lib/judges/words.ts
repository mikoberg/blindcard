import type { Verdict } from "./stats";

/** Plain sentences for the verdicts. They speak about all scorecards, never about one fight. */
export function rateSentence(verdict: Verdict): string {
  switch (verdict) {
    case "clear-high":
      return "Scorecards differ from the official result more often than other judges' do.";
    case "lean-high":
      return "Scorecards differ from the official result a little more often than other judges' do. This could be chance.";
    case "clear-low":
      return "Scorecards differ from the official result less often than other judges' do.";
    case "lean-low":
      return "Scorecards differ from the official result a little less often than other judges' do. This could be chance.";
    default:
      return "In line with the other judges.";
  }
}

export function widthSentence(verdict: Verdict): string {
  switch (verdict) {
    case "clear-high":
      return "Scorecards show wider gaps between the fighters than other judges' do.";
    case "lean-high":
      return "Scorecards show slightly wider gaps than other judges' do. This could be chance.";
    case "clear-low":
      return "Scorecards show narrower gaps between the fighters than other judges' do.";
    case "lean-low":
      return "Scorecards show slightly narrower gaps than other judges' do. This could be chance.";
    default:
      return "Scorecards show about the same gaps as other judges' do.";
  }
}

export function isNotable(verdict: Verdict): boolean {
  return verdict === "clear-high" || verdict === "clear-low";
}
