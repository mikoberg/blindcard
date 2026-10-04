export interface RevealResponse {
  outcome: "win" | "draw" | "no_contest";
  winnerFighterId: string | null;
  method: string;
  methodDetail: string | null;
  endRound: number;
  endTimeSeconds: number;
  scorecards: string[];
  bonuses: string[];
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
