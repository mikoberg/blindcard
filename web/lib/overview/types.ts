/** One rated fight of an event: card position (1 = main event) and its public star rating. */
export interface RatedSlot {
  position: number;
  stars: number;
}

/** The main event: two fighters (in the usual a/b order, never by result) and the title flag. */
export interface MainEvent {
  a: string;
  b: string;
  title: boolean;
}

/** What the overview shows of an event. Public, pre-fight facts and star ratings only. */
export interface EventSummary {
  id: string;
  slug: string;
  name: string;
  /** ISO date, e.g. "2026-09-26". */
  eventDate: string;
  location: string | null;
  /** null when the event's card is not known. */
  mainEvent: MainEvent | null;
  /** Rated fights in card order; unrated fights are simply absent. */
  ratings: RatedSlot[];
}

export interface EventStats {
  ratedCount: number;
  /** Average of all the fight ratings on the card, one decimal; null when nothing is rated. */
  cardRating: number | null;
  /** Fights rated five stars. */
  classics: number;
  hiddenGems: number;
}
