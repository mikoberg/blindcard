/** One rated fight of an event: card position (1 = main event) and its public star rating. */
export interface RatedSlot {
  position: number;
  stars: number;
}

/** What the overview shows of an event. Public, pre-fight facts and star ratings only. */
export interface EventSummary {
  id: string;
  slug: string;
  name: string;
  /** ISO date, e.g. "2026-09-26". */
  eventDate: string;
  location: string | null;
  /** Rated fights in card order; unrated fights are simply absent. */
  ratings: RatedSlot[];
}

export interface EventStats {
  ratedCount: number;
  bestStars: number | null;
  hiddenGems: number;
}
