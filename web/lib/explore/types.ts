import type { EventSummary } from "@/lib/overview/types";

/**
 * What an event's fights were BEFORE they happened, added up: title fights, the Elo going in, the
 * UFC ranks going in, rematches and so on. Public, pre-fight facts only (the `event_facets` view);
 * nothing in it comes from a result.
 */
export interface EventFacets {
  titleFights: number;
  fiveRoundFights: number;
  womensFights: number;
  rematches: number;
  longestStreak: number;
  evenFights: number;
  /** null when no fight has two established ratings. */
  eloGapAvg: number | null;
  eloAvg: number | null;
  eloPeak: number | null;
  rankedFighters: number;
  champions: number;
  top5Fighters: number;
  rankedBouts: number;
  weightClasses: string[];
  /** Lower-case country codes of the fighters on the card. */
  countries: string[];
}

/** An event of the overview with its public facets (null when the facets could not be read). */
export interface ExploreEvent extends EventSummary {
  facets: EventFacets | null;
}
