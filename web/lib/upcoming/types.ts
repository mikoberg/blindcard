/** A fighter on an upcoming card. Linked to a stored fighter only when exactly one matched. */
export interface UpcomingFighter {
  name: string;
  /** Slug of the fighter's page, when the name matched exactly one stored fighter. */
  slug: string | null;
  country: string | null;
}

export type UpcomingSegment = "main" | "prelim" | "early_prelim";

/** One announced bout. Pre-fight facts only: no record, streak or rating-of-the-fight yet. */
export interface UpcomingBout {
  id: string;
  /** 1 = the main event. */
  position: number;
  segment: UpcomingSegment | null;
  weightClass: string | null;
  isTitleFight: boolean;
  a: UpcomingFighter;
  b: UpcomingFighter;
}

export interface UpcomingEvent {
  id: string;
  slug: string;
  name: string;
  /** ISO date, e.g. "2026-10-24". */
  eventDate: string;
  location: string | null;
  /** In card order; empty while the card is not announced. */
  bouts: UpcomingBout[];
}
