/** One row of the `fighter_ratings` view: a fighter and how their rated fights score. */
export interface FighterRatingRow {
  id: string;
  name: string;
  country: string | null;
  rated_fights: number;
  /** Average of the active version's star ratings of their fights. */
  avg_stars: number | string;
  slug: string;
}

/** One row of the `fighter_fights` view: a rated fight of one fighter. */
export interface FighterFightRow {
  event_slug: string;
  event_name: string;
  event_date: string;
  opponent_name: string;
  stars: number | string;
}

/** A rated fight as the fighter page lists it. */
export interface FighterFight {
  eventSlug: string;
  eventName: string;
  eventDate: string;
  opponent: string;
  stars: number;
}

export interface FighterProfile {
  name: string;
  country: string | null;
  slug: string;
  /** Average of the ratings of `fights`, as the leaderboard shows it. */
  average: number;
  /** Newest first. */
  fights: FighterFight[];
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  slug: string;
  name: string;
  country: string | null;
  fights: number;
  /** Average of their fights' ratings. */
  average: number;
}

/** A fighter found by the search, ranked or not. */
export interface FighterSearchResult {
  slug: string;
  name: string;
  country: string | null;
  fights: number;
  average: number;
}
