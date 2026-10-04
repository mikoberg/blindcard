export interface RevealResponse {
  outcome: "win" | "draw" | "no_contest";
  winnerFighterId: string | null;
  method: string;
  methodDetail: string | null;
  endRound: number;
  endTimeSeconds: number;
  scorecards: string[];
  bonuses: string[];
  /** Why the fight got its rating; null when the database has no features for the active version. */
  score: RevealScore | null;
}

/** One line of "why this rating", already worded and formatted by the server. */
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

export interface PerformanceView extends AxisView {
  stars: number;
}

export interface RevealScore {
  version: number;
  /** The public rating's axis: what made the fight worth watching. */
  fight: AxisView;
  /** A second axis shown only after a reveal; null when the version has none. */
  performance: PerformanceView | null;
}

/** One row of the database function reveal_score(). */
export interface ScoreRow {
  fight_id: string;
  version: number;
  config: unknown;
  features: unknown;
  composite: number;
}

/** One row of the database function reveal_fight(). */
export interface RevealRow {
  fight_id: string;
  outcome: string;
  winner_fighter_id: string | null;
  method: string;
  method_detail: string | null;
  end_round: number;
  end_time_seconds: number;
  scorecards: unknown;
  bonuses: unknown;
}
