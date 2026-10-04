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

/** One feature's share of a score: weight times the normalised value, plus the raw value. */
export interface ScoreFactor {
  feature: string;
  raw: number;
  contribution: number;
}

export interface ScoreAxis {
  /** Non-zero contributions, largest magnitude first. */
  factors: ScoreFactor[];
}

export interface PerformanceAxis extends ScoreAxis {
  stars: number;
}

export interface RevealScore {
  version: number;
  /** The public rating's axis: what made the fight worth watching. */
  fight: ScoreAxis;
  /** A second axis shown only after a reveal; null when the version has none. */
  performance: PerformanceAxis | null;
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
