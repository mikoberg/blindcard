/** One row of the `fighter_ratings` view: a fighter and how their rated fights score. */
export interface FighterRatingRow {
  id: string;
  name: string;
  country: string | null;
  rated_fights: number;
  /** Average of the active version's star ratings of their fights. */
  avg_stars: number | string;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  country: string | null;
  fights: number;
  /** Average of their fights' ratings. */
  average: number;
}
