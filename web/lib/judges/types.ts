/** One row of `judge_stats`: counts and sums only (no fight, event or score of a single bout). */
export interface JudgeRow {
  slug: string;
  name: string;
  /** Every spelling of the name that links to this judge. */
  slugs: string[];
  cards: number;
  /** Scorecards that put the other fighter ahead of the official result. */
  dissent: number;
  /** ... while both other judges agreed with the result. */
  lone_dissent: number;
  abs_sum: number;
  abs_sumsq: number;
  first_year: number;
  last_year: number;
}

/** The totals of all judges (`judge_baseline`). */
export interface BaselineRow {
  cards: number;
  dissent: number;
  abs_sum: number;
  abs_sumsq: number;
  judges_with_enough: number;
}
