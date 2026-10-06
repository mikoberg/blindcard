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

/**
 * What an event's fights turned out to be, added up. RESULT DATA: it is only loaded after a click
 * on a spoiler warning, through `event_result_stats`, never during a page render.
 */
export interface ResultFacets {
  fights: number;
  knockouts: number;
  submissions: number;
  decisions: number;
  splitDecisions: number;
  roundOneFinishes: number;
  totalSeconds: number;
  longestSeconds: number;
  /** null when no fight of the card was finished. */
  fastestFinishSeconds: number | null;
  bonuses: number;
  upsets: number;
  knockdowns: number;
  strikes: number;
  takedowns: number;
  subAttempts: number;
  controlSeconds: number;
}

/** Result facets by event id. */
export type ResultsByEvent = Readonly<Record<string, ResultFacets>>;
